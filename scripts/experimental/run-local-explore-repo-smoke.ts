import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generate } from "../../src/ollama-client.js";
import { runLocalExploreRepo } from "../../src/experimental/tools/local-explore-repo.js";

type Fixture = { version: number; questions: Array<{ id: string; query: string }> };

const arguments_ = process.argv.slice(2);
const think = arguments_.includes("--think");
const [outputPath, ...models] = arguments_.filter((argument) => argument !== "--think");
if (!outputPath || !models.length) {
  throw new Error("Usage: tsx scripts/experimental/run-local-explore-repo-smoke.ts [--think] <output-json> <model> [model...]");
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
  route_controls: { retrieval_mode: "basic", max_files: 6, num_ctx: 16_384, num_predict: 2_000, think, invalid_evidence_retries: 1 },
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
    const result = await runLocalExploreRepo(
      { repository_root: root, query: question.query, model, limit: 10 },
      (answerModel, prompt, system, format, _think, options) => generate(answerModel, prompt, system, format, think, options)
    );
    const elapsed_ms = Math.round(performance.now() - started);
    process.stderr.write(`  ${model} ${question.id} finished in ${elapsed_ms}ms (${result.status})\n`);
    questions.push({ id: question.id, query: question.query, started_at, elapsed_ms, result });
  }
  results.push({ model, model_digest: modelDigests.get(model) ?? "not listed at startup", model_started_at: modelStartedAt, model_elapsed_ms: Math.round(performance.now() - modelStarted), questions });
  const output = `${JSON.stringify({ protocol, results }, null, 2)}\n`;
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(resolve(outputPath), output);
  process.stderr.write(`Finished ${model}; checkpointed ${resolve(outputPath)}\n`);
}

process.stdout.write(`${JSON.stringify({ protocol, results }, null, 2)}\n`);
