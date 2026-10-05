import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import axios from "axios";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_LOCAL_MODEL, OLLAMA_HOST } from "../../src/ollama-client.js";
import { registerRunOllamaTask } from "../../src/tools/run-ollama-task.js";
import { registerSummarizeOutput } from "../../src/tools/summarize-output.js";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node --import tsx scripts/experimental/calibrate-h-input.ts <output-json>");
type Handler = (params: Record<string, unknown>) => Promise<any>;
function handler(register: (server: McpServer) => void): Handler {
  let invoke!: Handler;
  register({ tool: (_name: string, _description: string, _fields: unknown, callback: Handler) => { invoke = callback; } } as unknown as McpServer);
  return invoke;
}
const delegate = handler(registerRunOllamaTask);
const summarize = handler(registerSummarizeOutput);
const names = Array.from({ length: 60 }, (_, index) => `task${index}`);
const failures = ["FAIL auth.test.ts: expected 401, received 200", "FAIL queue.test.ts: expected 1 worker, received 2"];
const unicodeFailure = "ERROR: নাম খালি — café 🚧";
const cases = [
  { id: "source", invoke: delegate, params: {
    prompt: `List every exported function name as a JSON array, in source order. No explanation.\n${names.map((name) => `export function ${name}(value: number) { return value + 1; }`).join("\n")}`,
  }, verify: (text: string) => { try { return JSON.stringify(JSON.parse(text)) === JSON.stringify(names); } catch { return false; } } },
  { id: "logs", invoke: summarize, params: {
    text: [...Array.from({ length: 2200 }, (_, index) => `INFO case-${index}: passed`), ...failures].join("\n"),
    focus: "Return only the two FAIL lines verbatim.",
  }, verify: (text: string) => failures.every((line) => text.includes(line)) && !text.includes("INFO") },
  { id: "unicode", invoke: summarize, params: {
    text: `${"INFO: পরীক্ষা সফল café 🙂\n".repeat(400)}${unicodeFailure}`,
    focus: "Return only the ERROR line verbatim.",
  }, verify: (text: string) => text.trim() === unicodeFailure },
  { id: "json", invoke: delegate, params: {
    prompt: `Return a JSON array of the IDs whose status is failed, in input order. No explanation.\n${JSON.stringify(Array.from({ length: 150 }, (_, index) => ({ id: index, status: index % 50 === 0 ? "failed" : "passed", path: `src/tasks/task-${index}.ts` })))}`,
  }, verify: (text: string) => { try { return JSON.stringify(JSON.parse(text)) === "[0,50,100]"; } catch { return false; } } },
];
const originalPost = axios.post.bind(axios);
let calls: Array<Record<string, any>> = [];
axios.post = (async (...args: Parameters<typeof axios.post>) => {
  const response = await originalPost(...args);
  if (String(args[0]).endsWith("/api/generate")) {
    const { context: _context, thinking: _thinking, ...metrics } = response.data;
    calls.push({ request: args[1], metrics });
  }
  return response;
}) as typeof axios.post;
const protocol = {
  model: DEFAULT_LOCAL_MODEL,
  commit_hash: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  working_tree_diff: execFileSync("git", ["diff", "--binary"], { encoding: "utf8" }),
  input_origin: "sanitized synthetic source/log/Unicode/JSON through registered MCP handlers; no private session context",
  request_timeout_ms: 240000,
  model_settings: (await originalPost(`${OLLAMA_HOST}/api/show`, { model: DEFAULT_LOCAL_MODEL }, { timeout: 10000 })).data,
};
const results: unknown[] = [];
for (const cell of cases) {
  calls = [];
  const started = performance.now();
  process.stderr.write(`Starting ${cell.id}\n`);
  const result = await cell.invoke({ ...cell.params, model: DEFAULT_LOCAL_MODEL, timeout_ms: protocol.request_timeout_ms });
  const text = result.content[0].text;
  const budget = result._meta?.model_budget;
  const actual = calls.at(-1)?.metrics.prompt_eval_count;
  results.push({ id: cell.id, elapsed_ms: Math.round(performance.now() - started), result, calls,
    exact_contract: !result.isError && cell.verify(text),
    calibration: budget && actual ? { accounting: budget.accounting, bound: budget.input_token_bound, actual,
      predicted_prompt_tokens: budget.prompt_tokens, prediction_error: budget.prompt_tokens === undefined ? null : budget.prompt_tokens - actual,
      bound_to_actual: budget.input_token_bound / actual, actual_fits: actual <= budget.input_budget } : null,
  });
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ protocol, results, complete: results.length === cases.length }, null, 2));
  process.stderr.write(`Finished ${cell.id}\n`);
}
