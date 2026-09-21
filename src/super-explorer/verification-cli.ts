import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { verifyClaims, type VerificationInputClaim } from "./verification.js";

if (!loadFeatures().verificationPipeline) throw new Error("Claim verification is disabled; set ENABLE_VERIFICATION_PIPELINE=1.");
const [repositoryRoot, claimsFile, model] = process.argv.slice(2);
if (!repositoryRoot || !claimsFile) throw new Error("Usage: verify:super-explorer <repository-root> <claims-json-file> [model]");
const claims = JSON.parse(readFileSync(resolve(claimsFile), "utf8")) as VerificationInputClaim[];
process.stdout.write(`${JSON.stringify(await verifyClaims(resolve(repositoryRoot), claims, model))}\n`);
