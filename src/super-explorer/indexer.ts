import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

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
  language: "typescript" | "javascript";
  kind: SymbolKind;
  name: string;
  qualified_name: string;
  parent_id: string | null;
  range: SourceRange;
  selection_range: SourceRange;
  signature: string;
}

export interface RepositoryIndex {
  commit_hash: string;
  files_indexed: number;
  symbols: SymbolRecord[];
}

type SupportedLanguage = SymbolRecord["language"];

interface Declaration {
  kind: SymbolKind;
  name: string;
  nameNode: Parser.SyntaxNode;
}

const LANGUAGE_BY_EXTENSION: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
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
  parser.setLanguage(language === "typescript" ? (file.endsWith(".tsx") ? TypeScript.tsx : TypeScript.typescript) : JavaScript);
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

function declarationFor(node: Parser.SyntaxNode): Declaration | null {
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
      const kind = value?.type === "arrow_function" || value?.type === "function_expression" ? "function" : "variable";
      return { kind, name: variableName, nameNode: node.childForFieldName("name")! };
    }
    default:
      return null;
  }
}

function normalizedSignature(source: string, node: Parser.SyntaxNode): string {
  const body = node.childForFieldName("body");
  const value = node.childForFieldName("value");
  const end = body?.startIndex ?? (value?.type === "arrow_function" ? value.endIndex : node.endIndex);
  return source.slice(node.startIndex, end).replace(/\s+/g, " ").trim();
}

function escapeQualifiedNamePart(name: string): string {
  return name.replaceAll(".", "\\.");
}

function symbolId(file: string, kind: SymbolKind, qualifiedName: string, parentQualifiedName: string, signature: string): string {
  const source = `v1\0${file}\0${kind}\0${qualifiedName}\0${parentQualifiedName}\0${signature}`;
  return `symbol:sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}

function collectSymbols(
  node: Parser.SyntaxNode,
  source: string,
  file: string,
  language: SupportedLanguage,
  commitHash: string,
  parent: SymbolRecord | null,
  records: SymbolRecord[],
  qualifiedNameCounts: Map<string, number>
): void {
  const declaration = declarationFor(node);
  let currentParent = parent;

  if (declaration) {
    const parentQualifiedName = parent?.qualified_name ?? "";
    const baseQualifiedName = parentQualifiedName
      ? `${parentQualifiedName}.${escapeQualifiedNamePart(declaration.name)}`
      : escapeQualifiedNamePart(declaration.name);
    const occurrence = (qualifiedNameCounts.get(baseQualifiedName) ?? 0) + 1;
    qualifiedNameCounts.set(baseQualifiedName, occurrence);
    const qualifiedName = occurrence === 1 ? baseQualifiedName : `${baseQualifiedName}#${occurrence}`;
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
    collectSymbols(child, source, file, language, commitHash, currentParent, records, qualifiedNameCounts);
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

  for (const file of files) {
    const language = languageForPath(file);
    if (!language) continue;
    const absolutePath = resolve(root, file);
    const relPath = relative(root, absolutePath).split(sep).join("/");
    const source = readFileSync(absolutePath, "utf8");
    const tree = parserFor(language, file).parse(source);
    const before = records.length;
    collectSymbols(tree.rootNode, source, relPath, language, commitHash, null, records, new Map());
    for (const record of records.slice(before)) {
      if (ids.has(record.id)) throw new Error(`Duplicate symbol id in ${file}: ${record.qualified_name}`);
      ids.add(record.id);
    }
  }

  return { commit_hash: commitHash, files_indexed: files.length, symbols: records };
}
