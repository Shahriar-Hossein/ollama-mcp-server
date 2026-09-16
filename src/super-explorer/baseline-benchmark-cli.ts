import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const FIXTURE_COMMIT = "f1a75a19d1708e36f60bba0de76714acc2343492";
const benchmarkIds = ["SE-01", "SE-02", "SE-03", "SE-04", "SE-05", "SE-06", "SE-07", "SE-08", "SE-09", "SE-10", "SE-11", "SE-12"] as const;
const scoreSchema = z.object({
  benchmark_id: z.enum(benchmarkIds),
  fixture_commit: z.string().length(40),
  gold_file_recall: z.number().min(0).max(1),
  gold_symbol_recall: z.number().min(0).max(1),
  required_relationship_recall: z.number().min(0).max(1),
  unsupported_claims: z.number().int().nonnegative(),
  tool_calls: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  latency_ms: z.number().nonnegative(),
});
const inputSchema = z.object({
  run_name: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  runs: z.array(scoreSchema).length(benchmarkIds.length),
});

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const [repositoryRoot, scoresFile] = process.argv.slice(2);
if (!repositoryRoot || !scoresFile) throw new Error("Usage: benchmark:super-explorer <repository-root> <scored-runs-json-file>");
const root = resolve(repositoryRoot);
const input = inputSchema.parse(JSON.parse(readFileSync(resolve(scoresFile), "utf8")));
if (new Set(input.runs.map((run) => run.benchmark_id)).size !== benchmarkIds.length) throw new Error("Each benchmark ID must appear exactly once.");
if (input.runs.some((run) => run.fixture_commit !== FIXTURE_COMMIT)) throw new Error(`Scores must use fixture commit ${FIXTURE_COMMIT}.`);

const output = {
  fixture_commit: FIXTURE_COMMIT,
  measured_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  run_name: input.run_name,
  model: input.model,
  aggregate: {
    answer_accuracy: input.runs.filter((run) => run.required_relationship_recall === 1 && run.unsupported_claims === 0).length / input.runs.length,
    gold_file_recall: input.runs.reduce((sum, run) => sum + run.gold_file_recall, 0) / input.runs.length,
    gold_symbol_recall: input.runs.reduce((sum, run) => sum + run.gold_symbol_recall, 0) / input.runs.length,
    required_relationship_recall: input.runs.reduce((sum, run) => sum + run.required_relationship_recall, 0) / input.runs.length,
    unsupported_answer_rate: input.runs.filter((run) => run.unsupported_claims > 0).length / input.runs.length,
    total_unsupported_claims: input.runs.reduce((sum, run) => sum + run.unsupported_claims, 0),
    median_tool_calls: median(input.runs.map((run) => run.tool_calls)),
    median_input_tokens: median(input.runs.map((run) => run.input_tokens)),
    median_output_tokens: median(input.runs.map((run) => run.output_tokens)),
    median_latency_ms: median(input.runs.map((run) => run.latency_ms)),
  },
  runs: input.runs,
};
const directory = resolve(root, "benchmark-data", `super-explorer-baseline-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(directory, { recursive: true });
const artifact = resolve(directory, `${input.run_name.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.json`);
writeFileSync(artifact, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ artifact, aggregate: output.aggregate })}\n`);
