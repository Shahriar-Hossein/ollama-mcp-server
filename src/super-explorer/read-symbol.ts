import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { indexRepository, type RepositoryIndex, type SourceRange, type SymbolRecord } from "./indexer.js";

export interface SourceSnippet {
  range: SourceRange;
  text: string;
}

export interface SymbolRead {
  commit_hash: string;
  symbol: SymbolRecord;
  source: SourceSnippet;
  context_before: SourceSnippet | null;
  context_after: SourceSnippet | null;
}

function lineStarts(source: Buffer): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === 10) starts.push(index + 1);
  }
  return starts;
}

function lineRange(source: Buffer, starts: number[], line: number): SourceRange | null {
  const start = starts[line - 1];
  if (start === undefined) return null;
  const nextStart = starts[line];
  const end = nextStart === undefined ? source.length : nextStart - 1;
  return {
    start: { line, column: 1, byte: start },
    end: { line, column: end - start + 1, byte: end },
  };
}

function snippet(source: Buffer, range: SourceRange): SourceSnippet {
  return { range, text: source.subarray(range.start.byte, range.end.byte).toString("utf8") };
}

function indexedFilePath(repositoryRoot: string, file: string): string {
  const root = resolve(repositoryRoot);
  const path = resolve(root, file);
  const relativePath = relative(root, path);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Indexed symbol has a path outside the repository: ${file}`);
  }
  return path;
}

export function readSymbol(repositoryRoot: string, symbolId: string, index: RepositoryIndex = indexRepository(repositoryRoot)): SymbolRead {
  if (!symbolId.trim()) throw new Error("Symbol ID must not be empty.");

  const symbol = index.symbols.find((candidate) => candidate.id === symbolId);
  if (!symbol) throw new Error(`No indexed symbol found with ID: ${symbolId}`);

  const source = readFileSync(indexedFilePath(repositoryRoot, symbol.file));
  const starts = lineStarts(source);
  const beforeRange = lineRange(source, starts, symbol.range.start.line - 1);
  const afterRange = lineRange(source, starts, symbol.range.end.line + 1);

  return {
    commit_hash: index.commit_hash,
    symbol,
    source: snippet(source, symbol.range),
    context_before: beforeRange ? snippet(source, beforeRange) : null,
    context_after: afterRange ? snippet(source, afterRange) : null,
  };
}
