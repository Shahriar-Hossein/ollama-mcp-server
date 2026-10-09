import { readFileSync } from "node:fs";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import { checkedFile } from "./local-explore-packing.js";

export function pythonDictionaryRequest(query: string): { dictionary: string; reader: string } | null {
  const unquoted = query.replace(/(["'`])[\s\S]*?\1/g, "\0");
  const matches = [...unquoted.matchAll(/\bwhich\s+([A-Za-z_][A-Za-z0-9_]*)\s+dictionary\s+does\s+([A-Za-z_][A-Za-z0-9_]*)\s+read(?=[,?\s]|$)/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match?.[1] || !match[2]) return null;
  return { dictionary: match[1], reader: match[2] };
}

export function pythonDictionaryPlanForTree(
  root: Parser.SyntaxNode,
  request: { dictionary: string; reader: string },
): { readerHeader: number; initializer: number; entryRows: number[]; readRow: number } | null {
  const valid = (node: Parser.SyntaxNode): boolean => !node.hasError && !node.isMissing && node.namedChildren.every(valid);
  if (root.type !== "module" || !valid(root)) return null;
  const statements = (node: Parser.SyntaxNode) => node.namedChildren.filter((child) => child.type !== "comment");
  const initializer = (statement: Parser.SyntaxNode) => {
    const assignment = statement.namedChildren[0];
    if (statement.type !== "expression_statement" || statement.namedChildren.length !== 1 || assignment?.type !== "assignment" || assignment.namedChildren.length !== 2) return null;
    const left = assignment.childForFieldName("left");
    const literal = assignment.childForFieldName("right");
    if (left?.type !== "identifier" || left.text !== request.dictionary || !literal || assignment.startPosition.row !== literal.startPosition.row) return null;
    const entryRows = pythonDictionaryEntryRows(literal);
    return entryRows ? { literal, entryRows, row: assignment.startPosition.row + 1 } : null;
  };
  let moduleDictionary: ReturnType<typeof initializer> = null;
  let target: { local: ReturnType<typeof initializer>; header: number; read: number; key: string } | null = null;
  const names = new Set<string>();
  for (const child of statements(root)) {
    if (child.type === "expression_statement") {
      const value = initializer(child);
      if (!value || moduleDictionary) return null;
      moduleDictionary = value;
      continue;
    }
    if (child.type !== "function_definition" || statements(child).length !== 3) return null;
    const name = child.childForFieldName("name");
    const parameters = child.childForFieldName("parameters");
    const body = child.childForFieldName("body");
    if (name?.type !== "identifier" || name.text === request.dictionary || names.has(name.text) || parameters?.type !== "parameters" || parameters.namedChildren.length || !body || body.type !== "block") return null;
    if (parameters.startPosition.row !== child.startPosition.row || parameters.endPosition.row !== child.startPosition.row || !/^(?:async[\t ]+)?def[\t ]+[A-Za-z_][A-Za-z0-9_]*[\t ]*\([\t ]*\)[\t ]*:/.test(child.text.split(/\r?\n/, 1)[0])) return null;
    names.add(name.text);
    const parts = statements(body);
    if (parts.length < 1 || parts.length > 2) return null;
    const local = parts.length === 2 ? initializer(parts[0]) : null;
    if (parts.length === 2 && !local) return null;
    const returned = parts[parts.length - 1];
    if (returned.type !== "return_statement" || returned.namedChildren.length !== 1 || returned.startPosition.row !== returned.endPosition.row) return null;
    const subscript = returned.namedChildren[0];
    const value = subscript.childForFieldName("value");
    const key = subscript.childForFieldName("subscript");
    if (subscript.type !== "subscript" || subscript.namedChildren.length !== 2 || value?.type !== "identifier" || value.text !== request.dictionary || key?.type !== "string" || !/^(?:'[^'\\\r\n]*'|"[^"\\\r\n]*")$/.test(key.text)) return null;
    if (name.text === request.reader) target = { local, header: child.startPosition.row + 1, read: returned.startPosition.row + 1, key: key.text.slice(1, -1) };
  }
  const chosen = target?.local ?? moduleDictionary;
  if (!target || !chosen?.literal.namedChildren.some((pair) => pair.type === "pair" && pair.childForFieldName("key")?.text.slice(1, -1) === target.key)) return null;
  return { readerHeader: target.header, initializer: chosen.row, entryRows: [...chosen.entryRows], readRow: target.read };
}
export function pythonDictionaryEntryRows(dictionary: Parser.SyntaxNode): number[] | null {
  if (dictionary.type !== "dictionary" || dictionary.hasError || dictionary.isMissing) return null;
  const pairs = dictionary.namedChildren.filter((child) => child.type !== "comment");
  if (pairs.length < 1 || pairs.length > 3) return null;
  const plainString = (node: Parser.SyntaxNode) =>
    node.type === "string" && /^(?:'[^'\\\r\n]*'|"[^"\\\r\n]*")$/.test(node.text) &&
    !node.namedChildren.some((child) => child.type === "interpolation" || child.type === "escape_sequence");
  const keys = new Set<string>();
  const rows = new Set<number>();
  for (const pair of pairs) {
    if (pair.type !== "pair" || pair.hasError || pair.isMissing || pair.startPosition.row !== pair.endPosition.row) return null;
    const key = pair.childForFieldName("key");
    const value = pair.childForFieldName("value");
    if (!key || !value || key.hasError || key.isMissing || value.hasError || value.isMissing || !plainString(key)) return null;
    const canonicalKey = key.text.slice(1, -1);
    if (keys.has(canonicalKey)) return null;
    const decimal = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
    if (!plainString(value) && !(["integer", "float"].includes(value.type) && decimal.test(value.text))) return null;
    keys.add(canonicalKey);
    rows.add(pair.startPosition.row + 1);
  }
  return [...rows];
}

const MAX_PYTHON_SOURCE_CHARS = 24_000;

export function pythonDictionaryLocations(
  root: string,
  symbols: readonly { file: string; language: string; kind: string; name: string; parent_id: string | null }[],
  query: string,
): { file: string; line: number }[] | null {
  const request = pythonDictionaryRequest(query);
  if (!request) return null;
  const readers = symbols.filter(
    (symbol) => symbol.language === "python" && symbol.kind === "function" && !symbol.parent_id && symbol.name === request.reader,
  );
  if (readers.length !== 1) return null;
  const file = readers[0].file;
  const source = readFileSync(checkedFile(root, file), "utf8");
  if (source.length > MAX_PYTHON_SOURCE_CHARS) return null;
  const parser = new Parser();
  parser.setLanguage(Python);
  const plan = pythonDictionaryPlanForTree(parser.parse(source).rootNode, request);
  if (!plan) return null;
  const rows = new Set([plan.readerHeader, plan.initializer, ...plan.entryRows, plan.readRow]);
  return [...rows].sort((a, b) => a - b).map((line) => ({ file, line }));
}
