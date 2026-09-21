import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFeatures } from "../../config/features.js";
import { synthesizeFromVerification, type SynthesisInput } from "./synthesis.js";

if (!loadFeatures().verificationPipeline) throw new Error("Verified synthesis is disabled; set ENABLE_VERIFICATION_PIPELINE=1.");
const [repositoryRoot, inputFile] = process.argv.slice(2);
if (!repositoryRoot || !inputFile) throw new Error("Usage: synthesize:super-explorer <repository-root> <verified-claims-json-file>");
const input = JSON.parse(readFileSync(resolve(inputFile), "utf8")) as SynthesisInput;
process.stdout.write(`${JSON.stringify(synthesizeFromVerification(resolve(repositoryRoot), input))}\n`);
