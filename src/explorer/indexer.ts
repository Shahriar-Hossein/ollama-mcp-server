import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import Parser from "tree-sitter";
import Go from "tree-sitter-go";
import JavaScript from "tree-sitter-javascript";
import PHP from "tree-sitter-php";
import Python from "tree-sitter-python";
import TypeScript from "tree-sitter-typescript";
import { parseSource } from "./parse.js";
import { SourceOffsets } from "./source-offsets.js";

export const SYMBOL_SCHEMA_VERSION = 1;

export type SymbolKind =
  | "class"
  | "interface"
  | "trait"
  | "enum"
  | "function"
  | "method"
  | "constructor"
  | "property"
  | "constant"
  | "type"
  | "namespace"
  | "module"
  | "variable"
  | "unknown";

/** How confidently the indexer resolved a relationship from source. */
export type ResolutionQuality = "exact" | "static" | "heuristic" | "unresolved";

export interface SourcePosition {
  line: number;
  column: number;
  byte: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface SymbolRecord {
  schema_version: typeof SYMBOL_SCHEMA_VERSION;
  id: string;
  repository_root: ".";
  commit_hash: string;
  file: string;
  language: "typescript" | "javascript" | "php" | "python" | "go";
  kind: SymbolKind;
  name: string;
  qualified_name: string;
  parent_id: string | null;
  range: SourceRange;
  selection_range: SourceRange;
  signature: string;
}

export interface ReferenceRecord {
  file: string;
  range: SourceRange;
  name: string;
  source_symbol_id: string | null;
  target_symbol_id: string | null;
  resolution: ResolutionQuality;
}

export interface DependencyRecord {
  file: string;
  range: SourceRange;
  module_specifier: string;
  target_file: string | null;
  resolution: ResolutionQuality;
}

export interface InheritanceEdge {
  kind: "extends" | "implements";
  child_symbol_id: string;
  parent_name: string;
  parent_symbol_id: string | null;
  file: string;
  range: SourceRange;
  resolution: ResolutionQuality;
}

export interface CallEdge {
  caller_symbol_id: string | null;
  callee_name: string;
  callee_symbol_id: string | null;
  file: string;
  range: SourceRange;
  resolution: ResolutionQuality;
  /** Source text of the nearest enclosing `if` condition gating this call, negated if reached via its `else` branch. Null if the call isn't conditionally guarded, or the guard sits outside the call's own function scope. */
  guard_condition: string | null;
}

export interface TestRecord {
  file: string;
  range: SourceRange;
  name: string;
  kind: "suite" | "test";
  framework: "jest" | "mocha" | "vitest" | "unknown";
}

/** A source-backed use of a production symbol inside a discovered test case. */
export interface TestSymbolEdge {
  test_file: string;
  test_name: string;
  test_range: SourceRange;
  target_symbol_id: string;
  resolution: ResolutionQuality;
}

export interface RepositoryIndex {
  commit_hash: string;
  files_indexed: number;
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  dependencies: DependencyRecord[];
  inheritance: InheritanceEdge[];
  calls: CallEdge[];
  tests: TestRecord[];
  test_symbols: TestSymbolEdge[];
}

type SupportedLanguage = SymbolRecord["language"];

interface Declaration {
  kind: SymbolKind;
  name: string;
  nameNode: Parser.SyntaxNode;
  qualifiedPrefix?: string;
}

const LANGUAGE_BY_EXTENSION: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".php": "php",
  ".py": "python",
  ".go": "go",
};

function command(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function trackedSourceFiles(root: string): string[] {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => languageForPath(path) !== null);
  return paths.sort();
}

function languageForPath(path: string): SupportedLanguage | null {
  const extension = path.slice(path.lastIndexOf("."));
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
}

function parserFor(language: SupportedLanguage, file: string): Parser {
  const parser = new Parser();
  parser.setLanguage(
    language === "go"
      ? Go
      : language === "python"
        ? Python
        : language === "php"
          ? PHP.php
          : language === "typescript"
            ? file.endsWith(".tsx")
              ? TypeScript.tsx
              : TypeScript.typescript
            : JavaScript,
  );
  return parser;
}

function position(node: Parser.SyntaxNode, edge: "start" | "end"): SourcePosition {
  const point = edge === "start" ? node.startPosition : node.endPosition;
  return {
    line: point.row + 1,
    column: point.column + 1,
    byte: edge === "start" ? node.startIndex : node.endIndex,
  };
}

function range(node: Parser.SyntaxNode): SourceRange {
  return { start: position(node, "start"), end: position(node, "end") };
}

function nameFrom(node: Parser.SyntaxNode | null): string | null {
  if (!node || !node.isNamed || !node.text) return null;
  return node.text;
}

const PHP_DECLARATIONS: Record<string, SymbolKind> = {
  function_definition: "function",
  class_declaration: "class",
  interface_declaration: "interface",
  trait_declaration: "trait",
  enum_declaration: "enum",
  method_declaration: "method",
  enum_case: "constant",
};

function phpDeclarationFor(node: Parser.SyntaxNode): Declaration | null {
  const nameNode = node.childForFieldName("name");
  const kind = PHP_DECLARATIONS[node.type];
  if (kind) {
    const name = nameFrom(nameNode);
    if (!name) return null;
    return {
      kind: kind === "method" && name === "__construct" ? "constructor" : kind,
      name,
      nameNode: nameNode!,
    };
  }
  if (node.type === "namespace_definition") {
    return nameNode ? { kind: "namespace", name: nameNode.text, nameNode } : null;
  }
  if (node.type === "const_element") {
    const constName = node.namedChildren.find((child) => child.type === "name");
    return constName ? { kind: "constant", name: constName.text, nameNode: constName } : null;
  }
  if (node.type === "property_element") {
    const variable = node.childForFieldName("name");
    const propertyName = variable?.namedChildren.find((child) => child.type === "name");
    return variable && propertyName
      ? { kind: "property", name: propertyName.text, nameNode: propertyName }
      : null;
  }
  return null;
}

function pythonDeclarationFor(node: Parser.SyntaxNode): Declaration | null {
  if (node.type !== "class_definition" && node.type !== "function_definition") return null;
  const nameNode = node.childForFieldName("name");
  const name = nameFrom(nameNode);
  if (!name || !nameNode) return null;
  if (node.type === "class_definition") return { kind: "class", name, nameNode };
  let scope = node.parent;
  if (scope?.type === "decorated_definition") scope = scope.parent;
  const inClass = scope?.type === "block" && scope.parent?.type === "class_definition";
  if (!inClass) return { kind: "function", name, nameNode };
  return { kind: name === "__init__" ? "constructor" : "method", name, nameNode };
}

function declarationFor(node: Parser.SyntaxNode, language: SupportedLanguage): Declaration | null {
  if (language === "php") return phpDeclarationFor(node);
  if (language === "python") return pythonDeclarationFor(node);
  const name = nameFrom(node.childForFieldName("name"));
  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration":
      return name ? { kind: "function", name, nameNode: node.childForFieldName("name")! } : null;
    case "class_declaration":
    case "abstract_class_declaration":
      return name ? { kind: "class", name, nameNode: node.childForFieldName("name")! } : null;
    case "interface_declaration":
      return name ? { kind: "interface", name, nameNode: node.childForFieldName("name")! } : null;
    case "enum_declaration":
      return name ? { kind: "enum", name, nameNode: node.childForFieldName("name")! } : null;
    case "type_alias_declaration":
      return name ? { kind: "type", name, nameNode: node.childForFieldName("name")! } : null;
    case "internal_module":
    case "namespace_declaration":
      return name ? { kind: "namespace", name, nameNode: node.childForFieldName("name")! } : null;
    case "method_definition":
    case "method_signature":
      return name ? { kind: "method", name, nameNode: node.childForFieldName("name")! } : null;
    case "constructor_signature":
    case "constructor_declaration":
      return { kind: "constructor", name: "constructor", nameNode: node };
    case "public_field_definition":
    case "property_signature":
      return name ? { kind: "property", name, nameNode: node.childForFieldName("name")! } : null;
    case "variable_declarator": {
      const variableName = nameFrom(node.childForFieldName("name"));
      if (!variableName) return null;
      const value = node.childForFieldName("value");
      const kind =
        value?.type === "arrow_function" || value?.type === "function_expression"
          ? "function"
          : "variable";
      return { kind, name: variableName, nameNode: node.childForFieldName("name")! };
    }
    default:
      return null;
  }
}

function goDeclarationsFor(node: Parser.SyntaxNode): Declaration[] {
  if (node.hasError) return [];
  const nameNode = node.childForFieldName("name");
  if (node.type === "function_declaration" || node.type === "method_declaration") {
    if (!nameNode) return [];
    const receiver = node.childForFieldName("receiver")?.namedChildren[0]?.childForFieldName("type");
    return [
      {
        kind: receiver ? "method" : "function",
        name: nameNode.text,
        nameNode,
        qualifiedPrefix: receiver?.text.replace(/^\*/, ""),
      },
    ];
  }
  if (node.type === "type_spec" || node.type === "type_alias") {
    if (!nameNode || node.parent?.parent?.type !== "source_file") return [];
    return [
      {
        kind: node.childForFieldName("type")?.type === "interface_type" ? "interface" : "type",
        name: nameNode.text,
        nameNode,
      },
    ];
  }
  const holder = node.parent?.type === "var_spec_list" ? node.parent.parent : node.parent;
  if (["const_spec", "var_spec"].includes(node.type) && holder?.parent?.type === "source_file") {
    return node.childrenForFieldName("name")
      .filter((name) => name.text !== "_")
      .map((name) => ({
        kind: node.type === "const_spec" ? "constant" : "variable",
        name: name.text,
        nameNode: name,
      }));
  }
  return [];
}

function normalizedSignature(source: string, node: Parser.SyntaxNode): string {
  const body = node.childForFieldName("body");
  const value = node.childForFieldName("value");
  const end =
    body?.startIndex ?? (value?.type === "arrow_function" ? value.endIndex : node.endIndex);
  return source.slice(node.startIndex, end).replace(/\s+/g, " ").trim();
}

function escapeQualifiedNamePart(name: string): string {
  return name.replaceAll(".", "\\.");
}

function symbolId(
  file: string,
  kind: SymbolKind,
  qualifiedName: string,
  parentQualifiedName: string,
  signature: string,
): string {
  const source = `v1\0${file}\0${kind}\0${qualifiedName}\0${parentQualifiedName}\0${signature}`;
  return `symbol:sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}

function sourceSymbolFor(records: SymbolRecord[], node: Parser.SyntaxNode): SymbolRecord | null {
  let containing: SymbolRecord | null = null;
  for (const record of records) {
    if (record.range.start.byte <= node.startIndex && node.endIndex <= record.range.end.byte) {
      if (!containing || record.range.start.byte >= containing.range.start.byte)
        containing = record;
    }
  }
  return containing;
}

function resolveModuleFile(file: string, specifier: string, files: Set<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve("/", file, "..", specifier).slice(1).split(sep).join("/");
  const extension = base.slice(base.lastIndexOf("."));
  const sourceBase = LANGUAGE_BY_EXTENSION[extension] ? base.slice(0, -extension.length) : base;
  const candidates = [
    base,
    ...Object.keys(LANGUAGE_BY_EXTENSION).map(
      (candidateExtension) => `${sourceBase}${candidateExtension}`,
    ),
    ...Object.keys(LANGUAGE_BY_EXTENSION).map(
      (candidateExtension) => `${base}/index${candidateExtension}`,
    ),
  ];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function findPhpString(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (node.type === "string" || node.type === "encapsed_string") return node;
  for (const child of node.namedChildren) {
    const found = findPhpString(child);
    if (found) return found;
  }
  return null;
}

function resolvePhpInclude(file: string, specifier: string, files: Set<string>): string | null {
  const relativePath = specifier.replace(/^\.?\//, "");
  const directory = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const candidate = resolve("/", directory, relativePath).slice(1).split(sep).join("/");
  return files.has(candidate) ? candidate : null;
}

// `.a.b` is relative to the file's package; `a.b` is tried from the repo root.
function resolvePythonModule(file: string, module: string, files: Set<string>): string | null {
  const dots = module.match(/^\.*/)![0].length;
  const parts = module.slice(dots).split(".").filter(Boolean);
  const directory = file.split("/").slice(0, -1);
  const base = dots ? directory.slice(0, directory.length - (dots - 1)) : [];
  const stem = [...base, ...parts].join("/");
  const candidates = stem
    ? [`${stem}.py`, `${stem}/__init__.py`]
    : [`${base.join("/")}/__init__.py`];
  return candidates.map((c) => c.replace(/^\//, "")).find((c) => files.has(c)) ?? null;
}

function stringValue(node: Parser.SyntaxNode | null): string | null {
  if (!node || (node.type !== "string" && node.type !== "template_string")) return null;
  const text = node.text;
  return text.length >= 2 ? text.slice(1, -1) : null;
}

function isDeclarationName(node: Parser.SyntaxNode, declarationRanges: Set<number>): boolean {
  return declarationRanges.has(node.startIndex);
}

function isReferenceNode(
  node: Parser.SyntaxNode,
  declarationRanges: Set<number>,
  language: SupportedLanguage,
): boolean {
  if (language === "php") {
    return node.type === "name" && !isDeclarationName(node, declarationRanges);
  }
  if (language === "python") {
    return node.type === "identifier" && !isDeclarationName(node, declarationRanges);
  }
  if (node.type !== "identifier" && node.type !== "type_identifier") return false;
  if (isDeclarationName(node, declarationRanges)) return false;
  const parent = node.parent;
  if (!parent) return false;
  return (
    parent.type !== "import_specifier" &&
    parent.type !== "namespace_import" &&
    parent.type !== "import_clause"
  );
}

function calleeName(node: Parser.SyntaxNode): string | null {
  if (node.type === "identifier" || node.type === "member_expression") return node.text;
  return null;
}

const FUNCTION_BOUNDARY_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
]);

/** Scoped to env-var feature flags (`process.env...`), not general control flow — an ordinary `if` inside a function isn't a "gate" worth surfacing as one. */
function isEnvGuard(condition: Parser.SyntaxNode): boolean {
  return condition.text.includes("process.env");
}

/**
 * Walks up from a call expression to find the nearest enclosing env-var `if`
 * guard, stopping at the call's own function scope so a guard around an
 * unrelated enclosing function isn't misattributed to this call. An
 * intervening non-env `if` is skipped over rather than stopping the search.
 * Negates the condition when the call is reached only via the `else` branch.
 */
function guardConditionFor(node: Parser.SyntaxNode, language: SupportedLanguage): string | null {
  if (language === "php" || language === "python") return null;
  let current = node;
  let parent = current.parent;
  while (parent) {
    if (FUNCTION_BOUNDARY_TYPES.has(parent.type)) return null;
    if (parent.type === "if_statement") {
      const condition = parent.childForFieldName("condition");
      if (condition && isEnvGuard(condition)) {
        if (parent.childForFieldName("consequence") === current) return condition.text;
        if (parent.childForFieldName("alternative") === current) return `!${condition.text}`;
      }
    }
    current = parent;
    parent = current.parent;
  }
  return null;
}

function isTestFile(file: string): boolean {
  return (
    /(?:^|\/)(?:__tests__|test|tests)\//.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
}

function testFramework(source: string): TestRecord["framework"] {
  if (/from\s+["']vitest["']|require\(\s*["']vitest["']\s*\)/.test(source)) return "vitest";
  if (/from\s+["']mocha["']|require\(\s*["']mocha["']\s*\)/.test(source)) return "mocha";
  if (/from\s+["']@jest\/globals["']|require\(\s*["']@jest\/globals["']\s*\)/.test(source))
    return "jest";
  return "unknown";
}

function testCall(node: Parser.SyntaxNode): { name: string; kind: TestRecord["kind"] } | null {
  if (node.type !== "call_expression") return null;
  const functionNode = node.childForFieldName("function");
  const name = functionNode ? calleeName(functionNode) : null;
  const normalized = name?.replace(/\.(?:only|skip|todo|concurrent|each)$/, "");
  if (
    normalized !== "describe" &&
    normalized !== "context" &&
    normalized !== "it" &&
    normalized !== "test"
  )
    return null;
  const title = stringValue(node.childForFieldName("arguments")?.namedChildren[0] ?? null);
  if (!title) return null;
  return {
    name: title,
    kind: normalized === "describe" || normalized === "context" ? "suite" : "test",
  };
}

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return outer.start.byte <= inner.start.byte && inner.end.byte <= outer.end.byte;
}

function collectTests(
  file: string,
  language: SupportedLanguage,
  source: string,
  references: ReferenceRecord[],
  calls: CallEdge[],
  tests: TestRecord[],
  testSymbols: TestSymbolEdge[],
): void {
  if (language === "go") return;
  if (!isTestFile(file)) return;
  const framework = testFramework(source);
  const fileTests: TestRecord[] = [];
  const visit = (node: Parser.SyntaxNode): void => {
    const call = testCall(node);
    if (call) {
      const record: TestRecord = {
        file,
        range: range(node),
        name: call.name,
        kind: call.kind,
        framework,
      };
      tests.push(record);
      fileTests.push(record);
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(parseSource(parserFor(language, file), source).rootNode);

  for (const test of fileTests.filter((record) => record.kind === "test")) {
    const targets = new Map<string, ResolutionQuality>();
    for (const reference of references) {
      if (
        reference.file === file &&
        reference.target_symbol_id &&
        containsRange(test.range, reference.range)
      ) {
        targets.set(reference.target_symbol_id, reference.resolution);
      }
    }
    for (const call of calls) {
      if (call.file === file && call.callee_symbol_id && containsRange(test.range, call.range)) {
        targets.set(call.callee_symbol_id, call.resolution);
      }
    }
    for (const [target_symbol_id, resolution] of targets) {
      testSymbols.push({
        test_file: file,
        test_name: test.name,
        test_range: test.range,
        target_symbol_id,
        resolution,
      });
    }
  }
}

interface ImportBinding {
  importedName: string;
  targetFile: string | null;
}

function importBindings(
  node: Parser.SyntaxNode,
  targetFile: string | null,
): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  const clause = node.namedChildren.find((child) => child.type === "import_clause");
  if (!clause) return bindings;
  for (const child of clause.namedChildren) {
    if (child.type === "named_imports") {
      for (const specifier of child.namedChildren) {
        if (specifier.type !== "import_specifier") continue;
        const importedName = specifier.namedChildren[0]?.text;
        const localName = specifier.namedChildren.at(-1)?.text;
        if (importedName && localName) bindings.set(localName, { importedName, targetFile });
      }
    } else if (child.type === "identifier") {
      bindings.set(child.text, { importedName: "default", targetFile });
    } else if (child.type === "namespace_import") {
      const localName = child.namedChildren[0]?.text;
      if (localName) bindings.set(localName, { importedName: "*", targetFile });
    }
  }
  return bindings;
}

function collectStructuralRecords(
  file: string,
  language: SupportedLanguage,
  source: string,
  records: SymbolRecord[],
  allSymbols: SymbolRecord[],
  files: Set<string>,
  references: ReferenceRecord[],
  dependencies: DependencyRecord[],
  inheritance: InheritanceEdge[],
  calls: CallEdge[],
): void {
  const tree = parseSource(parserFor(language, file), source);
  const declarationRanges = new Set(records.map((record) => record.selection_range.start.byte));
  if (language === "go") {
    const visitGo = (node: Parser.SyntaxNode): void => {
      if (node.type === "import_spec") {
        const path = node.childForFieldName("path");
        if (path && !path.hasError) {
          dependencies.push({
            file,
            range: range(path),
            module_specifier: path.text.slice(1, -1),
            target_file: null,
            resolution: "unresolved",
          });
        }
      }
      if (node.type === "call_expression") {
        const callee = node.childForFieldName("function");
        if (callee && !callee.hasError) {
          let anonymous = false;
          for (let scope = node.parent; scope; scope = scope.parent) {
            if (scope.type === "func_literal") {
              anonymous = true;
              break;
            }
            if (["function_declaration", "method_declaration"].includes(scope.type)) break;
          }
          calls.push({
            caller_symbol_id: anonymous ? null : sourceSymbolFor(records, node)?.id ?? null,
            callee_name: callee.text,
            callee_symbol_id: null,
            file,
            range: range(callee),
            resolution: "unresolved",
            guard_condition: null,
          });
        }
      }
      if (
        ["identifier", "type_identifier", "field_identifier"].includes(node.type) &&
        !declarationRanges.has(node.startIndex)
      ) {
        references.push({
          file,
          range: range(node),
          name: node.text,
          source_symbol_id: sourceSymbolFor(records, node)?.id ?? null,
          target_symbol_id: null,
          resolution: "unresolved",
        });
      }
      for (const child of node.namedChildren) visitGo(child);
    };
    visitGo(tree.rootNode);
    return;
  }
  const imports = new Map<string, ImportBinding>();
  const symbolsByName = new Map<string, SymbolRecord[]>();
  const localSymbolsByName = new Map<string, SymbolRecord[]>();
  for (const symbol of allSymbols) {
    const named = symbolsByName.get(symbol.name) ?? [];
    named.push(symbol);
    symbolsByName.set(symbol.name, named);
    if (symbol.file === file) {
      const local = localSymbolsByName.get(symbol.name) ?? [];
      local.push(symbol);
      localSymbolsByName.set(symbol.name, local);
    }
  }

  const resolveName = (
    name: string,
  ): { target: SymbolRecord | null; resolution: ResolutionQuality } => {
    const imported = imports.get(name);
    if (imported) {
      const candidates = imported.targetFile
        ? allSymbols.filter(
            (symbol) =>
              symbol.file === imported.targetFile && symbol.name === imported.importedName,
          )
        : [];
      return candidates.length === 1
        ? { target: candidates[0], resolution: "static" }
        : { target: null, resolution: "unresolved" };
    }
    const local = localSymbolsByName.get(name) ?? [];
    if (local.length === 1) return { target: local[0], resolution: "static" };
    const candidates = symbolsByName.get(name) ?? [];
    return candidates.length === 1
      ? { target: candidates[0], resolution: "heuristic" }
      : { target: null, resolution: "unresolved" };
  };

  const visitPhp = (node: Parser.SyntaxNode): void => {
    if (
      node.type === "include_expression" ||
      node.type === "include_once_expression" ||
      node.type === "require_expression" ||
      node.type === "require_once_expression"
    ) {
      const literal = findPhpString(node);
      if (literal) {
        const specifier = literal.text.slice(1, -1);
        const targetFile = resolvePhpInclude(file, specifier, files);
        dependencies.push({
          file,
          range: range(literal),
          module_specifier: specifier,
          target_file: targetFile,
          resolution: targetFile ? "exact" : "unresolved",
        });
      }
    }

    if (
      node.type === "function_call_expression" ||
      node.type === "member_call_expression" ||
      node.type === "scoped_call_expression"
    ) {
      const nameNode =
        node.type === "function_call_expression"
          ? node.childForFieldName("function")
          : node.childForFieldName("name");
      if (nameNode && (nameNode.type === "name" || nameNode.type === "qualified_name")) {
        const name = nameNode.text.split("\\").pop()!;
        const resolved =
          node.type === "function_call_expression"
            ? resolveName(name)
            : { target: null, resolution: "unresolved" as const };
        calls.push({
          caller_symbol_id: sourceSymbolFor(records, node)?.id ?? null,
          callee_name: nameNode.text,
          callee_symbol_id: resolved.target?.id ?? null,
          file,
          range: range(nameNode),
          resolution: resolved.resolution,
          guard_condition: null,
        });
      }
    }

    if (node.type === "base_clause" || node.type === "class_interface_clause") {
      const child = sourceSymbolFor(records, node);
      const kind = node.type === "class_interface_clause" ? "implements" : "extends";
      if (child) {
        for (const candidate of node.namedChildren) {
          if (candidate.type !== "name" && candidate.type !== "qualified_name") continue;
          const resolved = resolveName(candidate.text.split("\\").pop()!);
          inheritance.push({
            kind,
            child_symbol_id: child.id,
            parent_name: candidate.text,
            parent_symbol_id: resolved.target?.id ?? null,
            file,
            range: range(candidate),
            resolution: resolved.resolution,
          });
        }
      }
    }
  };

  const visitPython = (node: Parser.SyntaxNode): void => {
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      const from = node.type === "import_from_statement";
      const moduleNode = from ? node.childForFieldName("module_name") : null;
      const names = node.childrenForFieldName("name");
      for (const entry of from ? [moduleNode] : names) {
        if (!entry) continue;
        const dotted = entry.type === "aliased_import" ? entry.childForFieldName("name")! : entry;
        const specifier = dotted.text;
        const targetFile = resolvePythonModule(file, specifier, files);
        dependencies.push({
          file,
          range: range(dotted),
          module_specifier: specifier,
          target_file: targetFile,
          resolution: targetFile ? "exact" : "unresolved",
        });
        if (!from) {
          const alias = entry.type === "aliased_import" ? entry.childForFieldName("alias") : null;
          if (alias && targetFile) imports.set(alias.text, { importedName: "*", targetFile });
        }
      }
      if (from) {
        const targetFile = moduleNode ? resolvePythonModule(file, moduleNode.text, files) : null;
        for (const entry of names) {
          const nameNode =
            entry.type === "aliased_import" ? entry.childForFieldName("name")! : entry;
          const alias = entry.type === "aliased_import" ? entry.childForFieldName("alias") : null;
          imports.set((alias ?? nameNode).text, {
            importedName: nameNode.text.split(".").pop()!,
            targetFile,
          });
        }
      }
    }

    if (node.type === "call") {
      const functionNode = node.childForFieldName("function");
      if (
        functionNode &&
        (functionNode.type === "identifier" || functionNode.type === "attribute")
      ) {
        const resolved =
          functionNode.type === "identifier"
            ? resolveName(functionNode.text)
            : { target: null, resolution: "unresolved" as const };
        calls.push({
          caller_symbol_id: sourceSymbolFor(records, node)?.id ?? null,
          callee_name: functionNode.text,
          callee_symbol_id: resolved.target?.id ?? null,
          file,
          range: range(functionNode),
          resolution: resolved.resolution,
          guard_condition: null,
        });
      }
    }

    if (node.type === "class_definition") {
      const child = sourceSymbolFor(records, node);
      const bases = node.childForFieldName("superclasses");
      if (child && bases) {
        for (const candidate of bases.namedChildren) {
          if (candidate.type !== "identifier" && candidate.type !== "attribute") continue;
          const resolved = resolveName(candidate.text.split(".").pop()!);
          inheritance.push({
            kind: "extends",
            child_symbol_id: child.id,
            parent_name: candidate.text,
            parent_symbol_id: resolved.target?.id ?? null,
            file,
            range: range(candidate),
            resolution: resolved.resolution,
          });
        }
      }
    }
  };

  const visit = (node: Parser.SyntaxNode): void => {
    if (node.type === "import_statement" && language !== "python") {
      const sourceNode = node.childForFieldName("source");
      const moduleSpecifier = stringValue(sourceNode);
      if (moduleSpecifier && sourceNode) {
        const targetFile = resolveModuleFile(file, moduleSpecifier, files);
        dependencies.push({
          file,
          range: range(sourceNode),
          module_specifier: moduleSpecifier,
          target_file: targetFile,
          resolution: targetFile ? "exact" : "unresolved",
        });
        for (const [localName, binding] of importBindings(node, targetFile))
          imports.set(localName, binding);
      }
    }

    if (language === "php") {
      visitPhp(node);
    }
    if (language === "python") {
      visitPython(node);
    }

    if (node.type === "call_expression") {
      const functionNode = node.childForFieldName("function");
      const name = functionNode ? calleeName(functionNode) : null;
      if (functionNode?.type === "identifier" && name === "require") {
        const argument = node.childForFieldName("arguments")?.namedChildren[0] ?? null;
        const moduleSpecifier = stringValue(argument);
        if (moduleSpecifier && argument) {
          const targetFile = resolveModuleFile(file, moduleSpecifier, files);
          dependencies.push({
            file,
            range: range(argument),
            module_specifier: moduleSpecifier,
            target_file: targetFile,
            resolution: targetFile ? "exact" : "unresolved",
          });
        }
      }
      if (name && functionNode) {
        const resolved =
          functionNode.type === "identifier"
            ? resolveName(name)
            : { target: null, resolution: "unresolved" as const };
        calls.push({
          caller_symbol_id: sourceSymbolFor(records, node)?.id ?? null,
          callee_name: name,
          callee_symbol_id: resolved.target?.id ?? null,
          file,
          range: range(functionNode),
          resolution: resolved.resolution,
          guard_condition: guardConditionFor(node, language),
        });
      }
    }

    if (
      node.type === "extends_clause" ||
      node.type === "implements_clause" ||
      node.type === "extends_type_clause"
    ) {
      const child = sourceSymbolFor(records, node);
      const kind = node.type === "implements_clause" ? "implements" : "extends";
      if (child) {
        for (const candidate of node.namedChildren) {
          if (candidate.type !== "identifier" && candidate.type !== "type_identifier") continue;
          const resolved = resolveName(candidate.text);
          inheritance.push({
            kind,
            child_symbol_id: child.id,
            parent_name: candidate.text,
            parent_symbol_id: resolved.target?.id ?? null,
            file,
            range: range(candidate),
            resolution: resolved.resolution,
          });
        }
      }
    }

    if (isReferenceNode(node, declarationRanges, language)) {
      const resolved = resolveName(node.text);
      references.push({
        file,
        range: range(node),
        name: node.text,
        source_symbol_id: sourceSymbolFor(records, node)?.id ?? null,
        target_symbol_id: resolved.target?.id ?? null,
        resolution: resolved.resolution,
      });
    }

    for (const child of node.namedChildren) visit(child);
  };

  visit(tree.rootNode);
}

function collectSymbols(
  node: Parser.SyntaxNode,
  source: string,
  file: string,
  language: SupportedLanguage,
  commitHash: string,
  parent: SymbolRecord | null,
  records: SymbolRecord[],
  qualifiedNameCounts: Map<string, number>,
): void {
  const declaration = language === "go" ? null : declarationFor(node, language);
  const declarations = language === "go" ? goDeclarationsFor(node) : declaration ? [declaration] : [];
  let currentParent = parent;

  for (const declaration of declarations) {
    const parentQualifiedName = parent?.qualified_name ?? "";
    const baseQualifiedName = declaration.qualifiedPrefix
      ? `${escapeQualifiedNamePart(declaration.qualifiedPrefix)}.${escapeQualifiedNamePart(declaration.name)}`
      : parentQualifiedName
        ? `${parentQualifiedName}.${escapeQualifiedNamePart(declaration.name)}`
        : escapeQualifiedNamePart(declaration.name);
    const occurrence = (qualifiedNameCounts.get(baseQualifiedName) ?? 0) + 1;
    qualifiedNameCounts.set(baseQualifiedName, occurrence);
    const qualifiedName =
      occurrence === 1 ? baseQualifiedName : `${baseQualifiedName}#${occurrence}`;
    const signature = normalizedSignature(source, node);
    const record: SymbolRecord = {
      schema_version: SYMBOL_SCHEMA_VERSION,
      id: symbolId(file, declaration.kind, qualifiedName, parentQualifiedName, signature),
      repository_root: ".",
      commit_hash: commitHash,
      file,
      language,
      kind: declaration.kind,
      name: declaration.name,
      qualified_name: qualifiedName,
      parent_id: parent?.id ?? null,
      range: range(node),
      selection_range: range(declaration.nameNode),
      signature,
    };
    records.push(record);
    currentParent = record;
  }

  for (const child of node.namedChildren) {
    collectSymbols(
      child,
      source,
      file,
      language,
      commitHash,
      currentParent,
      records,
      qualifiedNameCounts,
    );
  }
}

export function indexRepository(repositoryRoot: string): RepositoryIndex {
  const root = resolve(repositoryRoot);
  const gitRoot = command(root, ["rev-parse", "--show-toplevel"]);
  if (resolve(gitRoot) !== root) {
    throw new Error(`Repository root must be the Git root: ${gitRoot}`);
  }

  const commitHash = command(root, ["rev-parse", "HEAD"]);
  const records: SymbolRecord[] = [];
  const ids = new Set<string>();
  const files = trackedSourceFiles(root);
  const sources = new Map<string, { language: SupportedLanguage; source: string }>();

  for (const file of files) {
    const language = languageForPath(file);
    if (!language) continue;
    const absolutePath = resolve(root, file);
    const relPath = relative(root, absolutePath).split(sep).join("/");
    const source = readFileSync(absolutePath, "utf8");
    sources.set(relPath, { language, source });
    const tree = parseSource(parserFor(language, file), source);
    const before = records.length;
    collectSymbols(tree.rootNode, source, relPath, language, commitHash, null, records, new Map());
    for (const record of records.slice(before)) {
      if (ids.has(record.id))
        throw new Error(`Duplicate symbol id in ${file}: ${record.qualified_name}`);
      ids.add(record.id);
    }
  }

  const references: ReferenceRecord[] = [];
  const dependencies: DependencyRecord[] = [];
  const inheritance: InheritanceEdge[] = [];
  const calls: CallEdge[] = [];
  const indexedFiles = new Set(files);
  for (const [file, source] of sources) {
    collectStructuralRecords(
      file,
      source.language,
      source.source,
      records.filter((record) => record.file === file),
      records,
      indexedFiles,
      references,
      dependencies,
      inheritance,
      calls,
    );
  }

  const tests: TestRecord[] = [];
  const testSymbols: TestSymbolEdge[] = [];
  for (const [file, source] of sources) {
    collectTests(file, source.language, source.source, references, calls, tests, testSymbols);
  }

  // Keep parser coordinates until all containment and resolution checks finish.
  for (const [file, { source }] of sources) {
    const ranges = [
      ...records
        .filter((record) => record.file === file)
        .flatMap((record) => [record.range, record.selection_range]),
      ...[...references, ...dependencies, ...calls, ...inheritance, ...tests]
        .filter((record) => record.file === file)
        .map((record) => record.range),
      ...testSymbols.filter((record) => record.test_file === file).map((record) => record.test_range),
    ];
    new SourceOffsets(source).normalizeRanges(ranges);
  }

  return {
    commit_hash: commitHash,
    files_indexed: files.length,
    symbols: records,
    references,
    dependencies,
    inheritance,
    calls,
    tests,
    test_symbols: testSymbols,
  };
}
