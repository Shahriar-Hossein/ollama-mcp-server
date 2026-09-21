import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { hybridRetrieve, type RetrievalMode } from "./hybrid-retrieval.js";

const [mode, repositoryRoot, query, optionalLimit, model] = process.argv.slice(2);
if ((mode !== "lexical" && mode !== "basic" && mode !== "hybrid") || !repositoryRoot || !query) {
  throw new Error("Usage: hybrid:super-explorer <lexical|basic|hybrid> <repository-root> <query> [limit] [model]");
}
const limit = optionalLimit === undefined ? 10 : Number(optionalLimit);
const features = loadFeatures();
if (mode === "hybrid" && (!features.semanticSearch || !features.gitHistory)) throw new Error("Hybrid mode is disabled; set ENABLE_SEMANTIC_SEARCH=1 and ENABLE_GIT_HISTORY=1, or use basic mode.");
process.stdout.write(`${JSON.stringify(await hybridRetrieve(resolve(repositoryRoot), query, limit, mode as RetrievalMode, model))}\n`);
