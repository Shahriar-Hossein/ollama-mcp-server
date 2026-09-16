import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { synthesizeFromVerification, type SynthesisInput } from "./synthesis.js";

const [repositoryRoot, inputFile] = process.argv.slice(2);
if (!repositoryRoot || !inputFile) throw new Error("Usage: synthesize:super-explorer <repository-root> <verified-claims-json-file>");
const input = JSON.parse(readFileSync(resolve(inputFile), "utf8")) as SynthesisInput;
process.stdout.write(`${JSON.stringify(synthesizeFromVerification(resolve(repositoryRoot), input))}\n`);
