import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { LocalExploreObserverEvent } from "../../src/experimental/tools/local-explore-repo.js";
import { validateLanguageFixture, type LanguageFixture } from "./language-eval-fixture.js";
import {
  evidenceAnswerRequest,
  validateEvidenceAnswer,
} from "./language-eval-score.js";
import {
  parseLanguageEvalArgs,
  runLanguageEval,
  type AnswerFromEvidenceResult,
} from "./run-language-eval.js";

const manifestPath = resolve("docs/experimental/benchmarks/runs/2026-10-09-language-eval.json");
const sourceRoot = resolve("scripts/experimental/fixtures/language-eval/source");
const fixture = JSON.parse(readFileSync(manifestPath, "utf8")) as LanguageFixture;

test("runner exposes only source files to scout and keeps keys out of final prompts", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "language-eval-runner-"));
  const output = join(outputRoot, "result.json");
  const selected = {
    file: "php/src/Worker.php",
    line: 5,
    quote: "public function run(array $payload): array {",
  };
  let answerPrompt = "";
  try {
    const run = await runLanguageEval({
      output,
      model: "mock:fixture",
      modelDigest: "mock-digest",
      ollamaVersion: "mock-version",
      showSettings: async () => ({ parameters: "num_ctx 4096\nnum_predict 512" }),
      only: ["PHP-01"],
      scout: async (params, _generate, _budget, observe) => {
        const targetEntries = readdirSync(params.repository_root, { withFileTypes: true, recursive: true });
        assert.equal(targetEntries.some((entry) => entry.name.endsWith("language-eval.json")), false);
        assert.equal(targetEntries.some((entry) => entry.name === "source"), false);
        validateLanguageFixture(fixture, params.repository_root);
        const sourceRange = {
          start: { line: 1, column: 0, byte: 0 },
          end: { line: 11, column: 0, byte: 400 },
        };
        const retrieved = {
          score: 1,
          sources: [],
          evidence: {
            kind: "symbol" as const,
            file: selected.file,
            symbol: {
              id: "worker",
              file: selected.file,
              qualified_name: "Eval\\Worker\\Worker::run",
              kind: "method" as const,
              range: sourceRange,
            },
          },
        };
        const sourceLine = readFileSync(join(params.repository_root, selected.file), "utf8")
          .split("\n")[selected.line - 1]
          .trim();
        const snapshot = Object.freeze({
          id: "C1",
          kind: "symbol" as const,
          file: selected.file,
          lines: Object.freeze([Object.freeze({ line: selected.line, text: sourceLine })]),
        });
        const events: LocalExploreObserverEvent[] = [
          { type: "budget_setup", elapsed_ms: 1 },
          { type: "index", elapsed_ms: 2 },
          { type: "retrieval", part_id: "P1", query: "q", elapsed_ms: 3, results: [retrieved] },
          {
            type: "packing",
            elapsed_ms: 4,
            candidates: Object.freeze([snapshot]),
            bundles: Object.freeze([
              Object.freeze({
                id: "B1",
                part_id: "P1",
                why_retrieved: "fixture",
                relationship: "direct",
                candidates: Object.freeze([snapshot]),
              }),
            ]),
          },
          { type: "input_check", attempt: 1, elapsed_ms: 1, fits: true },
          {
            type: "generation_context",
            attempt: 1,
            refs: Object.freeze([
              Object.freeze({
                ref: "E1",
                candidate_id: "C1",
                file: selected.file,
                line: selected.line,
                text: sourceLine,
              }),
            ]),
          },
        ];
        for (const event of events) observe?.(event);
        return {
          status: "needs_review",
          evidence: [{ id: "C1", ...selected }],
          candidates: [snapshot],
        } as unknown as Awaited<ReturnType<typeof import("../../src/experimental/tools/local-explore-repo.js").runLocalExploreRepo>>;
      },
      answer: async (query, evidence, _model, onRequest) => {
        const request = evidenceAnswerRequest(query, evidence);
        answerPrompt = request.prompt;
        const outputText = JSON.stringify({ answer: "Method declaration is present.", claims: [], uncertainty: [] });
        const checked = validateEvidenceAnswer(outputText, evidence);
        onRequest?.(request, { fits: true }, { num_ctx: 4096, num_predict: 512 });
        return {
          request,
          input: { fits: true } as AnswerFromEvidenceResult["input"],
          elapsed_ms: 7,
          raw_output: outputText,
          completion: {
            status: "complete",
            done: true,
            done_reason: "stop",
            prompt_eval_count: 10,
            eval_count: 8,
            total_duration: 20,
            load_duration: 2,
            prompt_eval_duration: 5,
            eval_duration: 13,
          },
          checked,
        };
      },
    });
    assert.equal(run.complete, true);
    assert.equal(run.results.length, 1);
    const result = run.results[0] as {
      status: string;
      score: { selected: number };
      manual_review: { status: string; answer_correct: null; correction_ms: null };
      timings_ms: Record<string, number | null>;
    };
    assert.equal(result.status, "needs_review");
    assert.equal(result.score.selected, 0);
    assert.deepEqual(result.manual_review, {
      status: "pending",
      answer_correct: null,
      incorrect_claims: null,
      claims: null,
      parent_review_ms: null,
      correction_ms: null,
      retries: null,
      corrections: null,
    });
    assert.equal(result.timings_ms.index, 2);
    assert.equal(result.timings_ms.retrieval, 3);
    assert.equal(result.timings_ms.packing, 4);
    assert.ok(answerPrompt.includes(selected.quote));
    assert.equal(answerPrompt.includes(fixture.questions[0].answer), false);
    for (const required of fixture.questions[0].required)
      assert.equal(answerPrompt.includes(required.text), false);
    const artifact = readFileSync(output, "utf8");
    assert.equal(artifact.includes(fixture.questions[0].answer), false);
    assert.equal(artifact.includes("PRIVATE_ANSWER_SENTINEL"), false);
    validateLanguageFixture(fixture, sourceRoot);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("runner distinguishes abstention and preserves a source-only target", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "language-eval-abstain-"));
  try {
    let answerCalls = 0;
    const run = await runLanguageEval({
      output: join(outputRoot, "result.json"),
      model: "mock:fixture",
      modelDigest: "mock-digest",
      ollamaVersion: "mock-version",
      showSettings: async () => ({ parameters: "num_ctx 4096" }),
      only: ["RS-02"],
      scout: async (_params, _generate, _budget, observe) => {
        observe?.({ type: "index", elapsed_ms: 1 });
        return {
          status: "needs_review",
          evidence: [],
          candidates: [],
        } as unknown as Awaited<ReturnType<typeof import("../../src/experimental/tools/local-explore-repo.js").runLocalExploreRepo>>;
      },
      answer: async () => {
        answerCalls++;
        throw new Error("must not answer without selected evidence");
      },
    });
    const result = run.results[0] as { answer: { status: string }; manual_review: { answer_correct: null } };
    assert.equal(answerCalls, 0);
    assert.deepEqual(result.answer, { status: "not_generated_no_selected_evidence" });
    assert.equal(result.manual_review.answer_correct, null);
    validateLanguageFixture(fixture, sourceRoot);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("runner checkpoints malformed final-answer output and rejects empty ID filters", async () => {
  assert.throws(() => parseLanguageEvalArgs(["--only", ""]), /requires a value/);
  assert.throws(() => parseLanguageEvalArgs(["--only", "PHP-01,"]), /nonempty question IDs/);
  assert.throws(
    () => parseLanguageEvalArgs(["--only", "PHP-01,PHP-01"]),
    /IDs must be unique/,
  );

  const outputRoot = mkdtempSync(join(tmpdir(), "language-eval-answer-error-"));
  try {
    const selected = {
      file: "php/src/Worker.php",
      line: 5,
      quote: "public function run(array $payload): array {",
    };
    const run = await runLanguageEval({
      output: join(outputRoot, "result.json"),
      model: "mock:fixture",
      modelDigest: "mock-digest",
      ollamaVersion: "mock-version",
      showSettings: async () => ({ parameters: "num_ctx 4096" }),
      only: ["PHP-01"],
      scout: async () => ({
        status: "needs_review",
        evidence: [{ id: "C1", ...selected }],
        candidates: [],
      }) as unknown as Awaited<ReturnType<typeof import("../../src/experimental/tools/local-explore-repo.js").runLocalExploreRepo>>,
      answer: async (_query, evidence, _model, onRequest, onGeneration) => {
        const request = evidenceAnswerRequest("query", evidence);
        onRequest?.(request, { fits: true }, { num_predict: 512 });
        const rawOutput = "{truncated";
        onGeneration?.({
          elapsed_ms: 13,
          raw_output: rawOutput,
          completion: {
            status: "incomplete",
            done: false,
            done_reason: "length",
            prompt_eval_count: 10,
            eval_count: 8,
            total_duration: 20,
            load_duration: 2,
            prompt_eval_duration: 5,
            eval_duration: 13,
          },
        });
        throw new Error("Final answer is not a JSON object");
      },
    });
    const cell = run.results[0] as {
      answer: unknown;
      answer_call: { output: string; error: string; queue_request_wall_ms: number };
      timings_ms: { answer_queue_request_wall: number };
    };
    assert.equal(cell.answer, null);
    assert.equal(cell.answer_call.output, "{truncated");
    assert.match(cell.answer_call.error, /not a JSON object/);
    assert.equal(cell.answer_call.queue_request_wall_ms, 13);
    assert.equal(cell.timings_ms.answer_queue_request_wall, 13);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});
