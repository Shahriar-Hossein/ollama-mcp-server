import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import axios from "axios";
import { OLLAMA_HOST, REQUEST_TIMEOUT_MS } from "../../src/ollama-client.js";
import { runLocalExploreRepo } from "../../src/experimental/tools/local-explore-repo.js";

type Fixture = { version: number; questions: Array<{ id: string; query: string }> };

const arguments_ = process.argv.slice(2);
function integerOption(name: string, fallback: number) {
  const index = arguments_.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(arguments_[index + 1]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} requires a positive integer`);
  arguments_.splice(index, 2);
  return value;
}
const num_ctx = integerOption("--num-ctx", 16384);
const num_predict = integerOption("--num-predict", 8192);
if (num_predict + 1024 >= num_ctx) throw new Error("Output ceiling leaves no useful input budget");
const think = arguments_.includes("--think");
const [outputPath, ...models] = arguments_.filter((argument) => argument !== "--think");
if (!outputPath || !models.length) {
  throw new Error("Usage: tsx scripts/experimental/run-local-explore-repo-smoke.ts [--think] [--num-ctx N] [--num-predict N] <output-json> <model> [model...]");
}

const root = process.cwd();
const fixturePath = resolve(root, "docs/experimental/benchmarks/runs/2026-09-24-local-explore-repo-queries.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
const runCommand = (command: string, args: string[]) => {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
};
const modelDigests = new Map(
  runCommand("ollama", ["list"]).split("\n").slice(1).flatMap((line) => {
    const [name, digest] = line.trim().split(/\s{2,}/);
    return name && digest ? [[name, digest] as const] : [];
  })
);
const protocol = {
  fixture_path: "docs/experimental/benchmarks/runs/2026-09-24-local-explore-repo-queries.json",
  fixture_version: fixture.version,
  repository_root: root,
  commit_hash: runCommand("git", ["rev-parse", "HEAD"]),
  limit: 10,
  route_controls: { retrieval_mode: "basic", max_files_per_part: 6, max_bundles: 6, max_context_chars: 24_000, question_parts: true, bundled_context_dedup: true, evidence_line_refs: true, bounded_expansion_rounds: 1, structured_output: true, num_ctx, num_predict, think, invalid_evidence_retries: 1 },
  ollama_version: runCommand("ollama", ["--version"]),
};
const results: unknown[] = [];

for (const model of models) {
  const modelStartedAt = new Date().toISOString();
  const modelStarted = performance.now();
  process.stderr.write(`Starting ${model} at ${modelStartedAt}\n`);
  const questions: unknown[] = [];
  for (const question of fixture.questions) {
    const started_at = new Date().toISOString();
    const started = performance.now();
    process.stderr.write(`  ${model} ${question.id} at ${started_at}\n`);
    const calls: unknown[] = [];
    const result = await runLocalExploreRepo(
      { repository_root: root, query: question.query, model, limit: 10 },
      async (answerModel, prompt, system, format) => {
        const started = performance.now();
        try {
          const response = await axios.post(`${OLLAMA_HOST}/api/generate`,
            { model: answerModel, prompt, system, format, think, stream: false, options: { num_ctx, num_predict } },
            { timeout: REQUEST_TIMEOUT_MS });
          const { response: output, thinking, context, ...metrics } = response.data;
          calls.push({ elapsed_ms: Math.round(performance.now() - started), prompt_chars: prompt.length, system_chars: system.length, output, metrics });
          return (output || thinking || "") as string;
        } catch (error) {
          calls.push({ elapsed_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
    );
    const elapsed_ms = Math.round(performance.now() - started);
    process.stderr.write(`  ${model} ${question.id} finished in ${elapsed_ms}ms (${result.status})\n`);
    questions.push({ id: question.id, query: question.query, started_at, elapsed_ms, calls, result });
    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(resolve(outputPath), `${JSON.stringify({ protocol, results: [...results, { model, questions }] }, null, 2)}\n`);
  }
  results.push({ model, model_digest: modelDigests.get(model) ?? "not listed at startup", model_started_at: modelStartedAt, model_elapsed_ms: Math.round(performance.now() - modelStarted), questions });
  const output = `${JSON.stringify({ protocol, results }, null, 2)}\n`;
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(resolve(outputPath), output);
  process.stderr.write(`Finished ${model}; checkpointed ${resolve(outputPath)}\n`);
}

process.stdout.write(`${JSON.stringify({ protocol, results }, null, 2)}\n`);
