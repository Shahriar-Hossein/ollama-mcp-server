import { resolve } from "node:path";
import { readSymbol } from "./read-symbol.js";

const [repositoryRoot, symbolId] = process.argv.slice(2);
if (!repositoryRoot || !symbolId) {
  throw new Error("Usage: read-symbol:super-explorer <repository-root> <symbol-id>");
}

process.stdout.write(`${JSON.stringify(readSymbol(resolve(repositoryRoot), symbolId))}\n`);
