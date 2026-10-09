export type Location = { file: string; line: number };
export type OwnedCitation = { citation: Location; owner: Location | null };

export function foreignOwnerCitations(
  target: Location | null,
  citations: readonly OwnedCitation[],
): Location[] {
  if (target === null) return [];
  const seen = new Set();
  const result: Location[] = [];
  for (const item of citations) {
    if (item.owner === null) continue;
    const isForeign = item.owner.file !== target.file || item.owner.line !== target.line;
    if (!isForeign) continue;
    const key = JSON.stringify([item.citation.file, item.citation.line]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ file: item.citation.file, line: item.citation.line });
  }
  return result;
}
