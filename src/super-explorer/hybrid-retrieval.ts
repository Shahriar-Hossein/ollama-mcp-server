import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { indexRepository, type RepositoryIndex, type SymbolRecord } from "./indexer.js";
import { semanticSearch } from "./semantic-search.js";

const RRF_K = 60;
const RRF_WEIGHT: Record<RetrievalSource, number> = {
  lexical: 1,
  semantic: 1,
  structural: 1,
  documentation: 3,
  history: 3,
  configuration: 3,
  conditional: 3,
};

export type RetrievalMode = "lexical" | "hybrid";
export type RetrievalSource = "lexical" | "semantic" | "structural" | "documentation" | "history" | "configuration" | "conditional";

/**
 * A question about gating vocabulary rarely shares any substring with the
 * guard's own condition text (e.g. "which env vars gate the tools" vs.
 * `process.env.CLOUD_CLAUDE_ENABLED === "1"`), so lexical/structural search
 * can't bridge it. This trigger list turns the question itself into the
 * signal instead: any mention of gating surfaces every guarded call target.
 */
const GUARD_TRIGGER_WORDS = ["gate", "gated", "gates", "gating", "guard", "guarded", "guards", "environment", "env", "enable", "enabled", "disable", "disabled", "flag", "conditional", "condition", "toggle"];

type EvidenceCandidate =
  | { id: string; kind: "symbol"; symbol: SymbolRecord }
  | { id: string; kind: "documentation"; file: string; excerpt: string }
  | { id: string; kind: "json"; file: string; json_pointer: string; value: string }
  | { id: string; kind: "git_commit"; commit_hash: string; subject: string; files: string[] };

export interface HybridRetrievalResult {
  commit_hash: string;
  mode: RetrievalMode;
  query: string;
  results: Array<{
    score: number;
    sources: Array<{ source: RetrievalSource; rank: number }>;
    evidence: {
      kind: EvidenceCandidate["kind"];
      file?: string;
      excerpt?: string;
      json_pointer?: string;
      value?: string;
      commit_hash?: string;
      subject?: string;
      files?: string[];
      symbol?: Pick<SymbolRecord, "id" | "file" | "qualified_name" | "kind" | "range">;
      /** Distinct guard conditions found on call sites that invoke this symbol, if any. */
      guarded_by?: string[];
    };
    /** Kept for source-symbol callers; non-symbol evidence is in `evidence`. */
    symbol?: Pick<SymbolRecord, "id" | "file" | "qualified_name" | "kind" | "range">;
  }>;
}

type RankedCandidate = { candidate: EvidenceCandidate; score: number };

function queryTerms(query: string): string[] {
  const terms = query
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  return [...new Set(terms.filter((term) => term.length > 1))];
}

function hasAnyTerm(terms: string[], values: string[]): boolean {
  return terms.some((term) => values.includes(term));
}

function hasAllTerms(terms: string[], values: string[]): boolean {
  return values.every((term) => terms.includes(term));
}

function lexicalSearch(root: string, terms: string[], index: RepositoryIndex): RankedCandidate[] {
  if (!terms.length) return [];
  return index.symbols.flatMap((symbol) => {
    const source = readFileSync(resolve(root, symbol.file))
      .subarray(symbol.range.start.byte, symbol.range.end.byte)
      .toString("utf8")
      .toLocaleLowerCase();
    const name = `${symbol.name} ${symbol.qualified_name}`.toLocaleLowerCase();
    const signature = symbol.signature.toLocaleLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) score += 8;
      if (signature.includes(term)) score += 3;
      if (symbol.file.toLocaleLowerCase().includes(term)) score += 2;
      if (source.includes(term)) score += 1;
    }
    return score ? [{ candidate: { id: symbol.id, kind: "symbol" as const, symbol }, score }] : [];
  }).sort(compareCandidates);
}

/** Maps query-matching graph records back to declarations without claiming that an unresolved edge is exact. */
function structuralSearch(terms: string[], index: RepositoryIndex): RankedCandidate[] {
  if (!terms.length) return [];
  const scores = new Map<string, { symbol: SymbolRecord; score: number }>();
  const byId = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const containing = (file: string, byte: number) => index.symbols
    .filter((symbol) => symbol.file === file && symbol.range.start.byte <= byte && byte <= symbol.range.end.byte)
    .sort((left, right) => left.range.end.byte - left.range.start.byte - (right.range.end.byte - right.range.start.byte))[0];
  const add = (symbol: SymbolRecord | undefined, score: number) => {
    if (!symbol) return;
    const prior = scores.get(symbol.id);
    scores.set(symbol.id, { symbol, score: (prior?.score ?? 0) + score });
  };
  const matches = (value: string) => terms.some((term) => value.toLocaleLowerCase().includes(term));

  for (const reference of index.references) {
    if (!matches(reference.name)) continue;
    add(reference.target_symbol_id ? byId.get(reference.target_symbol_id) : undefined, 3);
    add(reference.source_symbol_id ? byId.get(reference.source_symbol_id) : containing(reference.file, reference.range.start.byte), 2);
  }
  for (const call of index.calls) {
    if (!matches(call.callee_name)) continue;
    add(call.callee_symbol_id ? byId.get(call.callee_symbol_id) : undefined, 3);
    add(call.caller_symbol_id ? byId.get(call.caller_symbol_id) : containing(call.file, call.range.start.byte), 2);
  }
  for (const dependency of index.dependencies) {
    if (!matches(dependency.module_specifier)) continue;
    for (const symbol of index.symbols) if (symbol.file === dependency.file || symbol.file === dependency.target_file) add(symbol, 1);
  }
  for (const test of index.tests) {
    if (!matches(test.name)) continue;
    add(containing(test.file, test.range.start.byte), 1);
  }
  return [...scores.values()]
    .map(({ symbol, score }) => ({ candidate: { id: symbol.id, kind: "symbol" as const, symbol }, score }))
    .sort(compareCandidates);
}

/** Surfaces every symbol reached only through a guarded call, ranked by term overlap with the guard's own condition text. */
function conditionalSearch(terms: string[], index: RepositoryIndex): RankedCandidate[] {
  const byId = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const scores = new Map<string, { symbol: SymbolRecord; score: number }>();
  for (const call of index.calls) {
    if (!call.guard_condition || !call.callee_symbol_id) continue;
    const symbol = byId.get(call.callee_symbol_id);
    if (!symbol) continue;
    const lowerGuard = call.guard_condition.toLocaleLowerCase();
    const overlap = terms.filter((term) => lowerGuard.includes(term)).length;
    const score = 1 + overlap * 2;
    const prior = scores.get(symbol.id);
    if (!prior || score > prior.score) scores.set(symbol.id, { symbol, score });
  }
  return [...scores.values()]
    .map(({ symbol, score }) => ({ candidate: { id: symbol.id, kind: "symbol" as const, symbol }, score }))
    .sort(compareCandidates);
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  return left.candidate.id.localeCompare(right.candidate.id);
}

function documentSearch(root: string, terms: string[]): RankedCandidate[] {
  if (!terms.length) return [];
  const files = execFileSync("git", ["ls-files", "docs"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => file.endsWith(".md"));
  return files.flatMap((file) => {
    const text = readFileSync(resolve(root, file), "utf8");
    const lower = text.toLocaleLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    if (score < 2) return [];
    const matchedLine = text.split("\n").find((line) => terms.some((term) => line.toLocaleLowerCase().includes(term))) ?? "";
    return [{ candidate: { id: `documentation:${file}`, kind: "documentation" as const, file, excerpt: matchedLine.trim().slice(0, 500) }, score }];
  }).sort(compareCandidates);
}

function packageScriptSearch(root: string, terms: string[]): RankedCandidate[] {
  if (!terms.length) return [];
  const files = execFileSync("git", ["ls-files", "*package*.json"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  return files.flatMap((file) => {
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), "utf8"));
    const scripts = parsed && typeof parsed === "object" && "scripts" in parsed && (parsed as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== "object") return [];
    return Object.entries(scripts).flatMap(([name, value]) => {
      if (typeof value !== "string") return [];
      const searchable = `${file} ${name} ${value}`.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (searchable.includes(term) ? 2 : 0), 0);
      return score >= 2 ? [{ candidate: { id: `json:${file}#/scripts/${name}`, kind: "json" as const, file, json_pointer: `/scripts/${name}`, value }, score }] : [];
    });
  }).sort(compareCandidates);
}

function historySearch(root: string, terms: string[]): RankedCandidate[] {
  if (!terms.length) return [];
  const records: Array<{ commit_hash: string; subject: string; files: string[] }> = [];
  let current: { commit_hash: string; subject: string; files: string[] } | null = null;
  for (const line of execFileSync("git", ["log", "--format=%H%x1f%s", "--name-only"], { cwd: root, encoding: "utf8" }).split("\n")) {
    const separator = line.indexOf("\x1f");
    if (separator >= 0) {
      if (current) records.push(current);
      current = { commit_hash: line.slice(0, separator), subject: line.slice(separator + 1), files: [] };
    } else if (current && line) {
      current.files.push(line);
    }
  }
  if (current) records.push(current);
  return records.flatMap(({ commit_hash, subject, files }) => {
    const subjectTerms = new Set(queryTerms(subject));
    const fileTerms = new Set(queryTerms(files.join(" ")));
    const score = terms.reduce((sum, term) => sum + (subjectTerms.has(term) ? 6 : 0) + (fileTerms.has(term) ? 1 : 0), 0);
    return score >= 4 ? [{ candidate: { id: `git:${commit_hash}`, kind: "git_commit" as const, commit_hash, subject, files }, score }] : [];
  }).sort(compareCandidates);
}

/** Guard conditions found on call sites that invoke `symbolId`, deduplicated and in call order. */
function guardConditionsFor(index: RepositoryIndex, symbolId: string): string[] {
  return [...new Set(
    index.calls
      .filter((call) => call.callee_symbol_id === symbolId && call.guard_condition)
      .map((call) => call.guard_condition!)
  )];
}

function evidenceFor(candidate: EvidenceCandidate, index: RepositoryIndex): HybridRetrievalResult["results"][number]["evidence"] {
  switch (candidate.kind) {
    case "symbol": {
      const guardedBy = guardConditionsFor(index, candidate.symbol.id);
      return {
        kind: candidate.kind,
        file: candidate.symbol.file,
        symbol: { id: candidate.symbol.id, file: candidate.symbol.file, qualified_name: candidate.symbol.qualified_name, kind: candidate.symbol.kind, range: candidate.symbol.range },
        ...(guardedBy.length ? { guarded_by: guardedBy } : {}),
      };
    }
    case "documentation": return candidate;
    case "json": return candidate;
    case "git_commit": return candidate;
  }
}

function mergeRankings(rankings: Array<{ source: RetrievalSource; candidates: RankedCandidate[] }>, limit: number, index: RepositoryIndex) {
  const merged = new Map<string, { candidate: EvidenceCandidate; score: number; sources: Array<{ source: RetrievalSource; rank: number }> }>();
  for (const { source, candidates } of rankings) {
    for (const [offset, candidate] of candidates.entries()) {
      const rank = offset + 1;
      const prior = merged.get(candidate.candidate.id) ?? { candidate: candidate.candidate, score: 0, sources: [] };
      prior.score += RRF_WEIGHT[source] / (RRF_K + rank);
      prior.sources.push({ source, rank });
      merged.set(candidate.candidate.id, prior);
    }
  }
  return [...merged.values()]
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, limit)
    .map(({ candidate, score, sources }) => {
      const evidence = evidenceFor(candidate, index);
      return {
        score,
        sources: sources.sort((left, right) => left.source.localeCompare(right.source)),
        evidence,
        ...(evidence.symbol ? { symbol: evidence.symbol } : {}),
      };
    });
}

/** Retrieves source symbols plus documentation, package scripts, and commit evidence using RRF. */
export async function hybridRetrieve(repositoryRoot: string, query: string, limit = 10, mode: RetrievalMode = "hybrid", model?: string): Promise<HybridRetrievalResult> {
  const root = resolve(repositoryRoot);
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Retrieval query must not be empty.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Retrieval result limit must be an integer from 1 through 100.");
  const index = indexRepository(root);
  const lexical = lexicalSearch(root, queryTerms(trimmedQuery), index);
  if (mode === "lexical") return { commit_hash: index.commit_hash, mode, query: trimmedQuery, results: mergeRankings([{ source: "lexical", candidates: lexical }], limit, index) };

  const semantic = await semanticSearch(root, trimmedQuery, 100, model);
  if (semantic.commit_hash !== index.commit_hash) throw new Error("Semantic index commit does not match the structural index.");
  const byId = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  return {
    commit_hash: index.commit_hash,
    mode,
    query: trimmedQuery,
    results: mergeRankings([
      { source: "lexical", candidates: lexical },
      { source: "semantic", candidates: semantic.results.flatMap((result) => {
        const symbol = byId.get(result.symbol.id);
        return symbol ? [{ candidate: { id: symbol.id, kind: "symbol", symbol }, score: result.score }] : [];
      }) },
      { source: "structural", candidates: structuralSearch(queryTerms(trimmedQuery), index) },
      {
        source: "documentation",
        candidates: hasAnyTerm(queryTerms(trimmedQuery), ["confidence", "documentation", "document", "pilot", "benchmark"])
          ? documentSearch(root, queryTerms(trimmedQuery)) : [],
      },
      {
        source: "configuration",
        candidates: hasAnyTerm(queryTerms(trimmedQuery), ["package", "script"])
          || hasAllTerms(queryTerms(trimmedQuery), ["test", "command"])
          ? packageScriptSearch(root, queryTerms(trimmedQuery)) : [],
      },
      {
        source: "history",
        candidates: hasAnyTerm(queryTerms(trimmedQuery), ["commit", "introduced", "history", "change"])
          ? historySearch(root, queryTerms(trimmedQuery)) : [],
      },
      {
        source: "conditional",
        candidates: hasAnyTerm(queryTerms(trimmedQuery), GUARD_TRIGGER_WORDS)
          ? conditionalSearch(queryTerms(trimmedQuery), index) : [],
      },
    ], limit, index),
  };
}
