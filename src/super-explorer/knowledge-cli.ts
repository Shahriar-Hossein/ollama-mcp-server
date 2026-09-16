import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { refreshKnowledgeFreshness, saveKnowledgeUpdates, type KnowledgeUpdate } from "./knowledge-store.js";

const [repositoryRoot, updatesFile] = process.argv.slice(2);
if (repositoryRoot === "refresh" && updatesFile && process.argv.length === 4) {
  process.stdout.write(`${JSON.stringify(refreshKnowledgeFreshness(resolve(updatesFile)))}\n`);
  process.exit(0);
}
if (!repositoryRoot || !updatesFile) throw new Error("Usage: knowledge:super-explorer <repository-root> <updates-json-file> | refresh <repository-root>");
const updates = JSON.parse(readFileSync(resolve(updatesFile), "utf8")) as KnowledgeUpdate[];
if (!Array.isArray(updates)) throw new Error("Knowledge updates JSON must be an array.");
process.stdout.write(`${JSON.stringify(saveKnowledgeUpdates(resolve(repositoryRoot), updates))}\n`);
