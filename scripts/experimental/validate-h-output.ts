import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  checkGenerationInputBudget,
  DEFAULT_LOCAL_MODEL,
  generateResult,
  resolveModelBudget,
  showModel,
} from "../../src/ollama-client.js";

const [requestPath, outputPath] = process.argv.slice(2);
if (!requestPath || !outputPath)
  throw new Error(
    "Usage: tsx scripts/experimental/validate-h-output.ts <saved-request.json> <output.json>",
  );
const request = JSON.parse(readFileSync(requestPath, "utf8"));
const expected = JSON.parse(request.prompt.slice(request.prompt.indexOf("\n") + 1));
const budget = await resolveModelBudget(DEFAULT_LOCAL_MODEL, { num_predict: 16000 });
const input = await checkGenerationInputBudget(budget, request);
const protocol = {
  model: DEFAULT_LOCAL_MODEL,
  model_settings: await showModel(DEFAULT_LOCAL_MODEL),
  commit_hash: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  working_tree_diff: execFileSync("git", ["diff", "--binary"], { encoding: "utf8" }),
  request_path: requestPath,
  request,
  timeout_ms: 600000,
  budget: input,
  comparison:
    "same historical inventory, current 50K/16000; no controlled cache/latency comparison",
};
writeFileSync(outputPath, JSON.stringify({ protocol, complete: false }, null, 2));
if (!input.fits) throw new Error(`input_overflow: ${JSON.stringify(input)}`);
const started = performance.now();
const result = await generateResult(
  DEFAULT_LOCAL_MODEL,
  request.prompt,
  request.system,
  request.format,
  false,
  { num_ctx: budget.num_ctx, num_predict: budget.num_predict },
  protocol.timeout_ms,
);
let fidelity: unknown;
try {
  const records = JSON.parse(result.text).records;
  const matches = (record: Record<string, unknown>, actual: Record<string, unknown> | undefined) =>
    actual !== undefined &&
    Object.keys(actual).length === Object.keys(record).length &&
    Object.entries(record).every(([key, value]) => actual[key] === value);
  fidelity = {
    valid_json: true,
    record_count: records.length,
    all_ids_in_order:
      JSON.stringify(records.map((record: any) => record.id)) ===
      JSON.stringify(expected.map((record: any) => record.id)),
    all_locations_match:
      records.length === expected.length &&
      records.every(
        (record: any, i: number) =>
          record.file === expected[i].file && record.line === expected[i].line,
      ),
    exact_records: expected.filter((record: any, i: number) => matches(record, records[i])).length,
    differences: expected.flatMap((record: any, i: number) =>
      matches(record, records[i]) ? [] : [{ id: record.id, expected: record, actual: records[i] }],
    ),
  };
} catch {
  fidelity = { valid_json: false, exact_records: null };
}
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      protocol,
      complete: true,
      elapsed_ms: Math.round(performance.now() - started),
      result,
      fidelity,
    },
    null,
    2,
  ),
);
process.stderr.write(`Long-output complete: ${JSON.stringify(fidelity).slice(0, 400)}\n`);
