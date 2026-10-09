import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Parser from "tree-sitter";
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
  const trees = new Map<string, { tree: Parser.Tree; lines: string[] } | null>();
  const add: Add = (file, row, reason, lines) => {
    const key = `${file}:${row + 1}`;
    const quote = lines[row]?.trim();
    if (!quote || have.has(key) || out.length >= MAX_SUPPORT) return false;
    have.add(key);
    out.push({ file, line: row + 1, quote, reason });
    return true;
  };
  for (const item of evidence) {
    if (!/\.[cm]?[jt]sx?$/.test(item.file)) continue;
    if (!trees.has(item.file)) {
      try {
        const source = readFileSync(join(root, item.file), "utf8");
        trees.set(item.file, { tree: parseConfigurationTree(source, item.file), lines: source.split("\n") });
      } catch {
        trees.set(item.file, null);
      }
    }
    const parsed = trees.get(item.file);
    if (!parsed) continue;
    const row = item.line - 1;
    const column = Math.max(0, (parsed.lines[row] ?? "").search(/\S/));
    const start: Parser.SyntaxNode | null = parsed.tree.rootNode.descendantForPosition({ row, column });
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
