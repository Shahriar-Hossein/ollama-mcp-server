import type Parser from "tree-sitter";

export function pythonDictionaryRequest(query: string): { dictionary: string; reader: string } | null {
  const unquoted = query.replace(/(["'`])[\s\S]*?\1/g, "\0");
  const matches = [...unquoted.matchAll(/\bwhich\s+([A-Za-z_][A-Za-z0-9_]*)\s+dictionary\s+does\s+([A-Za-z_][A-Za-z0-9_]*)\s+read(?=[,?\s]|$)/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match?.[1] || !match[2]) return null;
  return { dictionary: match[1], reader: match[2] };
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
