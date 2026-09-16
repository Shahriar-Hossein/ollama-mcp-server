import { resolve } from "node:path";
import { outlineFile } from "./outline-file.js";

const [repositoryRoot, path] = process.argv.slice(2);
if (!repositoryRoot || !path) {
  throw new Error("Usage: outline:super-explorer <repository-root> <path>");
}

process.stdout.write(`${JSON.stringify(outlineFile(resolve(repositoryRoot), path))}\n`);
