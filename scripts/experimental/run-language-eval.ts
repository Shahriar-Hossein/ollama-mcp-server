import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
  DEFAULT_LOCAL_MODEL,
  TOOL_OUTPUT_RESERVES,
  checkGenerationInputBudget,
  clearModelSettingsCache,
  generateResult,
  resolveModelBudget,
  showModel,
} from "../../src/ollama-client.js";
import {
  runLocalExploreRepo,
  type LocalExploreObserverEvent,
} from "../../src/experimental/tools/local-explore-repo.js";
import { checkedFile } from "../../src/experimental/tools/local-explore-packing.js";
import { validateLanguageFixture, type LanguageFixture } from "./language-eval-fixture.js";
import {
  emptyManualReview,
  evidenceAnswerRequest,
  scoreLanguageEvidence,
  validateEvidenceAnswer,
  validateManualReview,
} from "./language-eval-score.js";

import { checkedEvidenceScopes, scopeAnswerRequest, type ScopeAnnotation } from "./scope-answer-context.js";

const manifestPath = resolve("docs/experimental/benchmarks/runs/2026-10-09-language-eval.json");
const sourcePath = resolve("scripts/experimental/fixtures/language-eval/source");
const DEFAULT_OUTPUT = "benchmark-data/language-eval/language-eval.json";
const PER_CALL_DEADLINE_MS = 120_000;
const FROZEN_FIXTURE_SHA256 = "42ac429b22f76fc90c234b205c37f43ce5c7391c30dab74102e761bb221330da";

export function parseLanguageEvalArgs(args: string[]) {
  let output = DEFAULT_OUTPUT;
  let model = DEFAULT_LOCAL_MODEL;
  let only: string[] | undefined;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (!["--output", "--model", "--only"].includes(name))
      throw new Error(`Unknown option: ${name}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    if (name === "--output") output = value;
    if (name === "--model") model = value;
    if (name === "--only") {
      only = value.split(",");
      if (only.some((id) => !id.trim())) throw new Error("--only requires nonempty question IDs");
    }
  }
  if (only?.length && new Set(only).size !== only.length) throw new Error("--only IDs must be unique");
  return { output: resolve(output), model, only };
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function implementationFiles(): string[] {
  const explorer = readdirSync("src/explorer", { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => relative(process.cwd(), resolve(entry.parentPath, entry.name)));
  const scout = readdirSync("src/experimental/tools", { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith("local-explore-") &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts"),
    )
    .map((entry) => relative(process.cwd(), resolve(entry.parentPath, entry.name)));
  return [
    "scripts/experimental/run-language-eval.ts",
    "scripts/experimental/language-eval-score.ts",
    "scripts/experimental/language-eval-fixture.ts",
    "scripts/experimental/scope-answer-context.ts",
    ...scout,
    ...explorer,
    "src/ollama-client.ts",
    "src/request-queue.ts",
    "src/qwen-tokenizer.ts",
    "package-lock.json",
  ].sort();
}

function verifySelectedEvidence(root: string, evidence: Array<{ file: string; line: number; quote: string }>) {
  for (const item of evidence) {
    const source = readFileSync(checkedFile(root, item.file), "utf8").split("\n");
    if (source[item.line - 1]?.trim() !== item.quote)
      throw new Error(`Selected quote differs from checked source: ${item.file}:${item.line}`);
  }
}

function runCommand(command: string, args: string[], cwd = process.cwd()): string {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function copyFixtureSources(sourceRoot: string, targetRoot: string): void {
  const entries = readdirSync(sourceRoot, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    const from = resolve(entry.parentPath, entry.name);
    const rel = relative(sourceRoot, from);
    const to = resolve(targetRoot, rel);
    if (entry.isDirectory()) mkdirSync(to, { recursive: true });
    else if (entry.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    } else {
      throw new Error(`Unsupported source entry in frozen fixture: ${rel}`);
    }
  }
}

function materializeTarget(sourceRoot: string): string {
  const target = mkdtempSync(join(tmpdir(), "language-eval-target-"));
  try {
    copyFixtureSources(sourceRoot, target);
    execFileSync("git", ["init", "-q", target]);
    execFileSync("git", ["-C", target, "add", "."]);
    execFileSync("git", [
      "-C",
      target,
      "-c",
      "user.name=Language Eval Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "frozen source fixture",
    ]);
    return target;
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

function parseModelList(raw: string, model: string) {
  const line = raw
    .split("\n")
    .slice(1)
    .find((item) => item.trim().startsWith(`${model} `));
  return line?.trim().split(/\s{2,}/)[1] ?? "not listed";
}

function checkpoint(path: string, protocol: unknown, results: unknown[], current?: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(
    temp,
    `${JSON.stringify(
      { protocol, results: current === undefined ? results : [...results, current], complete: false },
      null,
      2,
    )}\n`,
  );
  renameSync(temp, path);
}

async function answerFromEvidence(
  query: string,
  evidence: Array<{ file: string; line: number; quote: string }>,
  model: string,
  onRequest?: (request: ReturnType<typeof evidenceAnswerRequest>, input: unknown, options: unknown) => void,
  onGeneration?: (event: {
    elapsed_ms: number;
    raw_output?: string;
    completion?: AnswerFromEvidenceResult["completion"];
    error?: string;
  }) => void,
  annotations?: ScopeAnnotation[],
) {
  const request = scopeAnswerRequest(query, evidence, annotations);
  const budget = await resolveModelBudget(
    model,
    { num_predict: 512 },
    undefined,
    TOOL_OUTPUT_RESERVES.scout,
  );
  const input = await checkGenerationInputBudget(budget, {
    prompt: request.prompt,
    system: request.system,
    format: request.format,
  });
  if (!input.fits) throw new Error("Final-answer prompt exceeds the model input budget");
  const modelOptions = { num_ctx: budget.num_ctx, num_predict: 512 };
  onRequest?.(request, input, modelOptions);
  const started = performance.now();
  let raw: Awaited<ReturnType<typeof generateResult>>;
  try {
    raw = await generateResult(
      model,
      request.prompt,
      request.system,
      request.format,
      false,
      modelOptions,
      PER_CALL_DEADLINE_MS,
    );
  } catch (error) {
    onGeneration?.({
      elapsed_ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const elapsed_ms = Math.round(performance.now() - started);
  onGeneration?.({ elapsed_ms, raw_output: raw.text, completion: raw.completion });
  return {
    request,
    input,
    elapsed_ms,
    raw_output: raw.text,
    completion: raw.completion,
    checked: validateEvidenceAnswer(raw.text, evidence),
  };
}

export type AnswerFromEvidenceResult = Awaited<ReturnType<typeof answerFromEvidence>>;

export type EvalFixtureDescriptor = {
  manifestPath: string;
  sourcePath: string;
  sha256: string;
  validate: typeof validateLanguageFixture;
  implementationFiles: string[];
};

export async function runLanguageEval(options: {
  output: string;
  model: string;
  only?: string[];
  fixture?: EvalFixtureDescriptor;
  answerContextMode?: "selected_only" | "lexical_scopes";
  generate?: typeof generateResult;
  scout?: typeof runLocalExploreRepo;
  answer?: (
    query: string,
    evidence: Array<{ file: string; line: number; quote: string }>,
    model: string,
    onRequest?: (request: ReturnType<typeof evidenceAnswerRequest>, input: unknown, options: unknown) => void,
    onGeneration?: Parameters<typeof answerFromEvidence>[4],
    annotations?: ScopeAnnotation[],
  ) => Promise<AnswerFromEvidenceResult>;
  showSettings?: typeof showModel;
  modelDigest?: string;
  ollamaVersion?: string;
}) {
  const answerContextMode = options.answerContextMode ?? "selected_only";
  if (answerContextMode !== "selected_only" && answerContextMode !== "lexical_scopes")
    throw new Error("Unknown answer context mode");
  const descriptor = options.fixture;
  const fixtureManifestPath = resolve(descriptor?.manifestPath ?? manifestPath);
  const fixtureSourcePath = resolve(descriptor?.sourcePath ?? sourcePath);
  const pinnedHash = descriptor?.sha256 ?? FROZEN_FIXTURE_SHA256;
  const validateFixture = descriptor?.validate ?? validateLanguageFixture;
  const output = resolve(options.output);
  const protectedPaths = [fixtureManifestPath, fixtureSourcePath];
  for (const path of [output, `${output}.tmp`]) {
    if (protectedPaths.some((protectedPath) => path === protectedPath ||
        path.startsWith(`${protectedPath}/`)))
      throw new Error("Evaluation output would overwrite the frozen fixture");
  }
  const fixture = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as LanguageFixture;
  const fixtureSha = hashFile(fixtureManifestPath);
  if (fixtureSha !== pinnedHash)
    throw new Error("Language evaluation manifest differs from the frozen fixture commit");
  const validationStarted = performance.now();
  validateFixture(fixture, fixtureSourcePath);
  const fixtureValidationMs = Math.round(performance.now() - validationStarted);
  if (options.only?.some((id) => !id.trim())) throw new Error("--only requires nonempty question IDs");
  if (options.only && new Set(options.only).size !== options.only.length)
    throw new Error("--only IDs must be unique");
  const requested = options.only
    ? fixture.questions.filter((question) => options.only!.includes(question.id))
    : fixture.questions;
  const unknown = options.only?.filter((id) => !fixture.questions.some((question) => question.id === id));
  if (unknown?.length) throw new Error(`Unknown question IDs: ${unknown.join(", ")}`);
  if (!requested.length) throw new Error("No questions selected");

  const preflight = {
    answer_context_mode: answerContextMode,
    fixture_path: fixtureManifestPath,
    fixture_sha256: fixtureSha,
    source_hashes: fixture.source_hashes,
    model: options.model,
    requested_ids: requested.map((question) => question.id),
    setup_started_at: new Date().toISOString(),
  };
  checkpoint(options.output, preflight, []);
  clearModelSettingsCache(options.model);
  const settingsStarted = performance.now();
  let settings: Awaited<ReturnType<typeof showModel>>;
  try {
    settings = await (options.showSettings ?? showModel)(options.model);
  } catch (error) {
    checkpoint(options.output, { ...preflight, setup_error: error instanceof Error ? error.message : String(error) }, []);
    throw error;
  }
  const settingsSha = createHash("sha256").update(JSON.stringify(settings)).digest("hex");
  const settingsElapsedMs = Math.round(performance.now() - settingsStarted);
  const modelDigest =
    options.modelDigest ?? parseModelList(runCommand("ollama", ["list"]), options.model);
  const materializationStarted = performance.now();
  let targetRoot: string;
  try {
    targetRoot = materializeTarget(fixtureSourcePath);
  } catch (error) {
    checkpoint(options.output, { ...preflight, setup_error: error instanceof Error ? error.message : String(error) }, []);
    throw error;
  }
  const materializationMs = Math.round(performance.now() - materializationStarted);
  const checkFrozen = () => {
    if (hashFile(fixtureManifestPath) !== pinnedHash)
      throw new Error("Frozen answer manifest changed during evaluation");
    validateFixture(fixture, fixtureSourcePath);
    validateFixture(fixture, targetRoot);
  };
  let targetValidationMs = 0;
  try {
    const targetValidationStarted = performance.now();
    checkFrozen();
    targetValidationMs = Math.round(performance.now() - targetValidationStarted);
  } catch (error) {
    rmSync(targetRoot, { recursive: true, force: true });
    throw error;
  }
  const protocol = {
    answer_context_mode: answerContextMode,
    fixture_path: fixtureManifestPath,
    fixture_sha256: fixtureSha,
    source_hashes: fixture.source_hashes,
    implementation_sha256: Object.fromEntries(
      [...implementationFiles(), ...(descriptor?.implementationFiles ?? [])].map((file) => [file, hashFile(resolve(file))]),
    ),
    model: options.model,
    model_digest: modelDigest,
    model_settings_num_ctx:
      settings.parameters?.match(/^\s*num_ctx\s+(-?\d+)\s*$/m)?.[1] ?? null,
    model_settings_num_predict:
      settings.parameters?.match(/^\s*num_predict\s+(-?\d+)\s*$/m)?.[1] ?? null,
    model_settings_sha256: settingsSha,
    model_settings_elapsed_ms: settingsElapsedMs,
    ollama_version: options.ollamaVersion ?? runCommand("ollama", ["--version"]),
    repository_commit_hash: runCommand("git", ["rev-parse", "HEAD"]),
    repository_working_tree_diff: runCommand("git", ["diff", "--binary"]),
    target_commit_hash: runCommand("git", ["rev-parse", "HEAD"], targetRoot),
    fixture_freeze_commit: runCommand("git", [
      "log",
      "-1",
      "--format=%H",
      "--",
      relative(process.cwd(), fixtureManifestPath),
    ]),
    requested_ids: requested.map((question) => question.id),
    setup_ms: {
      fixture_validation: fixtureValidationMs,
      source_materialization_and_git: materializationMs,
      target_validation: targetValidationMs,
      model_settings: settingsElapsedMs,
    },
    scout_retry_limit: 2,
    answer_retry_limit: 0,
    answer_output_tokens: 512,
    sampling: { temperature: "Ollama default (not explicitly passed)" },
    per_call_deadline_ms: PER_CALL_DEADLINE_MS,
    timing_note:
      "Generation wall times include local queue wait and API request time. End-to-end timings include measured setup and observer/checkpoint overhead; they are not model-only latency.",
  };
  const results: unknown[] = [];
  checkpoint(options.output, protocol, results);
  try {
    for (const question of requested) {
      const questionStartedAt = new Date().toISOString();
      const questionStarted = performance.now();
      const events: LocalExploreObserverEvent[] = [];
      const scoutCalls: Array<Record<string, unknown>> = [];
      const cell: Record<string, unknown> = {
        id: question.id,
        language: question.language,
        query: question.query,
        started_at: questionStartedAt,
        status: "running",
        events,
        scout_calls: scoutCalls,
        answer_call: null,
        answer: null,
        score: null,
        manual_review: emptyManualReview(),
        timings_ms: {
          index: 0,
          retrieval: 0,
          packing: 0,
          expansion: 0,
          budget_setup: 0,
          input_check: 0,
          scout_queue_request_wall: 0,
          answer_queue_request_wall: 0,
          scout_end_to_end: null,
          answer_end_to_end: null,
          end_to_end: null,
        },
        error: null,
      };
      const save = () => checkpoint(options.output, protocol, results, cell);
      let result: Awaited<ReturnType<typeof runLocalExploreRepo>> | undefined;
      const scoutStarted = performance.now();
      try {
        checkFrozen();
        result = await (options.scout ?? runLocalExploreRepo)(
          { repository_root: targetRoot, query: question.query, model: options.model, limit: 10 },
          async (model, prompt, system, format, think, modelOptions) => {
            checkFrozen();
            const attempt = scoutCalls.length + 1;
            const call: Record<string, unknown> = {
              attempt,
              prompt,
              system,
              format,
              think,
              options: modelOptions,
              started_at: new Date().toISOString(),
              queue_request_wall_ms: null,
              output: null,
              completion: null,
              error: null,
            };
            scoutCalls.push(call);
            save();
            const callStarted = performance.now();
            try {
              const response = await (options.generate ?? generateResult)(
                model,
                prompt,
                system,
                format,
                think,
                modelOptions,
                PER_CALL_DEADLINE_MS,
              );
              call.output = response.text;
              call.completion = response.completion;
              return response.text;
            } catch (error) {
              call.error = error instanceof Error ? error.message : String(error);
              throw error;
            } finally {
              call.queue_request_wall_ms = Math.round(performance.now() - callStarted);
              (cell.timings_ms as Record<string, number | null>).scout_queue_request_wall = scoutCalls.reduce(
                (sum, item) => sum + (Number(item.queue_request_wall_ms) || 0),
                0,
              );
              save();
            }
          },
          undefined,
          (event) => {
            events.push(event);
            const timings = cell.timings_ms as Record<string, number | null>;
            if (event.type === "budget_setup") timings.budget_setup = event.elapsed_ms;
            if (event.type === "index") timings.index = event.elapsed_ms;
            if (event.type === "retrieval")
              timings.retrieval = (timings.retrieval ?? 0) + event.elapsed_ms;
            if (event.type === "packing") timings.packing = event.elapsed_ms;
            if (event.type === "expansion")
              timings.expansion = (timings.expansion ?? 0) + event.elapsed_ms;
            if (event.type === "input_check")
              timings.input_check = (timings.input_check ?? 0) + event.elapsed_ms;
            save();
          },
        );
        (cell.timings_ms as Record<string, number | null>).scout_end_to_end = Math.round(
          performance.now() - scoutStarted,
        );
        cell.result = result;
        cell.status = result.status;
        verifySelectedEvidence(targetRoot, result.evidence);
        const score = scoreLanguageEvidence(question, events, result.evidence);
        cell.score = score;
        if (result.evidence.length) {
          const answerStarted = performance.now();
          const annotations = answerContextMode === "lexical_scopes"
            ? checkedEvidenceScopes(targetRoot, result.evidence) : undefined;
          cell.answer_context = annotations ?? null;
          const answerCallRecord: Record<string, unknown> = {
            started_at: new Date().toISOString(),
            queue_request_wall_ms: null,
            prompt: null,
            system: null,
            format: null,
            options: { num_predict: 512 },
            output: null,
            completion: null,
            error: null,
          };
          cell.answer_call = answerCallRecord;
          save();
          try {
            checkFrozen();
            const answer = await (options.answer ?? answerFromEvidence)(
              question.query,
              result.evidence,
              options.model,
              (request, input, modelOptions) => {
                checkFrozen();
                answerCallRecord.prompt = request.prompt;
                answerCallRecord.system = request.system;
                answerCallRecord.format = request.format;
                answerCallRecord.input = input;
                answerCallRecord.options = modelOptions;
                save();
              },
              (generation) => {
                answerCallRecord.queue_request_wall_ms = generation.elapsed_ms;
                answerCallRecord.output = generation.raw_output ?? answerCallRecord.output;
                answerCallRecord.completion = generation.completion ?? answerCallRecord.completion;
                answerCallRecord.error = generation.error ?? answerCallRecord.error;
                (cell.timings_ms as Record<string, number | null>).answer_queue_request_wall =
                  generation.elapsed_ms;
                save();
              },
              annotations,
            );
            answerCallRecord.prompt ??= answer.request.prompt;
            answerCallRecord.system ??= answer.request.system;
            answerCallRecord.format ??= answer.request.format;
            answerCallRecord.output = answer.raw_output;
            answerCallRecord.completion = answer.completion;
            answerCallRecord.queue_request_wall_ms ??= answer.elapsed_ms;
            cell.answer = { ...answer.checked, input: answer.input };
            (cell.timings_ms as Record<string, number | null>).answer_queue_request_wall ??=
              answer.elapsed_ms;
          } catch (error) {
            answerCallRecord.error = error instanceof Error ? error.message : String(error);
          } finally {
            (cell.timings_ms as Record<string, number | null>).answer_end_to_end = Math.round(
              performance.now() - answerStarted,
            );
          }
        } else {
          cell.answer = { status: "not_generated_no_selected_evidence" };
        }
        validateManualReview(cell.manual_review as ReturnType<typeof emptyManualReview>);
      } catch (error) {
        (cell.timings_ms as Record<string, number | null>).scout_end_to_end ??= Math.round(
          performance.now() - scoutStarted,
        );
        cell.status = "error";
        cell.error = error instanceof Error ? error.message : String(error);
        if (result) cell.result = result;
      } finally {
        (cell.timings_ms as Record<string, number | null>).end_to_end = Math.round(
          performance.now() - questionStarted,
        );
        cell.elapsed_ms = (cell.timings_ms as Record<string, number | null>).end_to_end;
        cell.finished_at = new Date().toISOString();
        save();
        results.push(cell);
        checkpoint(options.output, protocol, results);
      }
    }
    checkFrozen();
    const final = `${JSON.stringify({ protocol, results, complete: true }, null, 2)}\n`;
    writeFileSync(options.output, final);
    return { protocol, results, complete: true };
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("run-language-eval.ts")) {
  const options = parseLanguageEvalArgs(process.argv.slice(2));
  runLanguageEval(options)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
