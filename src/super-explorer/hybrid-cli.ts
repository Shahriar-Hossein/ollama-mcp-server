import { resolve } from "node:path";
import { hybridRetrieve, type RetrievalMode } from "./hybrid-retrieval.js";

const [mode, repositoryRoot, query, optionalLimit, model] = process.argv.slice(2);
if ((mode !== "lexical" && mode !== "hybrid") || !repositoryRoot || !query) {
  throw new Error("Usage: hybrid:super-explorer <lexical|hybrid> <repository-root> <query> [limit] [model]");
}
const limit = optionalLimit === undefined ? 10 : Number(optionalLimit);
process.stdout.write(`${JSON.stringify(await hybridRetrieve(resolve(repositoryRoot), query, limit, mode as RetrievalMode, model))}\n`);
