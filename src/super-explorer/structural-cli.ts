import { resolve } from "node:path";
import { findCallees, findCallers, findReferences, findSymbol } from "./structural-tools.js";

const [operation, repositoryRoot, query] = process.argv.slice(2);
if (!operation || !repositoryRoot || !query) {
  throw new Error("Usage: structural:super-explorer <find-symbol|find-references|find-callers|find-callees> <repository-root> <query-or-symbol-id>");
}

const root = resolve(repositoryRoot);
const operations = {
  "find-symbol": findSymbol,
  "find-references": findReferences,
  "find-callers": findCallers,
  "find-callees": findCallees,
} as const;
const run = operations[operation as keyof typeof operations];
if (!run) throw new Error(`Unknown structural operation: ${operation}`);

process.stdout.write(`${JSON.stringify(run(root, query))}\n`);
