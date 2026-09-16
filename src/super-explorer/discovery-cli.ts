import { resolve } from "node:path";
import { discoverEvidence } from "./discovery.js";

const [repositoryRoot, question, model] = process.argv.slice(2);
if (!repositoryRoot || !question) throw new Error("Usage: discover:super-explorer <repository-root> <question> [model]");
process.stdout.write(`${JSON.stringify(await discoverEvidence(resolve(repositoryRoot), question, { model }))}\n`);
