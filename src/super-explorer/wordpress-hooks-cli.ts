import { resolve } from "node:path";
import { extractAdapterFacts } from "./framework-adapter.js";
import { indexRepository } from "./indexer.js";
import { wordpressWooCommerceAdapter } from "./wordpress-woocommerce-adapter.js";

const root = resolve(process.argv[2] || process.cwd());
const index = indexRepository(root);
process.stdout.write(`${JSON.stringify(extractAdapterFacts(wordpressWooCommerceAdapter, { repository_root: root, index }))}\n`);
