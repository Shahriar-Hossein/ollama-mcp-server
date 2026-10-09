import { readFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "tree-sitter";
import Go from "tree-sitter-go";
import PHP from "tree-sitter-php";
import Python from "tree-sitter-python";
import Rust from "tree-sitter-rust";
import { parseSource } from "../../explorer/parse.js";
import { parseConfigurationTree } from "./local-explore-config-context.js";
import { moduleMetadata } from "./local-explore-provenance.js";

export type SupportingLine = { file: string; line: number; quote: string; reason: string };

const unquote = (text: string) => text.replace(/^['"]|['"]$/g, "");

const MAX_SUPPORT = 12;
const MAX_SIBLINGS = 3;
const DECLARATIONS = new Set([
  "lexical_declaration",
  "variable_declaration",
  "function_declaration",
  "generator_function_declaration",
  "method_definition",
  "class_declaration",
]);
const PHP_SCOPES = new Set([
  "function_definition",
  "method_declaration",
  "class_declaration",
  "interface_declaration",
  "trait_declaration",
  "enum_declaration",
  "anonymous_function",
  "arrow_function",
  "anonymous_class",
]);
const PYTHON_SCOPES = new Set(["function_definition", "class_definition", "lambda"]);
const GO_SCOPES = new Set(["function_declaration", "method_declaration", "type_spec", "type_alias", "func_literal"]);
const RUST_SCOPES = new Set(["function_item", "function_signature_item", "struct_item", "enum_item", "trait_item", "impl_item", "type_item", "mod_item", "const_item", "static_item", "closure_expression"]);

// Deterministic extras (Nest @Module, enclosing declaration, scalar sibling keys); not H's selection and not semantic proof.
type Add = (file: string, row: number, reason: string, lines: string[]) => boolean;

function enclosingDeclaration(
  start: Parser.SyntaxNode | null,
  row: number,
  file: string,
  lines: string[],
  add: Add,
) {
  for (let node = start; node; node = node.parent) {
    if (!DECLARATIONS.has(node.type) || node.startPosition.row >= row) continue;
    const holder = node.parent?.type === "export_statement" ? node.parent : node;
    const name = node.type === "class_declaration" ? node.childForFieldName("name") : null;
    const header = name ? name.startPosition.row : holder.startPosition.row;
    add(file, header, `enclosing ${node.type.replace(/_/g, " ")} of selected line`, lines);
    return;
  }
}

function phpHeader(node: Parser.SyntaxNode) {
  return ["anonymous_function", "arrow_function", "anonymous_class"].includes(node.type)
    ? node.children.find((child) => ["function", "fn", "class"].includes(child.type))
    : node.childForFieldName("name");
}

function enclosingPhpScope(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  for (let node = start; node; node = node.parent) {
    if (node.type === "ERROR" || node.isMissing) return;
    if (!PHP_SCOPES.has(node.type)) continue;
    if (node.hasError) return;
    const header = phpHeader(node);
    if (header) add(file, header.startPosition.row, `enclosing PHP ${node.type.replace(/_/g, " ")} of selected line`, lines);
    // Stop at anonymous scopes and already selected headers rather than attributing them to an outer declaration.
    return;
  }
}

function parseSupportTree(source: string, file: string) {
  if (!/\.(?:php|py|go|rs)$/.test(file)) return parseConfigurationTree(source, file);
  const parser = new Parser();
  parser.setLanguage(file.endsWith(".rs") ? Rust : file.endsWith(".go") ? Go : file.endsWith(".py") ? Python : PHP.php);
  return parseSource(parser, source);
}

function enclosingGoScope(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  for (let node = start; node; node = node.parent) {
    if (node.type === "ERROR" || node.isMissing) return;
    if (!GO_SCOPES.has(node.type)) continue;
    if (node.hasError) return;
    add(file, node.startPosition.row, `enclosing Go ${node.type.replace(/_/g, " ")} of selected line (source context)`, lines);
    return;
  }
}

function enclosingRustScope(start: Parser.SyntaxNode | null, row: number, file: string, lines: string[], add: Add) {
  for (let node = start; node; node = node.parent) {
    if (node.type === "ERROR" || node.isMissing) return;
    if (!RUST_SCOPES.has(node.type)) continue;
    if (node.hasError || node.startPosition.row === row) return;
    add(file, node.startPosition.row, `enclosing Rust ${node.type.replace(/_/g, " ")} of selected line (source context)`, lines);
    const owner = node.parent?.type === "declaration_list" ? node.parent.parent : null;
    if (owner && !owner.hasError && ["impl_item", "trait_item"].includes(owner.type))
      add(file, owner.startPosition.row, "lexical Rust impl/trait header of selected declaration (not binding resolution)", lines);
    return;
  }
}

function enclosingPythonScope(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  for (let node = start; node; node = node.parent) {
    if (node.type === "ERROR" || node.isMissing) return;
    const scope = node.type === "decorated_definition" ? node.childForFieldName("definition") : node;
    if (!scope || !PYTHON_SCOPES.has(scope.type)) continue;
    if (scope.hasError) return;
    add(file, scope.startPosition.row, `enclosing Python ${scope.type.replace(/_/g, " ")} of selected line`, lines);
    const decorated = scope.parent;
    if (decorated?.type === "decorated_definition" && !decorated.hasError) {
      for (const decorator of decorated.namedChildren.filter((child) => child.type === "decorator").slice(0, MAX_SIBLINGS)) {
        if (decorator.startPosition.row === decorator.endPosition.row)
          add(file, decorator.startPosition.row, "single-line decorator of enclosing Python declaration (source context)", lines);
      }
    }
    return;
  }
}

function pythonLiteral(node: Parser.SyntaxNode | null): boolean {
  if (!node || node.hasError) return false;
  if (["integer", "float"].includes(node.type)) return true;
  if (node.type === "unary_operator") {
    const argument = node.childForFieldName("argument");
    return ["+", "-"].includes(node.childForFieldName("operator")?.text ?? "") &&
      !!argument && ["integer", "float"].includes(argument.type);
  }
  if (node.type !== "string") return false;
  const prefix = node.namedChildren.find((child) => child.type === "string_start")?.text.match(/^[^'"]*/)?.[0] ?? "";
  return !/[bf]/i.test(prefix) && !node.namedChildren.some((child) => child.type === "interpolation");
}

function pythonScalarSiblings(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  let pair = start;
  while (pair && pair.type !== "dictionary" && !(pair.type === "pair" && pair.parent?.type === "dictionary")) pair = pair.parent;
  if (pair?.type !== "pair" || !pair.parent || pair.parent.hasError) return;
  let added = 0;
  for (const sibling of pair.parent.namedChildren) {
    if (added >= MAX_SIBLINGS) break;
    if (sibling.id === pair.id || sibling.type !== "pair") continue;
    if (!pythonLiteral(sibling.childForFieldName("key")) || !pythonLiteral(sibling.childForFieldName("value"))) continue;
    if (sibling.startPosition.row !== sibling.endPosition.row) continue;
    if (add(file, sibling.startPosition.row, "scalar sibling Python dictionary entry of selected line (source context)", lines)) added++;
  }
}

function pythonImportUses(start: Parser.SyntaxNode | null, root: Parser.SyntaxNode, file: string, lines: string[], add: Add) {
  let statement = start;
  while (statement && !["import_statement", "import_from_statement"].includes(statement.type)) statement = statement.parent;
  if (!statement || statement.hasError || statement.namedChildren.some((child) => child.type === "wildcard_import")) return;
  const names = statement.childrenForFieldName("name").map((name) => {
    if (name.type === "aliased_import") return name.childForFieldName("alias")?.text ?? "";
    return name.type === "dotted_name" ? name.namedChildren[0]?.text ?? "" : "";
  });
  const identifiers = root.descendantsOfType("identifier").filter((node) => {
    if (node.startIndex < statement.endIndex) return false;
    for (let parent = node.parent; parent; parent = parent.parent)
      if (["string", "comment", "import_statement", "import_from_statement", "ERROR"].includes(parent.type)) return false;
    return true;
  });
  for (const name of names.slice(0, MAX_SIBLINGS)) {
    const use = identifiers.find((node) => node.text === name);
    if (use) add(file, use.startPosition.row, `first subsequent identifier '${name}' from Python import (text context, not binding resolution)`, lines);
  }
}

function scalarSiblings(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  let pair = start;
  while (pair && !(pair.type === "pair" && pair.parent?.type === "object")) pair = pair.parent;
  if (!pair?.parent) return;
  let added = 0;
  for (const sibling of pair.parent.namedChildren) {
    if (added >= MAX_SIBLINGS) break;
    if (sibling.id === pair.id || sibling.type !== "pair") continue;
    const value = sibling.childForFieldName("value");
    if (!value || !["string", "number"].includes(value.type)) continue;
    if (sibling.startPosition.row !== sibling.endPosition.row) continue;
    if (add(file, sibling.startPosition.row, "scalar sibling property of selected object property", lines))
      added++;
  }
}

function phpScalarSiblings(start: Parser.SyntaxNode | null, file: string, lines: string[], add: Add) {
  let entry = start;
  while (entry && !(entry.type === "array_element_initializer" && entry.parent?.type === "array_creation_expression"))
    entry = entry.parent;
  if (!entry?.parent) return;
  let added = 0;
  for (const sibling of entry.parent.namedChildren) {
    if (added >= MAX_SIBLINGS) break;
    if (sibling.id === entry.id || sibling.type !== "array_element_initializer") continue;
    const [key, arrow, value] = sibling.children;
    if (arrow?.type !== "=>") continue;
    const literal = (node: Parser.SyntaxNode | undefined) =>
      !!node &&
      (["string", "integer", "float"].includes(node.type) ||
        (node.type === "encapsed_string" &&
          node.namedChildren.every((child) => ["string_content", "escape_sequence"].includes(child.type))));
    if (!literal(key) || !literal(value)) continue;
    if (sibling.startPosition.row !== sibling.endPosition.row) continue;
    if (add(file, sibling.startPosition.row, "scalar sibling PHP array entry of selected line", lines)) added++;
  }
}

function importUses(start: Parser.SyntaxNode | null, root: Parser.SyntaxNode, file: string, lines: string[], add: Add) {
  let statement = start;
  while (statement && statement.type !== "import_statement") statement = statement.parent;
  const clause = statement?.namedChildren.find((child) => child.type === "import_clause");
  if (!statement || !clause) return;
  const names = clause.namedChildren.flatMap((child) =>
    child.type === "identifier"
      ? [child.text]
      : child.type === "named_imports"
        ? child.namedChildren.map((spec) => (spec.childForFieldName("alias") ?? spec.childForFieldName("name"))?.text ?? "")
        : [],
  );
  const identifiers = root.descendantsOfType(["identifier", "jsx_identifier"]);
  for (const name of names.slice(0, MAX_SIBLINGS)) {
    const use = identifiers.find((node) => node.text === name && node.startIndex >= statement.endIndex);
    if (use) add(file, use.startPosition.row, `first use of imported '${name}'`, lines);
  }
}

export function structuralSupport(
  root: string,
  evidence: Array<{ file: string; line: number }>,
): SupportingLine[] {
  const have = new Set(evidence.map((item) => `${item.file}:${item.line}`));
  const out: SupportingLine[] = [];
  const trees = new Map<string, {
    tree: Parser.Tree;
    lines: string[];
    phpHeaders: Set<number>;
    pythonHeaders: Map<number, Parser.SyntaxNode>;
    goHeaders: Map<number, Parser.SyntaxNode>;
    rustHeaders: Map<number, Parser.SyntaxNode>;
  } | null>();
  const add: Add = (file, row, reason, lines) => {
    const key = `${file}:${row + 1}`;
    const quote = lines[row]?.trim();
    if (!quote || have.has(key) || out.length >= MAX_SUPPORT) return false;
    have.add(key);
    out.push({ file, line: row + 1, quote, reason });
    return true;
  };
  for (const item of evidence) {
    if (!/\.(?:[cm]?[jt]sx?|php|py|go|rs)$/.test(item.file)) continue;
    if (!trees.has(item.file)) {
      try {
        const source = readFileSync(join(root, item.file), "utf8");
        const tree = parseSupportTree(source, item.file);
        const phpHeaders = new Set<number>();
        if (item.file.endsWith(".php")) {
          for (const node of tree.rootNode.descendantsOfType([...PHP_SCOPES])) {
            const header = phpHeader(node);
            if (header) phpHeaders.add(header.startPosition.row);
          }
        }
        const pythonHeaders = new Map<number, Parser.SyntaxNode>();
        if (item.file.endsWith(".py")) {
          for (const node of tree.rootNode.descendantsOfType([...PYTHON_SCOPES]))
            if (node.isNamed) pythonHeaders.set(node.startPosition.row, node);
        }
        const goHeaders = new Map<number, Parser.SyntaxNode>();
        if (item.file.endsWith(".go")) {
          for (const node of tree.rootNode.descendantsOfType([...GO_SCOPES]))
            if (node.isNamed) goHeaders.set(node.startPosition.row, node);
        }
        const rustHeaders = new Map<number, Parser.SyntaxNode>();
        if (item.file.endsWith(".rs")) {
          for (const node of tree.rootNode.descendantsOfType([...RUST_SCOPES]))
            if (node.isNamed) rustHeaders.set(node.startPosition.row, node);
        }
        trees.set(item.file, { tree, lines: source.split("\n"), phpHeaders, pythonHeaders, goHeaders, rustHeaders });
      } catch {
        trees.set(item.file, null);
      }
    }
    const parsed = trees.get(item.file);
    if (!parsed) continue;
    const row = item.line - 1;
    if (!Number.isInteger(row) || row < 0 || row >= parsed.lines.length || !parsed.lines[row].trim()) continue;
    const column = Math.max(0, (parsed.lines[row] ?? "").search(/\S/));
    const start: Parser.SyntaxNode | null = parsed.tree.rootNode.descendantForPosition({ row, column });
    if (item.file.endsWith(".rs")) {
      let invalid = false;
      for (let node: Parser.SyntaxNode | null = start; node; node = node.parent)
        if (node.type === "ERROR" || node.isMissing) invalid = true;
      if (!invalid) enclosingRustScope(parsed.rustHeaders.get(row) ?? start, row, item.file, parsed.lines, add);
      continue;
    }
    if (item.file.endsWith(".go")) {
      let invalid = false;
      for (let node: Parser.SyntaxNode | null = start; node; node = node.parent)
        if (node.type === "ERROR" || node.isMissing) invalid = true;
      if (!invalid) enclosingGoScope(parsed.goHeaders.get(row) ?? start, item.file, parsed.lines, add);
      continue;
    }
    if (item.file.endsWith(".php")) {
      // A line can start before its closure header (for example, "$fn = function ...").
      if (!parsed.phpHeaders.has(row)) enclosingPhpScope(start, item.file, parsed.lines, add);
      phpScalarSiblings(start, item.file, parsed.lines, add);
      continue;
    }
    if (item.file.endsWith(".py")) {
      let invalid = false;
      for (let node: Parser.SyntaxNode | null = start; node; node = node.parent)
        if (node.type === "ERROR" || node.isMissing) invalid = true;
      if (invalid) continue;
      // Assignment-prefixed lambda headers must not acquire an outer def's header.
      enclosingPythonScope(parsed.pythonHeaders.get(row) ?? start, item.file, parsed.lines, add);
      pythonScalarSiblings(start, item.file, parsed.lines, add);
      pythonImportUses(start, parsed.tree.rootNode, item.file, parsed.lines, add);
      continue;
    }
    enclosingDeclaration(start, row, item.file, parsed.lines, add);
    scalarSiblings(start, item.file, parsed.lines, add);
    importUses(start, parsed.tree.rootNode, item.file, parsed.lines, add);
    let node: Parser.SyntaxNode | null = start;
    // Climb from the selected line to the nearest enclosing @Module metadata object.
    let property: Parser.SyntaxNode | undefined;
    let module: Parser.SyntaxNode | undefined;
    for (; node; node = node.parent) {
      if (node.type === "object" && moduleMetadata(node)) {
        module = node;
        break;
      }
      if (node.type === "pair") property = node;
    }
    if (!module) continue;
    const decorator = module.parent?.parent?.parent;
    const holder = decorator?.parent;
    const declaration =
      holder?.type === "export_statement" ? holder.childForFieldName("declaration") : holder;
    const name = declaration?.type === "class_declaration" ? declaration.childForFieldName("name") : null;
    if (name) add(item.file, name.startPosition.row, "decorated class of selected @Module metadata", parsed.lines);
    const value = property?.childForFieldName("value");
    if (property && value?.type === "array") {
      const key = unquote(property.childForFieldName("key")?.text ?? "");
      add(item.file, property.startPosition.row, `@Module '${key}' property of selected entry`, parsed.lines);
      for (const entry of value.namedChildren)
        if (entry.type === "identifier")
          add(item.file, entry.startPosition.row, `direct '${key}' entry beside selected line`, parsed.lines);
    }
  }
  return out;
}
