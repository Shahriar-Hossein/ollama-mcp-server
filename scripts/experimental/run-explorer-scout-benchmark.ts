import { runLocalExplorerTask } from "../../src/experimental/tools/local-explorer-task.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const protocol = {
  cwd: process.cwd(),
  model: process.argv[3] || "qwen3.5:4b",
  max_tool_calls: 50,
  max_files_read: 6,
  max_output_chars: 8_000,
  num_ctx: 32_768,
  num_predict: 8_192,
  request_timeout_ms: 180_000,
  think: true,
};

const prompts = [
  "Explain how local_explorer_task discovers repository facts: tools, tool-loop, budgets, and confidence rule.",
  "Explain how explore_repository / Super Explorer discovers and validates facts: stages, navigation versus reasoning, and verification rule.",
];

const results = [];
for (const task of prompts) {
  const started_at = new Date().toISOString();
  process.stderr.write(`Starting prompt ${results.length + 1}/${prompts.length} at ${started_at}\n`);
  const heartbeat = setInterval(() => {
    process.stderr.write(`Prompt ${results.length + 1}/${prompts.length} still running at ${new Date().toISOString()}\n`);
  }, 15_000);
  const result = await runLocalExplorerTask({ ...protocol, task });
  clearInterval(heartbeat);
  process.stderr.write(`Finished prompt ${results.length + 1}/${prompts.length} at ${new Date().toISOString()}\n`);
  results.push({ task, started_at, result });
}

const output = `${JSON.stringify({ protocol, results }, null, 2)}\n`;
const outputPath = process.argv[2];
if (outputPath) writeFileSync(resolve(outputPath), output);
process.stdout.write(output);
