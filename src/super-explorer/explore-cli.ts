import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { exploreRepository } from "./explore.js";

if (!loadFeatures().fullExplorer) throw new Error("Full Explorer is disabled; set ENABLE_FULL_EXPLORER=1 and ENABLE_VERIFICATION_PIPELINE=1.");
const [repositoryRoot, question, model, limitArg, thinkArg] = process.argv.slice(2);
if (!repositoryRoot || !question) throw new Error("Usage: explore:super-explorer <repository-root> <question> [model] [limit] [think]");
process.stdout.write(`${JSON.stringify(await exploreRepository({
  repository_root: resolve(repositoryRoot),
  question,
  model,
  mode: "basic",
  limit: limitArg ? Number(limitArg) : undefined,
  think: thinkArg ? thinkArg === "true" : undefined,
}))}\n`);
