import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { indexRepository, type RepositoryIndex, type SymbolRecord } from "./indexer.js";
import { semanticSearch } from "./semantic-search.js";

const RRF_K = 60;

export type RetrievalMode = "lexical" | "hybrid";
export type RetrievalSource = "lexical" | "semantic" | "structural";

export interface HybridRetrievalResult {
  commit_hash: string;
  mode: RetrievalMode;
  query: string;
  results: Array<{
    score: number;
    sources: Array<{ source: RetrievalSource; rank: number }>;
    symbol: Pick<SymbolRecord, "id" | "file" | "qualified_name" | "kind" | "range">;
  }>;
}

type RankedSymbol = { symbol: SymbolRecord; score: number };

function queryTerms(query: string): string[] {
  const terms = query
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  return [...new Set(terms.filter((term) => term.length > 1))];
}

function lexicalSearch(root: string, terms: string[], index: RepositoryIndex): RankedSymbol[] {
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
    return score ? [{ symbol, score }] : [];
  }).sort((left, right) => right.score - left.score || compareSymbols(left.symbol, right.symbol));
}

/** Maps query-matching graph records back to declarations without claiming that an unresolved edge is exact. */
function structuralSearch(terms: string[], index: RepositoryIndex): RankedSymbol[] {
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
  return [...scores.values()].sort((left, right) => right.score - left.score || compareSymbols(left.symbol, right.symbol));
}

function compareSymbols(left: SymbolRecord, right: SymbolRecord): number {
  return left.file.localeCompare(right.file) || left.range.start.byte - right.range.start.byte || left.id.localeCompare(right.id);
}

function mergeRankings(rankings: Array<{ source: RetrievalSource; candidates: RankedSymbol[] }>, limit: number) {
  const merged = new Map<string, { symbol: SymbolRecord; score: number; sources: Array<{ source: RetrievalSource; rank: number }> }>();
  for (const { source, candidates } of rankings) {
    for (const [offset, candidate] of candidates.entries()) {
      const rank = offset + 1;
      const prior = merged.get(candidate.symbol.id) ?? { symbol: candidate.symbol, score: 0, sources: [] };
      prior.score += 1 / (RRF_K + rank);
      prior.sources.push({ source, rank });
      merged.set(candidate.symbol.id, prior);
    }
  }
  return [...merged.values()]
    .sort((left, right) => right.score - left.score || compareSymbols(left.symbol, right.symbol))
    .slice(0, limit)
    .map(({ symbol, score, sources }) => ({
      score,
      sources: sources.sort((left, right) => left.source.localeCompare(right.source)),
      symbol: { id: symbol.id, file: symbol.file, qualified_name: symbol.qualified_name, kind: symbol.kind, range: symbol.range },
    }));
}

/** Retrieves source symbols using lexical, semantic, and source-derived graph rankings fused with RRF. */
export async function hybridRetrieve(repositoryRoot: string, query: string, limit = 10, mode: RetrievalMode = "hybrid", model?: string): Promise<HybridRetrievalResult> {
  const root = resolve(repositoryRoot);
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Retrieval query must not be empty.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Retrieval result limit must be an integer from 1 through 100.");
  const index = indexRepository(root);
  const lexical = lexicalSearch(root, queryTerms(trimmedQuery), index);
  if (mode === "lexical") return { commit_hash: index.commit_hash, mode, query: trimmedQuery, results: mergeRankings([{ source: "lexical", candidates: lexical }], limit) };

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
        return symbol ? [{ symbol, score: result.score }] : [];
      }) },
      { source: "structural", candidates: structuralSearch(queryTerms(trimmedQuery), index) },
    ], limit),
  };
}
