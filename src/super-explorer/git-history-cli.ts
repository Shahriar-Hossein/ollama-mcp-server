import {
  gitBlameSymbol,
  gitFindFileIntroduction,
  gitFindRecentFileChanges,
  gitFindRecentSymbolChanges,
  gitFindSymbolIntroduction,
} from "./git-history.js";

const [operation, repositoryRoot, target, limitArgument] = process.argv.slice(2);
if (!operation || !repositoryRoot || !target) {
  throw new Error("Usage: git-history:super-explorer <file-introduction|symbol-introduction|file-recent-changes|symbol-recent-changes|blame-symbol> <repository-root> <file-or-symbol-id> [limit]");
}

const limit = limitArgument === undefined ? undefined : Number(limitArgument);
const operations = {
  "file-introduction": () => gitFindFileIntroduction(repositoryRoot, target),
  "symbol-introduction": () => gitFindSymbolIntroduction(repositoryRoot, target),
  "file-recent-changes": () => gitFindRecentFileChanges(repositoryRoot, target, limit),
  "symbol-recent-changes": () => gitFindRecentSymbolChanges(repositoryRoot, target, limit),
  "blame-symbol": () => gitBlameSymbol(repositoryRoot, target),
} as const;
const run = operations[operation as keyof typeof operations];
if (!run) throw new Error(`Unknown git-history operation: ${operation}`);
if (operation === "blame-symbol" && limitArgument !== undefined) throw new Error("blame-symbol does not accept a limit.");

process.stdout.write(`${JSON.stringify(run())}\n`);
