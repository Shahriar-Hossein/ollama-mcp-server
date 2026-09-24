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
const MAX_LINES = 16;
const MAX_LINE_CHARS = 180;
const MAX_CANDIDATE_CHARS = 900;

type RetrievalResult = HybridRetrievalResult["results"][number];
type EvidenceLine = { line: number; text: string };
export type Candidate = {
  id: string;
  kind: "symbol" | "documentation" | "json" | "callsite" | "configuration" | "text_match";
  file: string;
  symbol?: string;
  lines: EvidenceLine[];
};

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
  const chosen = new Set<number>();
  for (let i = 0; i < Math.min(4, all.length); i++) chosen.add(i);
  for (let i = 0; i < all.length && chosen.size < MAX_LINES; i++) {
    if (!terms.some((term) => all[i].toLowerCase().includes(term))) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(all.length - 1, i + 2) && chosen.size < MAX_LINES; j++) chosen.add(j);
  }
  for (let i = 0; i < all.length && chosen.size < MAX_LINES; i++) chosen.add(i);
  const lines: EvidenceLine[] = [];
  let chars = 0;
  for (const offset of [...chosen].sort((a, b) => a - b)) {
    const text = all[offset].slice(0, MAX_LINE_CHARS).trimEnd();
    if (chars + text.length > MAX_CANDIDATE_CHARS) break;
    lines.push({ line: startLine + offset, text });
    chars += text.length;
  }
  return lines;
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
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9_]{8,}/g) ?? []).filter((term) => !["repository", "registered", "variables"].includes(term)))];
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
      + (registrationLines.get(value.file)?.some((line) => value.hits.some((hit) => Math.abs(line - hit - 1) <= 10)) ? 10 : 0);
    return score(b) - score(a) || a.file.localeCompare(b.file);
  });
  for (const match of matches.slice(0, 2)) {
    const offsets = new Set<number>();
    const radius = match.hits.length > 1 ? 3 : 8;
    for (const hit of [match.hits[0], match.hits.at(-1)!]) {
      for (let offset = Math.max(0, hit - radius); offset <= Math.min(match.lines.length - 1, hit + radius); offset++) offsets.add(offset);
    }
    let chars = 0;
    const lines: EvidenceLine[] = [];
    for (const offset of [...offsets].sort((a, b) => a - b)) {
      const source = match.lines[offset].slice(0, MAX_LINE_CHARS).trimEnd();
      if (chars + source.length > MAX_CANDIDATE_CHARS || lines.length >= MAX_LINES) break;
      lines.push({ line: offset + 1, text: source });
      chars += source.length;
    }
    add({ id: "", kind: "text_match", file: match.file, lines });
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

export function validateModelAnswer(raw: string, candidates: Candidate[]): { evidence: ValidEvidence[]; selected_ids: string[]; model_confidence: "high" | "medium" | "low"; unresolved: string[]; rejected_evidence: number } {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Model did not return a JSON object.");
  const answer = parsed as Record<string, unknown>;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected_ids = Array.isArray(answer.selected_ids)
    ? answer.selected_ids.filter((id): id is string => typeof id === "string" && byId.has(id)).slice(0, 5)
    : [];
  const evidence: ValidEvidence[] = [];
  let rejected_evidence = 0;
  for (const rawReference of Array.isArray(answer.evidence) ? answer.evidence.slice(0, 8) : []) {
    if (!rawReference || typeof rawReference !== "object") { rejected_evidence++; continue; }
    const reference = rawReference as Partial<ModelEvidence>;
    if (typeof reference.id !== "string" || !Number.isInteger(reference.line) || typeof reference.quote !== "string" || reference.quote.trim().length < 6) { rejected_evidence++; continue; }
    const candidate = byId.get(reference.id);
    if (!candidate?.lines.some((line) => line.line === reference.line && line.text.includes(reference.quote!))) { rejected_evidence++; continue; }
    evidence.push({ id: reference.id, file: candidate.file, line: reference.line!, quote: reference.quote });
  }
  const model_confidence = ["high", "medium", "low"].includes(String(answer.confidence))
    ? answer.confidence as "high" | "medium" | "low" : "low";
  const unresolved = Array.isArray(answer.unresolved)
    ? answer.unresolved.filter((value): value is string => typeof value === "string").slice(0, 3).map((value) => value.slice(0, 300))
    : [];
  return { evidence, selected_ids, model_confidence, unresolved, rejected_evidence };
}

export async function runLocalExploreRepo(
  { query, repository_root, model = DEFAULT_MODEL, limit = 10 }: LocalExploreRepoParams,
  generateAnswer: typeof generate = generate
) {
  if (!query.trim()) throw new Error("Exploration query must not be empty.");
  if (!Number.isInteger(limit) || limit < 8 || limit > 12) throw new Error("Candidate limit must be an integer from 8 through 12.");
  const root = resolve(repository_root);
  const index = indexRepository(root);
  const retrieved = await hybridRetrieve(root, query, limit, "basic", undefined, index);
  const candidates = buildCandidates(root, retrieved.results, index, query);
  const base = { query, model, commit_hash: index.commit_hash, retrieval_mode: "basic" as const, candidates, retrieved_count: retrieved.results.length };
  if (!candidates.length) return { ...base, status: "no_evidence" as const, evidence: [], selected_ids: [], model_confidence: "low" as const, unresolved: ["Deterministic retrieval supplied no readable candidates."], model_calls: 0 };

  const system = `You are a repository reconnaissance assistant. Use only the numbered candidate excerpts in the user message. Return a JSON object with selected_ids (up to 5 candidate IDs, likely implementation first), evidence (2 to 6 objects with id, line, and quote), confidence (high, medium, or low), and unresolved (array of short strings). Each quote must be an exact substring of the cited displayed line, at least 6 characters. Select lines that let the parent answer the question, including conditions and defaults when asked. Do not invent paths, lines, symbols, or relationships. If the evidence is insufficient, return an empty evidence array and low confidence. The parent agent will make all behavioral judgments.`;
  const evidence = JSON.stringify(candidates);
  let prompt = `Question: ${query}\nCandidate excerpts: ${evidence}\nReturn JSON only.`;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await generateAnswer(model, prompt, system, "json", false, { num_ctx: 16_384, num_predict: 2_000 });
      const answer = validateModelAnswer(raw, candidates);
      if (answer.evidence.length && !answer.rejected_evidence) {
        return { ...base, ...answer, status: "evidence_selected" as const, model_calls: attempt, verification: "Candidate IDs and exact quotes checked. No model-authored behavioral claims are returned." };
      }
      lastError = answer.rejected_evidence ? `${answer.rejected_evidence} quote(s) did not match supplied source lines.` : "No source-backed evidence was selected.";
      if (attempt === 2) return { ...base, ...answer, status: "needs_review" as const, model_confidence: "low" as const, model_calls: attempt, warning: lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 2) return { ...base, status: "needs_review" as const, evidence: [], selected_ids: [], model_confidence: "low" as const, unresolved: [], model_calls: attempt, warning: lastError };
    }
    prompt = `Question: ${query}\nCandidate excerpts: ${evidence}\nYour previous answer failed validation: ${lastError}\nReturn a corrected JSON object using only exact quoted lines and candidate IDs. If unsure, return empty evidence and low confidence.`;
  }
  throw new Error("Unreachable explorer state.");
}

export function registerLocalExploreRepo(server: McpServer) {
  server.tool(
    "local_explore_repo",
    "Deterministically retrieves source candidates and callers, asks a local model to interpret short excerpts, and checks its cited quotes. Read-only; the parent agent interprets the evidence.",
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
