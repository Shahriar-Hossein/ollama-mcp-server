import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { indexRepository, type RepositoryIndex, type SymbolRecord } from "./indexer.js";

export interface HistoryCommit {
  hash: string;
  subject: string;
  authored_at: string;
  files: Array<{ status: string; path: string; previous_path?: string }>;
}

export interface GitIntroductionResult {
  commit_hash: string;
  target: { kind: "file"; file: string } | { kind: "symbol"; symbol: SymbolRecord };
  introduction: HistoryCommit | null;
}

export interface GitRecentChangesResult {
  commit_hash: string;
  target: { kind: "file"; file: string } | { kind: "symbol"; symbol: SymbolRecord };
  commits: HistoryCommit[];
}

export interface GitBlameLine {
  line: number;
  commit_hash: string;
  original_line: number;
  author: string;
  authored_at: string;
  summary: string;
}

export interface GitBlameSymbolResult {
  commit_hash: string;
  symbol: SymbolRecord;
  lines: GitBlameLine[];
}

type HistoryTarget = GitIntroductionResult["target"];

function git(root: string, args: string[]): Buffer {
  return execFileSync("git", args, { cwd: root, encoding: "buffer" });
}

function requiredRepositoryRoot(repositoryRoot: string): string {
  const root = resolve(repositoryRoot);
  const gitRoot = git(root, ["rev-parse", "--show-toplevel"]).toString("utf8").trim();
  if (resolve(gitRoot) !== root) throw new Error(`Repository root must be the Git root: ${gitRoot}`);
  return root;
}

function requiredTrackedFile(root: string, file: string): string {
  if (!file || isAbsolute(file) || file.includes("\0")) throw new Error("File must be a non-empty repository-relative path.");
  const candidate = resolve(root, file);
  const normalized = relative(root, candidate).split(sep).join("/");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("File must remain within the repository root.");
  }
  try {
    git(root, ["ls-files", "--error-unmatch", "--", normalized]);
  } catch {
    throw new Error(`File is not tracked at HEAD: ${normalized}`);
  }
  return normalized;
}

function requiredSymbol(symbolId: string, index: RepositoryIndex): SymbolRecord {
  const symbol = index.symbols.find((candidate) => candidate.id === symbolId);
  if (!symbol) throw new Error(`No indexed symbol found with ID: ${symbolId}`);
  return symbol;
}

function targetForFile(root: string, file: string): HistoryTarget {
  return { kind: "file", file: requiredTrackedFile(root, file) };
}

function targetForSymbol(symbolId: string, index: RepositoryIndex): HistoryTarget {
  return { kind: "symbol", symbol: requiredSymbol(symbolId, index) };
}

function parseCommit(root: string, hash: string): HistoryCommit {
  const fields = git(root, ["show", "--no-ext-diff", "--format=%H%x00%s%x00%aI", "--name-status", "-z", "--find-renames", hash])
    .toString("utf8")
    .split("\0");
  const [commitHash, subject, authoredAt, ...entries] = fields;
  const files: HistoryCommit["files"] = [];
  for (let index = 0; index < entries.length;) {
    const status = entries[index++].replace(/^\n/, "");
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const previous_path = entries[index++];
      const path = entries[index++];
      if (previous_path && path) files.push({ status, path, previous_path });
    } else {
      const path = entries[index++];
      if (path) files.push({ status, path });
    }
  }
  return { hash: commitHash, subject, authored_at: authoredAt, files };
}

function historyHashesForFile(root: string, file: string): string[] {
  return git(root, ["log", "--follow", "--format=%H", "--", file])
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
}

function historyHashesForSymbol(root: string, symbol: SymbolRecord): string[] {
  const start = symbol.range.start.line;
  const end = Math.max(start, symbol.range.end.line - 1);
  const output = git(root, ["log", `-L${start},${end}:${symbol.file}`, "--format=%H"])
    .toString("utf8");
  return [...new Set(output.split("\n").filter((line) => /^[0-9a-f]{40,64}$/.test(line)))];
}

function historyHashes(root: string, target: HistoryTarget): string[] {
  return target.kind === "file"
    ? historyHashesForFile(root, target.file)
    : historyHashesForSymbol(root, target.symbol);
}

function indexedRoot(repositoryRoot: string): { root: string; index: RepositoryIndex } {
  const root = requiredRepositoryRoot(repositoryRoot);
  return { root, index: indexRepository(root) };
}

/** Finds the oldest commit that introduced a tracked file, following renames. */
export function gitFindFileIntroduction(repositoryRoot: string, file: string): GitIntroductionResult {
  const root = requiredRepositoryRoot(repositoryRoot);
  const target = targetForFile(root, file);
  const hashes = historyHashes(root, target);
  return { commit_hash: git(root, ["rev-parse", "HEAD"]).toString("utf8").trim(), target, introduction: hashes.at(-1) ? parseCommit(root, hashes.at(-1)!) : null };
}

/** Finds the oldest line-history commit for the indexed range of one symbol. */
export function gitFindSymbolIntroduction(repositoryRoot: string, symbolId: string): GitIntroductionResult {
  const { root, index } = indexedRoot(repositoryRoot);
  const target = targetForSymbol(symbolId, index);
  const hashes = historyHashes(root, target);
  return { commit_hash: index.commit_hash, target, introduction: hashes.at(-1) ? parseCommit(root, hashes.at(-1)!) : null };
}

/** Returns newest-first commits affecting a tracked file, following renames. */
export function gitFindRecentFileChanges(repositoryRoot: string, file: string, limit = 10): GitRecentChangesResult {
  const root = requiredRepositoryRoot(repositoryRoot);
  const target = targetForFile(root, file);
  const hashes = historyHashes(root, target).slice(0, requiredLimit(limit));
  return { commit_hash: git(root, ["rev-parse", "HEAD"]).toString("utf8").trim(), target, commits: hashes.map((hash) => parseCommit(root, hash)) };
}

/** Returns newest-first commits that Git's line history attributes to an indexed symbol range. */
export function gitFindRecentSymbolChanges(repositoryRoot: string, symbolId: string, limit = 10): GitRecentChangesResult {
  const { root, index } = indexedRoot(repositoryRoot);
  const target = targetForSymbol(symbolId, index);
  const hashes = historyHashes(root, target).slice(0, requiredLimit(limit));
  return { commit_hash: index.commit_hash, target, commits: hashes.map((hash) => parseCommit(root, hash)) };
}

function requiredLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be an integer from 1 through 100.");
  return limit;
}

/** Attributes every current source line in an indexed symbol range to Git blame evidence. */
export function gitBlameSymbol(repositoryRoot: string, symbolId: string): GitBlameSymbolResult {
  const { root, index } = indexedRoot(repositoryRoot);
  const symbol = requiredSymbol(symbolId, index);
  const start = symbol.range.start.line;
  const end = Math.max(start, symbol.range.end.line - 1);
  const rows = git(root, ["blame", "--line-porcelain", `-L${start},${end}`, "--", symbol.file]).toString("utf8").split("\n");
  const lines: GitBlameLine[] = [];
  let commit_hash = "";
  let original_line = 0;
  let line = 0;
  let author = "";
  let authored_at = "";
  let summary = "";
  for (const row of rows) {
    const header = /^([0-9a-f]{40,64}) (\d+) (\d+)(?: \d+)?$/.exec(row);
    if (header) {
      commit_hash = header[1];
      original_line = Number(header[2]);
      line = Number(header[3]);
      author = "";
      authored_at = "";
      summary = "";
    } else if (row.startsWith("author ")) {
      author = row.slice("author ".length);
    } else if (row.startsWith("author-time ")) {
      authored_at = new Date(Number(row.slice("author-time ".length)) * 1000).toISOString();
    } else if (row.startsWith("summary ")) {
      summary = row.slice("summary ".length);
    } else if (row.startsWith("\t") && commit_hash) {
      lines.push({ line, commit_hash, original_line, author, authored_at, summary });
    }
  }
  return { commit_hash: index.commit_hash, symbol, lines };
}
