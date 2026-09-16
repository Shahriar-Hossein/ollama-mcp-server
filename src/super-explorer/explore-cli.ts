import { resolve } from "node:path";
import { exploreRepository } from "./explore.js";

const [repositoryRoot, question, model] = process.argv.slice(2);
if (!repositoryRoot || !question) throw new Error("Usage: explore:super-explorer <repository-root> <question> [model]");
process.stdout.write(`${JSON.stringify(await exploreRepository({ repository_root: resolve(repositoryRoot), question, model }))}\n`);
