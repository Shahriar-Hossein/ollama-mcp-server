import { readFileSync } from "node:fs";
import { checkedFile } from "../../src/experimental/tools/local-explore-packing.js";
import { structuralSupport } from "../../src/experimental/tools/local-explore-structure.js";
import { evidenceAnswerRequest } from "./language-eval-score.js";

export type EvidenceLine = { file: string; line: number; quote: string };
export type SupportingLine = EvidenceLine & { reason: string };
export type ScopeAnnotation = { evidence: EvidenceLine; enclosing: SupportingLine | null };

function copyLine(item: EvidenceLine): EvidenceLine {
  return { file: item.file, line: item.line, quote: item.quote.trim() };
}

export function annotateEvidenceScopes(
  evidence: EvidenceLine[],
  lookup: (item: EvidenceLine) => SupportingLine[],
): ScopeAnnotation[] {
  const seen = new Set<string>();
  const annotations: ScopeAnnotation[] = [];
  for (const item of evidence) {
    if (!item.file || !Number.isSafeInteger(item.line) || item.line < 1 || !item.quote.trim())
      throw new Error("Invalid selected evidence line");
    const selected = copyLine(item);
    const tuple = JSON.stringify([selected.file, selected.line, selected.quote]);
    if (seen.has(tuple)) continue;
    seen.add(tuple);
    const header = lookup({ ...selected }).find((candidate) =>
      candidate.file === selected.file && Number.isSafeInteger(candidate.line) &&
      candidate.line > 0 && candidate.quote.trim() && /^enclosing (?:PHP|Python) /.test(candidate.reason));
    annotations.push({ evidence: selected,
      enclosing: header ? { ...copyLine(header), reason: header.reason.trim() } : null });
  }
  return annotations;
}

export function checkedEvidenceScopes(root: string, evidence: EvidenceLine[]): ScopeAnnotation[] {
  const sources = new Map<string, string[]>();
  const check = (item: EvidenceLine) => {
    if (!sources.has(item.file))
      sources.set(item.file, readFileSync(checkedFile(root, item.file), "utf8").split("\n"));
    if (sources.get(item.file)?.[item.line - 1]?.trim() !== item.quote.trim())
      throw new Error(`Scope context quote differs from checked source: ${item.file}:${item.line}`);
  };
  return annotateEvidenceScopes(evidence, (item) => {
    check(item);
    const headers = structuralSupport(root, [item]);
    for (const header of headers) check(header);
    return headers;
  });
}

export function scopeAnswerRequest(query: string, evidence: EvidenceLine[], annotations?: ScopeAnnotation[]) {
  const request = evidenceAnswerRequest(query, evidence);
  if (!annotations) return request;
  return { ...request, prompt: `${request.prompt}\nLexical enclosing declaration metadata per selected line: ${JSON.stringify(annotations)}\nA dictionary or array initializer is not an enclosing callable or class declaration. Null means no enclosing header was provided, not module scope. These lexical labels do not establish binding or claim entailment. Cite only file/line locations from the selected checked evidence; metadata adds no allowed citation locations.` };
}
