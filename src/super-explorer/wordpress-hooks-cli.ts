import { resolve } from "node:path";
import { loadFeatures } from "../config/features.js";
import { extractAdapterFacts } from "./framework-adapter.js";
import { indexRepository } from "./indexer.js";
import { wordpressWooCommerceAdapter } from "./wordpress-woocommerce-adapter.js";

if (!loadFeatures().frameworkAdapters) throw new Error("Framework adapters are disabled; set ENABLE_FRAMEWORK_ADAPTERS=1.");
const root = resolve(process.argv[2] || process.cwd());
const index = indexRepository(root);
process.stdout.write(`${JSON.stringify(extractAdapterFacts(wordpressWooCommerceAdapter, { repository_root: root, index }))}\n`);
