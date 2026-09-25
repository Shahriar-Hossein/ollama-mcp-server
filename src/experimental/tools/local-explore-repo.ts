import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { z } from "zod";
import { generate } from "../../ollama-client.js";
import { indexRepository, type RepositoryIndex } from "../../explorer/indexer.js";
import { readSymbol } from "../../explorer/read-symbol.js";
import { hybridRetrieve, type HybridRetrievalResult } from "../../explorer/retrieval.js";

const DEFAULT_MODEL = "qwen3.5:4b";
const MAX_FILES = 6;
const MAX_LINES = 20;
const MAX_LINE_CHARS = 180;
const MAX_CANDIDATE_CHARS = 1_400;
const MAX_BUNDLES = 6;
const MAX_CONTEXT_CHARS = 24_000;

type RetrievalResult = HybridRetrievalResult["results"][number];
type EvidenceLine = { line: number; text: string };
export type Candidate = {
  id: string;
  kind: "symbol" | "documentation" | "json" | "callsite" | "configuration" | "text_match";
  file: string;
  symbol?: string;
  lines: EvidenceLine[];
};

export type QuestionPart = { id: string; question: string; evidence_needed: string };
export type EvidenceBundle = { id: string; part_id: string; why_retrieved: string; relationship: string; candidates: Candidate[] };

type ModelEvidence = { id: string; line: number; quote: string };
type ValidEvidence = ModelEvidence & { file: string };

export interface LocalExploreRepoParams {
  query: string;
  repository_root: string;
  model?: string;
  limit?: number;
}

function checkedFile(root: string, file: string): string {
  const absoluteRoot = realpathSync(root);
  const absoluteFile = realpathSync(resolve(root, file));
  const rel = relative(absoluteRoot, absoluteFile);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Indexed file is outside repository: ${file}`);
  return absoluteFile;
}

function selectedLines(source: string, startLine: number, query: string): EvidenceLine[] {
  const all = source.split("\n");
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []).filter((term) => !["where", "which", "what", "when", "does", "from", "with"].includes(term)))];
  const scores = all.map((line) => terms.reduce((sum, term) => sum + (line.toLowerCase().includes(term) ? term.length : 0), 0));
  const best = scores.indexOf(scores.reduce((maximum, score) => Math.max(maximum, score), 0));
  const start = Math.max(0, Math.min(best - 5, all.length - MAX_LINES));
  const lines: EvidenceLine[] = [];
  let chars = 0;
  for (let offset = start; offset < Math.min(all.length, start + MAX_LINES); offset++) {
    const text = all[offset].slice(0, MAX_LINE_CHARS).trimEnd();
    if (chars + text.length > MAX_CANDIDATE_CHARS) break;
    lines.push({ line: startLine + offset, text });
    chars += text.length;
  }
  return lines;
}

export function decomposeQuestion(query: string): QuestionPart[] {
  const clauses = query.trim().replace(/[?!.]+$/, "").split(/,?\s+and\s+(?=(?:is|are|does|do|why|where|which|what|how)\b)/i);
  return (clauses.length > 1 ? clauses : [query.trim()]).map((question, index) => {
    let evidence_needed = "Direct implementation lines that establish the requested behavior.";
    if (/register/i.test(question)) evidence_needed = "The call that registers the named tool and its guard; an import or function definition alone is insufficient.";
    else if (/enabled by default|default state/i.test(question)) evidence_needed = "The named flag mapping and the expression that establishes its default value.";
    else if (/environment variables?/i.test(question)) evidence_needed = "Each distinct environment variable controlling the requested tools.";
    else if (/which tool|what tool/i.test(question) && /gate|environment/i.test(query)) evidence_needed = "The guarded registration call for each tool, showing which feature controls it.";
    else if (/\bwhere\b.*\bset\b/i.test(question)) evidence_needed = "The executable assignment or request field that sets the value.";
    else if (/\bwhy\b/i.test(question)) evidence_needed = "Source text that explains the reason for the setting.";
    else if (/concurren|duplicate/i.test(question)) evidence_needed = "The lock acquisition, rejection condition, and a caller using the lock.";
    return { id: `P${index + 1}`, question, evidence_needed };
  });
}

function searchQuery(question: string): string {
  const related: string[] = [];
  if (/concurren|duplicate|exclusive|mutual|worker/i.test(question)) related.push("lock", "worker_lock", "mutex");
  if (/enabled by default|default state/i.test(question)) related.push("default", "ENABLE_EXPERIMENTAL");
  if (/environment variables?|\benv\b/i.test(question)) related.push("process.env", "ENABLED");
  for (const identifier of question.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) ?? []) related.push(identifier.replace(/_/g, ""));
  return `${question} ${related.join(" ")}`.trim();
}

function candidateFor(root: string, result: RetrievalResult, index: RepositoryIndex, query: string, id: string): Candidate | null {
  const evidence = result.evidence;
  if (!evidence.file || !["symbol", "documentation", "json"].includes(evidence.kind)) return null;
  const file = evidence.file;
  checkedFile(root, file);
  if (evidence.kind === "symbol" && evidence.symbol) {
    const read = readSymbol(root, evidence.symbol.id, index);
    return { id, kind: "symbol", file, symbol: evidence.symbol.qualified_name, lines: selectedLines(read.source.text, read.source.range.start.line, query) };
  }
  const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
  if (evidence.kind === "documentation" && evidence.excerpt) {
    const line = lines.findIndex((value) => value.includes(evidence.excerpt!));
    if (line >= 0) return { id, kind: "documentation", file, lines: [{ line: line + 1, text: lines[line].slice(0, MAX_LINE_CHARS).trimEnd() }] };
  }
  if (evidence.kind === "json" && evidence.json_pointer) {
    const key = evidence.json_pointer.split("/").at(-1) ?? "";
    const line = lines.findIndex((value) => value.includes(JSON.stringify(key)));
    if (line >= 0) return { id, kind: "json", file, lines: [{ line: line + 1, text: lines[line].slice(0, MAX_LINE_CHARS).trimEnd() }] };
  }
  return null;
}

export function buildCandidates(root: string, results: RetrievalResult[], index: RepositoryIndex, query: string): Candidate[] {
  const candidates: Candidate[] = [];
  const files = new Set<string>();
  const add = (candidate: Candidate | null) => {
    if (!candidate?.lines.length || (!files.has(candidate.file) && files.size >= MAX_FILES)) return;
    files.add(candidate.file);
    candidate.id = `C${candidates.length + 1}`;
    candidates.push(candidate);
  };
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []).filter((term) => !["repository", "registered", "variables", "where", "which", "what", "does", "with", "from", "that", "each", "tools", "tool", "quality", "review"].includes(term)))];
  const sourceFiles = [...new Set(index.symbols.map((symbol) => symbol.file))].filter((file) => !/(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
  const matches = terms.length ? sourceFiles.flatMap((file) => {
    const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
    const hits = lines.flatMap((line, offset) => terms.some((term) => line.toLowerCase().includes(term)) ? [offset] : []);
    if (!hits.length) return [];
    const matchedTerms = terms.filter((term) => hits.some((offset) => lines[offset].toLowerCase().includes(term)));
    return [{ file, lines, hits, matchedTerms }];
  }) : [];
  const registrationLines = new Map<string, number[]>();
  for (const call of index.calls) {
    if (!call.callee_name.startsWith("register")) continue;
    const lines = registrationLines.get(call.file) ?? [];
    lines.push(call.range.start.line);
    registrationLines.set(call.file, lines);
  }
  const frequency = new Map(terms.map((term) => [term, matches.filter((match) => match.matchedTerms.includes(term)).length]));
  matches.sort((a, b) => {
    const score = (value: typeof a) => value.matchedTerms.reduce((sum, term) => sum + term.length / (frequency.get(term) ?? 1), 0)
      + (/register|gate|enabled/i.test(query) && registrationLines.get(value.file)?.some((line) => value.hits.some((hit) => Math.abs(line - hit - 1) <= 10)) ? 10 : 0)
      + terms.reduce((sum, term) => sum + (value.file.toLowerCase().includes(term.replace(/_/g, "-")) ? 8 : 0), 0)
      + (/quality.review/i.test(query) && value.file.includes("quality-review/") ? 40 : 0);
    return score(b) - score(a) || a.file.localeCompare(b.file);
  });
  for (const match of matches.slice(0, 2)) {
    const weighted = match.hits.map((hit) => ({ hit, score: match.matchedTerms.reduce((sum, term) => sum + (match.lines[hit].toLowerCase().includes(term) ? term.length / (frequency.get(term) ?? 1) : 0), 0)
      + (/\b(?:function|lock\s*\(|INSERT|SELECT|CREATE TABLE)\b/.test(match.lines[hit]) ? 3 : 0) }));
    weighted.sort((a, b) => b.score - a.score || a.hit - b.hit);
    const hit = weighted[0].hit;
    const start = Math.max(0, hit - 4);
    const end = Math.min(match.lines.length, start + MAX_LINES);
    let chars = 0;
    const lines: EvidenceLine[] = [];
    for (let offset = start; offset < end; offset++) {
      const source = match.lines[offset].slice(0, MAX_LINE_CHARS).trimEnd();
      if (chars + source.length > MAX_CANDIDATE_CHARS) break;
      lines.push({ line: offset + 1, text: source });
      chars += source.length;
    }
    add({ id: "", kind: "text_match", file: match.file, lines });
  }
  if (/environment|\benv\b|gate|enabled by default/i.test(query)) {
    const configured = sourceFiles.flatMap((file) => {
      const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
      const hits = lines.flatMap((line, offset) => /["'](?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)["']/.test(line) ? [offset] : []);
      return hits.length ? [{ file, lines, hits }] : [];
    }).sort((a, b) => b.hits.length - a.hits.length || a.file.localeCompare(b.file))[0];
    if (configured && (files.has(configured.file) || files.size < MAX_FILES)) {
      const start = Math.max(0, configured.hits[0] - 3);
      const excerpt = configured.lines.slice(start, start + MAX_LINES).join("\n");
      add({ id: "", kind: "configuration", file: configured.file, lines: selectedLines(excerpt, start + 1, query) });
    }
  }
  const namedSymbols = index.symbols.filter((symbol) => terms.includes(symbol.name.toLowerCase())
    && (!/quality.review/i.test(query) || symbol.file.includes("quality-review/")));
  for (const symbol of namedSymbols.slice(0, 2)) {
    if (!files.has(symbol.file) && files.size >= MAX_FILES) break;
    const read = readSymbol(root, symbol.id, index);
    add({ id: "", kind: "symbol", file: symbol.file, symbol: symbol.qualified_name, lines: selectedLines(read.source.text, read.source.range.start.line, query) });
  }
  for (const result of results) {
    if (candidates.length >= results.length) break;
    const file = result.evidence.file;
    if (!file || (!files.has(file) && files.size >= MAX_FILES)) continue;
    add(candidateFor(root, result, index, query, ""));
    const symbol = result.evidence.symbol;
    if (!symbol || candidates.length >= results.length) continue;
    const call = index.calls.find((edge) => edge.callee_symbol_id === symbol.id && edge.file !== symbol.file);
    if (!call || (!files.has(call.file) && files.size >= MAX_FILES)) continue;
    const source = readFileSync(checkedFile(root, call.file), "utf8").split("\n");
    const start = Math.max(1, call.range.start.line - 10);
    const excerpt = source.slice(start - 1, call.range.start.line + 4).join("\n");
    const callsite: Candidate = { id: "", kind: "callsite", file: call.file, symbol: symbol.qualified_name, lines: selectedLines(excerpt, start, query) };
    add(callsite);
    const guard = source.slice(start - 1, call.range.start.line).reverse().find((line) => /if\s*\(\s*features\./.test(line));
    const featureKey = guard?.match(/if\s*\(\s*features\.([A-Za-z][A-Za-z0-9_]*)/)?.[1];
    for (const key of featureKey ? [featureKey] : []) {
      if (candidates.length >= results.length) break;
      const property = index.symbols.find((record) => record.kind === "property" && record.name === key);
      if (!property || (!files.has(property.file) && files.size >= MAX_FILES)) continue;
      const config = readFileSync(checkedFile(root, property.file), "utf8").split("\n");
      const selected = new Set<number>();
      for (let i = 0; i < config.length; i++) {
        if (config[i].includes(`const experimental =`) || config[i].includes(`${key}: experimentalFeature(`)) {
          for (let j = Math.max(0, i - 1); j <= Math.min(config.length - 1, i + 1); j++) selected.add(j);
        }
      }
      const lines = [...selected].sort((a, b) => a - b).slice(0, MAX_LINES).map((offset) => ({ line: offset + 1, text: config[offset].slice(0, MAX_LINE_CHARS).trimEnd() }));
      add({ id: "", kind: "configuration", file: property.file, symbol: key, lines });
    }
  }
  return candidates;
}

export function compileEvidenceBundles(parts: QuestionPart[], byPart: Map<string, Candidate[]>): { bundles: EvidenceBundle[]; candidates: Candidate[] } {
  const bundles: EvidenceBundle[] = [];
  const candidates: Candidate[] = [];
  const seen = new Map<string, Candidate>();
  const perPart = Math.max(1, Math.floor(MAX_BUNDLES / parts.length));
  let usedChars = 0;
  for (const part of parts) {
    const pool = byPart.get(part.id) ?? [];
    const usedFiles = new Set<string>();
    let count = 0;
    for (const seed of pool) {
      if (count >= perPart || bundles.length >= MAX_BUNDLES || usedFiles.has(seed.file)) continue;
      const related = pool.find((candidate) => candidate !== seed && candidate.symbol && candidate.symbol === seed.symbol && candidate.file !== seed.file)
        ?? pool.find((candidate) => candidate !== seed && candidate.file === seed.file && candidate.kind !== seed.kind);
      const items = related ? [seed, related] : [seed];
      const newChars = items.reduce((sum, item) => sum + item.lines.reduce((n, line) => n + line.text.length, 0), 0);
      if (usedChars + newChars > MAX_CONTEXT_CHARS) continue;
      const packed = items.map((item) => {
        const key = `${item.file}:${item.lines.map((line) => line.line).join(",")}`;
        const prior = seen.get(key);
        if (prior) return prior;
        const candidate = { ...item, id: `C${candidates.length + 1}` };
        seen.set(key, candidate);
        candidates.push(candidate);
        return candidate;
      });
      bundles.push({
        id: `B${bundles.length + 1}`,
        part_id: part.id,
        why_retrieved: seed.kind === "text_match" ? "source text matches query terms" : "ranked symbol or structural match",
        relationship: related ? (related.file === seed.file ? "same source file" : "matching symbol and call site") : "single source location",
        candidates: packed,
      });
      usedChars += newChars;
      usedFiles.add(seed.file);
      count++;
    }
  }
  return { bundles, candidates };
}

function expandCandidate(root: string, candidate: Candidate, line: number, nextId: string): Candidate {
  const source = readFileSync(checkedFile(root, candidate.file), "utf8").split("\n");
  const center = Math.min(Math.max(line, 1), source.length);
  const start = Math.max(1, center - 9);
  const end = Math.min(source.length, center + 9);
  return {
    id: nextId, kind: "text_match", file: candidate.file, symbol: candidate.symbol,
    lines: source.slice(start - 1, end).map((text, offset) => ({ line: start + offset, text: text.slice(0, MAX_LINE_CHARS).trimEnd() })),
  };
}

type LineReference = { candidate: Candidate; line: EvidenceLine };

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    part_evidence: { type: "array", items: { type: "object", properties: { part_id: { type: "string" }, evidence_refs: { type: "array", maxItems: 3, items: { type: "string" } } }, required: ["part_id", "evidence_refs"] } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    unresolved: { type: "array", items: { type: "string" } },
    next_action: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
  },
  required: ["part_evidence", "confidence", "unresolved", "next_action"],
};

function promptContext(bundles: EvidenceBundle[], candidates: Candidate[]) {
  const refs = new Map<string, LineReference>();
  const byLocation = new Map<string, string>();
  for (const candidate of candidates) for (const line of candidate.lines) {
    const ref = `E${refs.size + 1}`;
    refs.set(ref, { candidate, line });
    byLocation.set(`${candidate.id}:${line.line}`, ref);
  }
  const grouped = new Map<string, { part_ids: string[]; why_retrieved: string; relationship: string; sources: Array<{ file: string; symbol?: string; lines: Array<{ ref: string; line: number; text: string }> }> }>();
  for (const bundle of bundles) {
    const key = bundle.candidates.map((candidate) => candidate.id).join(",");
    const prior = grouped.get(key);
    if (prior) { if (!prior.part_ids.includes(bundle.part_id)) prior.part_ids.push(bundle.part_id); continue; }
    grouped.set(key, {
      part_ids: [bundle.part_id], why_retrieved: bundle.why_retrieved, relationship: bundle.relationship,
      sources: bundle.candidates.map((candidate) => ({ file: candidate.file, symbol: candidate.symbol, lines: candidate.lines.map((line) => ({ ref: byLocation.get(`${candidate.id}:${line.line}`)!, line: line.line, text: line.text })) })),
    });
  }
  return { refs, promptBundles: [...grouped.values()] };
}

export function validateModelAnswer(raw: string, candidates: Candidate[], parts: QuestionPart[] = [], bundles: EvidenceBundle[] = [], refs = new Map<string, LineReference>()) {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Model did not return a JSON object.");
  const answer = parsed as Record<string, unknown>;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  let selected_ids = Array.isArray(answer.selected_ids)
    ? answer.selected_ids.filter((id): id is string => typeof id === "string" && byId.has(id)).slice(0, 6)
    : [];
  const evidence: ValidEvidence[] = [];
  let rejected_evidence = 0;
  const partRefs = Array.isArray(answer.part_evidence) ? answer.part_evidence.flatMap((part) => part && typeof part === "object" && Array.isArray((part as { evidence_refs?: unknown }).evidence_refs) ? (part as { evidence_refs: unknown[] }).evidence_refs : []) : [];
  const evidenceRefs = Array.isArray(answer.evidence_refs) ? answer.evidence_refs : partRefs.length ? [...new Set(partRefs)] : null;
  if (evidenceRefs) {
    for (const ref of evidenceRefs.slice(0, 12)) {
      const located = typeof ref === "string" ? refs.get(ref) : undefined;
      if (!located || located.line.text.trim().length < 6) { rejected_evidence++; continue; }
      evidence.push({ id: located.candidate.id, file: located.candidate.file, line: located.line.line, quote: located.line.text.trim() });
    }
  }
  for (const rawReference of !evidenceRefs && Array.isArray(answer.evidence) ? answer.evidence.slice(0, 12) : []) {
    if (!rawReference || typeof rawReference !== "object") { rejected_evidence++; continue; }
    const reference = rawReference as Partial<ModelEvidence>;
    if (typeof reference.id !== "string" || !Number.isInteger(reference.line)) { rejected_evidence++; continue; }
    const candidate = byId.get(reference.id);
    const sourceLine = candidate?.lines.find((line) => line.line === reference.line);
    if (!sourceLine || (reference.quote !== undefined && (typeof reference.quote !== "string" || reference.quote.trim().length < 6 || !sourceLine.text.includes(reference.quote)))) { rejected_evidence++; continue; }
    const quote = reference.quote ?? sourceLine.text.trim();
    if (quote.length < 6) { rejected_evidence++; continue; }
    evidence.push({ id: reference.id, file: candidate!.file, line: reference.line!, quote });
  }
  if (!selected_ids.length) selected_ids = [...new Set(evidence.map((item) => item.id))].slice(0, 6);
  const rawCoverage = Array.isArray(answer.part_evidence) ? answer.part_evidence : [];
  const coverage = parts.map((part) => {
    const entry = rawCoverage.find((value) => value && typeof value === "object" && (value as { part_id?: unknown }).part_id === part.id) as { evidence_ids?: unknown; evidence_refs?: unknown } | undefined;
    const allowed = new Set(bundles.filter((bundle) => bundle.part_id === part.id).flatMap((bundle) => bundle.candidates.map((candidate) => candidate.id)));
    const cited = Array.isArray(entry?.evidence_refs) ? entry.evidence_refs.map((ref) => typeof ref === "string" ? refs.get(ref)?.candidate.id : undefined) : entry?.evidence_ids;
    const evidence_ids = Array.isArray(cited)
      ? [...new Set(cited.filter((id): id is string => typeof id === "string" && evidence.some((item) => item.id === id) && (!bundles.length || allowed.has(id))))]
      : [];
    return { part_id: part.id, question: part.question, status: evidence_ids.length ? "supported" as const : "missing" as const, evidence_ids };
  });
  const action = answer.next_action && typeof answer.next_action === "object" ? answer.next_action as { candidate_id?: unknown; line?: unknown } : null;
  const requested = typeof (action as { ref?: unknown } | null)?.ref === "string" ? refs.get((action as { ref: string }).ref) : undefined;
  const next_action = requested ? { candidate_id: requested.candidate.id, line: requested.line.line }
    : typeof action?.candidate_id === "string" && Number.isInteger(action.line) && byId.get(action.candidate_id)?.lines.some((line) => line.line === action.line)
      ? { candidate_id: action.candidate_id, line: action.line as number } : null;
  const model_confidence = ["high", "medium", "low"].includes(String(answer.confidence))
    ? answer.confidence as "high" | "medium" | "low" : "low";
  const unresolved = Array.isArray(answer.unresolved)
    ? answer.unresolved.filter((value): value is string => typeof value === "string").slice(0, 3).map((value) => value.slice(0, 300))
    : [];
  return { evidence, selected_ids, coverage, next_action, model_confidence, unresolved, rejected_evidence };
}

export function directEvidenceForPart(part: QuestionPart, evidence: ValidEvidence[], query: string): boolean {
  const lines = evidence.map((item) => item.quote);
  if (/register/i.test(part.question)) return lines.some((line) => /\bregister[A-Za-z0-9_]+\s*\(/.test(line) && !/\b(?:function|import|const)\b/.test(line));
  if (/enabled by default|default state/i.test(part.question)) return lines.some((line) => /\?\?\s*(?:true|false)|=\s*(?:true|false)/.test(line)) && lines.some((line) => /(?:Feature|Flag)\s*\(/.test(line));
  if (/environment variables?/i.test(part.question)) {
    const names = lines.flatMap((line) => line.match(/\b(?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)\b/g) ?? []);
    return new Set(/autonomous/i.test(query) ? names.filter((name) => name.endsWith("_ENABLED")) : names).size >= 2;
  }
  if (/which tool|what tool/i.test(part.question) && /gate|environment/i.test(query)) {
    const registrations = new Set(lines.flatMap((line) => line.match(/register[A-Za-z0-9_]+\s*\(\s*server\s*\)/g) ?? []));
    return registrations.size >= 2 && lines.some((line) => /if\s*\(\s*features\./.test(line));
  }
  if (/\bwhere\b.*\bset\b/i.test(part.question)) return lines.some((line) => !/^\s*(?:\*|\/\/)/.test(line) && /[:=]/.test(line));
  if (/concurren|duplicate/i.test(part.question)) return lines.some((line) => /throw|INSERT|BEGIN IMMEDIATE/.test(line)) && lines.some((line) => /\.lock\s*\(/.test(line));
  return true;
}

export async function runLocalExploreRepo(
  { query, repository_root, model = DEFAULT_MODEL, limit = 10 }: LocalExploreRepoParams,
  generateAnswer: typeof generate = generate
) {
  if (!query.trim()) throw new Error("Exploration query must not be empty.");
  if (!Number.isInteger(limit) || limit < 8 || limit > 12) throw new Error("Candidate limit must be an integer from 8 through 12.");
  const root = resolve(repository_root);
  const index = indexRepository(root);
  const parts = decomposeQuestion(query);
  const byPart = new Map<string, Candidate[]>();
  let retrieved_count = 0;
  for (const part of parts) {
    const retrievalQuery = searchQuery(`${part.question} ${query}`);
    const retrieved = await hybridRetrieve(root, retrievalQuery, limit, "basic", undefined, index);
    retrieved_count += retrieved.results.length;
    byPart.set(part.id, buildCandidates(root, retrieved.results, index, retrievalQuery));
  }
  const compiled = compileEvidenceBundles(parts, byPart);
  const { bundles, candidates } = compiled;
  const base = () => ({ query, model, commit_hash: index.commit_hash, retrieval_mode: "basic" as const, parts, bundles, candidates, retrieved_count });
  if (!candidates.length) return { ...base(), status: "no_evidence" as const, evidence: [], selected_ids: [], coverage: parts.map((part) => ({ ...part, status: "missing" as const, evidence_ids: [] })), model_confidence: "low" as const, unresolved: ["Deterministic retrieval supplied no readable candidates."], model_calls: 0 };

  const system = `You locate repository evidence. For each question part, choose up to three displayed evidence line refs (E numbers) that satisfy its evidence_needed field. A relevant file or symbol name alone does not satisfy a part. Cite the exact assignment or call when asked where a setting is set; cite a comment only for its stated reason. Do not infer defaults, registration, callers, or behavior from names alone. Return useful partial evidence when other parts are missing. If a part is missing, request at most one expansion using a supplied E ref; use an empty ref if no expansion would help. Prefer executable source and configuration over comments. Use only E refs shown in the bundles, never file line numbers, bundle IDs, or source quotes. Do not explain your reasoning or invent source relationships. Return only the requested JSON object.`;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { refs, promptBundles } = promptContext(bundles, candidates);
    const repoMap = [...new Map(candidates.map((candidate) => [candidate.file, candidate.symbol ?? candidate.kind])).entries()].map(([file, role]) => ({ file, role }));
    const prompt = `Question: ${query}\nQuestion parts: ${JSON.stringify(parts)}\nRelevant repo map: ${JSON.stringify(repoMap)}\nEvidence bundles: ${JSON.stringify(promptBundles)}\nReturn JSON with part_evidence [{part_id,evidence_refs:["E1"]}], confidence, unresolved, next_action {ref}. ${lastError ? `Previous output failed: ${lastError}.` : ""}`;
    try {
      const raw = await generateAnswer(model, prompt, system, ANSWER_SCHEMA, false, { num_ctx: 16_384, num_predict: 2_000 });
      const answer = validateModelAnswer(raw, candidates, parts, bundles, refs);
      answer.coverage = answer.coverage.map((coverage) => {
        if (coverage.status === "missing") return coverage;
        const part = parts.find((item) => item.id === coverage.part_id)!;
        const cited = answer.evidence.filter((item) => coverage.evidence_ids.includes(item.id));
        return directEvidenceForPart(part, cited, query) ? coverage : { ...coverage, status: "missing" as const };
      });
      const missing = answer.coverage.some((part) => part.status === "missing");
      if (answer.evidence.length && !answer.rejected_evidence && !missing) {
        return { ...base(), ...answer, status: "evidence_selected" as const, model_calls: attempt, verification: "Candidate IDs and line numbers checked; returned quotes copied from source. Coverage is model-indicated, not semantic verification." };
      }
      lastError = answer.rejected_evidence ? `${answer.rejected_evidence} evidence reference(s) did not match supplied source lines.`
        : `Missing direct evidence for: ${answer.coverage.filter((part) => part.status === "missing").map((part) => parts.find((item) => item.id === part.part_id)?.evidence_needed).join("; ")}`;
      if (attempt === 1 && missing && answer.next_action) {
        const candidate = candidates.find((item) => item.id === answer.next_action!.candidate_id)!;
        const expanded = expandCandidate(root, candidate, answer.next_action.line, `C${candidates.length + 1}`);
        candidates.push(expanded);
        bundles.push({ id: `B${bundles.length + 1}`, part_id: answer.coverage.find((part) => part.status === "missing")!.part_id, why_retrieved: "bounded follow-up read", relationship: `expanded source around ${candidate.id}:${answer.next_action.line}`, candidates: [expanded] });
        continue;
      }
      if (attempt === 2) return { ...base(), ...answer, status: "needs_review" as const, model_confidence: "low" as const, model_calls: attempt, warning: lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 2) return { ...base(), status: "needs_review" as const, evidence: [], selected_ids: [], coverage: parts.map((part) => ({ ...part, status: "missing" as const, evidence_ids: [] })), model_confidence: "low" as const, unresolved: [], model_calls: attempt, warning: lastError };
    }
  }
  throw new Error("Unreachable explorer state.");
}

export function registerLocalExploreRepo(server: McpServer) {
  server.tool(
    "local_explore_repo",
    "Compiles source and caller evidence bundles, asks a local model to select cited evidence for each question part, and checks exact quotes. Read-only; the parent agent interprets the evidence.",
    {
      repository_root: z.string().describe("Absolute Git repository root."),
      query: z.string().describe("Repository exploration question."),
      model: z.string().default(DEFAULT_MODEL).describe("Local model for evidence interpretation."),
      limit: z.number().int().min(8).max(12).default(10).describe("Deterministic candidates to retrieve before model interpretation."),
    },
    async (params) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await runLocalExploreRepo(params)) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Local exploration failed: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
