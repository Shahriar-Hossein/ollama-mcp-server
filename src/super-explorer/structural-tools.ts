import {
  indexRepository,
  type CallEdge,
  type ReferenceRecord,
  type RepositoryIndex,
  type SymbolRecord,
  type TestRecord,
  type TestSymbolEdge,
} from "./indexer.js";

export type SymbolMatchKind = "id" | "exact" | "partial";

export interface SymbolMatch {
  symbol: SymbolRecord;
  match: SymbolMatchKind;
}

export interface SymbolSearchResult {
  commit_hash: string;
  query: string;
  symbols: SymbolMatch[];
}

export interface ReferenceSearchResult {
  commit_hash: string;
  symbol: SymbolRecord;
  references: ReferenceRecord[];
}

export interface CallSearchResult {
  commit_hash: string;
  symbol: SymbolRecord;
  calls: CallEdge[];
}

export interface TestSearchResult {
  commit_hash: string;
  symbol: SymbolRecord;
  tests: Array<TestRecord & { symbols: TestSymbolEdge[] }>;
}

function requiredSymbol(symbolId: string, index: RepositoryIndex): SymbolRecord {
  if (!symbolId.trim()) throw new Error("Symbol ID must not be empty.");
  const symbol = index.symbols.find((candidate) => candidate.id === symbolId);
  if (!symbol) throw new Error(`No indexed symbol found with ID: ${symbolId}`);
  return symbol;
}

/** Finds declarations by stable ID, exact name/path, or a case-insensitive partial name/path. */
export function findSymbol(repositoryRoot: string, query: string, index: RepositoryIndex = indexRepository(repositoryRoot)): SymbolSearchResult {
  const needle = query.trim();
  if (!needle) throw new Error("Symbol query must not be empty.");
  const foldedNeedle = needle.toLocaleLowerCase();
  const symbols: SymbolMatch[] = [];

  for (const symbol of index.symbols) {
    if (symbol.id === needle) {
      symbols.push({ symbol, match: "id" });
    } else if (symbol.name === needle || symbol.qualified_name === needle) {
      symbols.push({ symbol, match: "exact" });
    } else if (
      symbol.name.toLocaleLowerCase().includes(foldedNeedle) ||
      symbol.qualified_name.toLocaleLowerCase().includes(foldedNeedle)
    ) {
      symbols.push({ symbol, match: "partial" });
    }
  }

  const order: Record<SymbolMatchKind, number> = { id: 0, exact: 1, partial: 2 };
  symbols.sort((left, right) => order[left.match] - order[right.match]
    || left.symbol.file.localeCompare(right.symbol.file)
    || left.symbol.range.start.byte - right.symbol.range.start.byte);
  return { commit_hash: index.commit_hash, query: needle, symbols };
}

/** Finds indexed identifier/type-name occurrences that resolved to one declaration. */
export function findReferences(repositoryRoot: string, symbolId: string, index: RepositoryIndex = indexRepository(repositoryRoot)): ReferenceSearchResult {
  const symbol = requiredSymbol(symbolId, index);
  return {
    commit_hash: index.commit_hash,
    symbol,
    references: index.references.filter((reference) => reference.target_symbol_id === symbol.id),
  };
}

/** Finds call sites whose callee resolved to one declaration. */
export function findCallers(repositoryRoot: string, symbolId: string, index: RepositoryIndex = indexRepository(repositoryRoot)): CallSearchResult {
  const symbol = requiredSymbol(symbolId, index);
  return {
    commit_hash: index.commit_hash,
    symbol,
    calls: index.calls.filter((call) => call.callee_symbol_id === symbol.id),
  };
}

/** Finds call sites made from within one declaration. */
export function findCallees(repositoryRoot: string, symbolId: string, index: RepositoryIndex = indexRepository(repositoryRoot)): CallSearchResult {
  const symbol = requiredSymbol(symbolId, index);
  return {
    commit_hash: index.commit_hash,
    symbol,
    calls: index.calls.filter((call) => call.caller_symbol_id === symbol.id),
  };
}

/** Finds conventional JS/TS test cases that source-backed references resolve to this symbol. */
export function findTestsForSymbol(repositoryRoot: string, symbolId: string, index: RepositoryIndex = indexRepository(repositoryRoot)): TestSearchResult {
  const symbol = requiredSymbol(symbolId, index);
  const edges = index.test_symbols.filter((edge) => edge.target_symbol_id === symbol.id);
  const tests = index.tests
    .filter((test) => test.kind === "test")
    .flatMap((test) => {
      const symbols = edges.filter((edge) => edge.test_file === test.file && edge.test_range.start.byte === test.range.start.byte);
      return symbols.length ? [{ ...test, symbols }] : [];
    });
  return { commit_hash: index.commit_hash, symbol, tests };
}
