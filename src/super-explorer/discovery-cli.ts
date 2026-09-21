import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { discoverEvidence } from "./discovery.js";

if (!loadFeatures().verificationPipeline) throw new Error("Evidence discovery is disabled; set ENABLE_VERIFICATION_PIPELINE=1.");
const [repositoryRoot, question, model] = process.argv.slice(2);
if (!repositoryRoot || !question) throw new Error("Usage: discover:super-explorer <repository-root> <question> [model]");
process.stdout.write(`${JSON.stringify(await discoverEvidence(resolve(repositoryRoot), question, { model, mode: "basic" }))}\n`);
