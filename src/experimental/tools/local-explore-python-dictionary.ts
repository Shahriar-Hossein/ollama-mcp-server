export function pythonDictionaryRequest(query: string): { dictionary: string; reader: string } | null {
  const unquoted = query.replace(/(["'`])[\s\S]*?\1/g, "\0");
  const matches = [...unquoted.matchAll(/\bwhich\s+([A-Za-z_][A-Za-z0-9_]*)\s+dictionary\s+does\s+([A-Za-z_][A-Za-z0-9_]*)\s+read(?=[,?\s]|$)/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match?.[1] || !match[2]) return null;
  return { dictionary: match[1], reader: match[2] };
}
