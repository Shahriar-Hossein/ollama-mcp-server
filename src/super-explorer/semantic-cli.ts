import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { buildSemanticIndex, semanticSearch } from "./semantic-search.js";

if (!loadFeatures().semanticSearch) throw new Error("Semantic search is disabled; set ENABLE_SEMANTIC_SEARCH=1.");
const [operation, repositoryRoot, queryOrModel, optionalLimit, optionalModel] = process.argv.slice(2);
if (!operation || !repositoryRoot) {
  throw new Error("Usage: semantic:super-explorer <index|search> <repository-root> [query] [limit] [model]");
}

const root = resolve(repositoryRoot);
if (operation === "index") {
  process.stdout.write(`${JSON.stringify(await buildSemanticIndex(root, queryOrModel))}\n`);
} else if (operation === "search") {
  if (!queryOrModel) throw new Error("Usage: semantic:super-explorer search <repository-root> <query> [limit] [model]");
  const limit = optionalLimit === undefined ? 10 : Number(optionalLimit);
  process.stdout.write(`${JSON.stringify(await semanticSearch(root, queryOrModel, limit, optionalModel))}\n`);
} else {
  throw new Error(`Unknown semantic operation: ${operation}`);
}
