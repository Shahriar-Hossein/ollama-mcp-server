import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import axios from "axios";
import { OLLAMA_HOST, REQUEST_TIMEOUT_MS } from "../../src/ollama-client.js";
import { runLocalExploreRepo } from "../../src/experimental/tools/local-explore-repo.js";

type Fixture = {
  version: number;
  files?: Record<string, string>;
  questions: Array<{ id: string; query: string }>;
};

const arguments_ = process.argv.slice(2);
function pathOption(name: string) {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  arguments_.splice(index, 2);
  return resolve(value);
}
const repositoryRoot = pathOption("--repository-root");
const fixtureOverride = pathOption("--fixture");
function integerOption(name: string, fallback?: number) {
  const index = arguments_.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(arguments_[index + 1]);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} requires a positive integer`);
  arguments_.splice(index, 2);
  return value;
}
const num_ctx = integerOption("--num-ctx");
const num_predict = integerOption("--num-predict");
if (num_predict !== undefined && num_ctx !== undefined && num_predict + 1024 >= num_ctx)
  throw new Error("Output ceiling leaves no useful input budget");
const think = arguments_.includes("--think");
const [outputPath, ...models] = arguments_.filter((argument) => argument !== "--think");
if (!outputPath || !models.length) {
  throw new Error(
    "Usage: tsx scripts/experimental/run-local-explore-repo-smoke.ts [--think] [--num-ctx N] [--num-predict N] <output-json> <model> [model...]",
  );
}

const root = repositoryRoot ?? process.cwd();
const fixturePath =
  fixtureOverride ??
  resolve(
    process.cwd(),
    "docs/experimental/benchmarks/runs/2026-09-24-local-explore-repo-queries.json",
  );
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
for (const [file, hash] of Object.entries(fixture.files ?? {})) {
  if (
    createHash("sha256")
      .update(readFileSync(resolve(root, file)))
      .digest("hex") !== hash
  ) {
    throw new Error(`Frozen source changed: ${file}`);
  }
}
const runCommand = (command: string, args: string[], cwd = process.cwd()) => {
  try {
    return execFileSync(command, args, { encoding: "utf8", cwd }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
};
const modelDigests = new Map(
  runCommand("ollama", ["list"])
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const [name, digest] = line.trim().split(/\s{2,}/);
      return name && digest ? [[name, digest] as const] : [];
    }),
);
const protocol = {
  fixture_path: fixturePath,
  fixture_version: fixture.version,
  fixture_sha256: createHash("sha256").update(readFileSync(fixturePath)).digest("hex"),
  implementation_sha256: Object.fromEntries(
    [
      "src/experimental/tools/local-explore-repo.ts",
      "src/experimental/tools/local-explore-packing.ts",
      "src/experimental/tools/local-explore-validation.ts",
      "src/experimental/tools/local-explore-relationships.ts",
      "src/experimental/tools/local-explore-operations.ts",
      "src/experimental/tools/local-explore-prompt.ts",
      "src/ollama-client.ts",
      "src/qwen-tokenizer.ts",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), file)))
        .digest("hex"),
    ]),
  ),
  repository_root: root,
  commit_hash: runCommand("git", ["rev-parse", "HEAD"]),
  working_tree_diff: runCommand("git", ["diff", "--binary"]),
  target_commit_hash: runCommand("git", ["rev-parse", "HEAD"], root),
  target_working_tree_diff: runCommand("git", ["diff", "--binary"], root),
  limit: 10,
  route_controls: {
    retrieval_mode: "basic",
    max_files_per_part: 6,
    max_bundles: 6,
    max_context_chars: 24_000,
    question_parts: true,
    operation_checklists: true,
    operation_provider_hints: true,
    explicit_image_conditions: true,
    negated_image_operations: true,
    whole_operation_question: true,
    named_operation_method_pairs: true,
    same_method_coverage: true,
    requirement_window_priority: true,
    cleanup_error_contrast: true,
    unchecked_completeness_requires_review: true,
    max_refs_per_part: 16,
    max_operation_windows_per_source: 6,
    reserve_all_chain_files: true,
    import_call_expansion_hops: 2,
    named_caller_identity: true,
    direct_object_provider_pairs: true,
    bundled_context_dedup: true,
    evidence_line_refs: true,
    bounded_expansion_rounds: 1,
    structured_output: true,
    num_ctx,
    num_predict,
    think,
    invalid_evidence_retries: 1,
  },
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
      { repository_root: root, query: question.query, model, limit: 10, num_ctx, num_predict },
      async (answerModel, prompt, system, format, _think, options) => {
        const started = performance.now();
        try {
          const response = await axios.post(
            `${OLLAMA_HOST}/api/generate`,
            { model: answerModel, prompt, system, format, think, stream: false, options },
            { timeout: REQUEST_TIMEOUT_MS },
          );
          const { response: output, thinking, context, ...metrics } = response.data;
          calls.push({
            elapsed_ms: Math.round(performance.now() - started),
            prompt,
            system,
            format,
            options,
            prompt_chars: prompt.length,
            system_chars: system.length,
            output,
            metrics,
          });
          return (output || thinking || "") as string;
        } catch (error) {
          calls.push({
            elapsed_ms: Math.round(performance.now() - started),
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    );
    const elapsed_ms = Math.round(performance.now() - started);
    process.stderr.write(
      `  ${model} ${question.id} finished in ${elapsed_ms}ms (${result.status})\n`,
    );
    questions.push({
      id: question.id,
      query: question.query,
      started_at,
      elapsed_ms,
      calls,
      result,
    });
    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(
      resolve(outputPath),
      `${JSON.stringify({ protocol, results: [...results, { model, questions }] }, null, 2)}\n`,
    );
  }
  results.push({
    model,
    model_digest: modelDigests.get(model) ?? "not listed at startup",
    model_started_at: modelStartedAt,
    model_elapsed_ms: Math.round(performance.now() - modelStarted),
    questions,
  });
  const output = `${JSON.stringify({ protocol, results, complete: results.length === models.length }, null, 2)}\n`;
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(resolve(outputPath), output);
  process.stderr.write(`Finished ${model}; checkpointed ${resolve(outputPath)}\n`);
}

process.stdout.write(`Completed ${results.length} model(s); artifacts: ${resolve(outputPath)}\n`);
