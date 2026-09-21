import { resolve } from "node:path";
import { indexRepository } from "./indexer.js";

const root = resolve(process.argv[2] || process.cwd());
process.stdout.write(`${JSON.stringify(indexRepository(root))}\n`);
