import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLanguageEval } from "./language-eval-summary.js";

const timingFields = [
  "index",
  "retrieval",
  "packing",
  "expansion",
  "budget_setup",
  "input_check",
  "scout_queue_request_wall",
  "answer_queue_request_wall",
  "scout_end_to_end",
  "answer_end_to_end",
  "end_to_end",
];

function cell(
  id: string,
  language: string,
  lines: Array<{ file: string; line: number; text: string; retrieved_range: boolean; packed_initial: boolean; packed_any: boolean; selected: boolean }>,
  options: { calls?: number; answer?: boolean; endToEnd?: number } = {},
) {
  const score = {
    required: lines.length,
    retrieved_range: lines.filter((line) => line.retrieved_range).length,
    packed_initial: lines.filter((line) => line.packed_initial).length,
    packed_any: lines.filter((line) => line.packed_any).length,
    selected: lines.filter((line) => line.selected).length,
    lines,
  };
  return {
    id,
    language,
    status: "needs_review",
    score,
    scout_calls: Array.from({ length: options.calls ?? 1 }, () => ({ completion: { total_duration: 2_000_000 } })),
    answer_call: options.answer
      ? { queue_request_wall_ms: 3, output: "{}", completion: { total_duration: 3_000_000 } }
      : null,
    events: [{ type: "index", elapsed_ms: 1 }, ...(id === "Q1" ? [{ type: "expansion", outcome: "added", elapsed_ms: 0 }] : [])],
    timings_ms: Object.fromEntries(timingFields.map((key) => [key, key === "end_to_end" ? (options.endToEnd ?? 0) : key === "expansion" ? 0 : 1])),
  };
}

const artifact = (results: unknown[]) => ({
  complete: true,
  protocol: { fixture_sha256: "fixture-sha", requested_ids: results.map((row) => (row as { id: string }).id), model: "mock" },
  results,
});

test("summarizes evidence stages, calls, retries, timings, and misses deterministically", () => {
  const first = cell("Q1", "php", [
    { file: "a.php", line: 2, text: "$ready = true;", retrieved_range: true, packed_initial: true, packed_any: true, selected: true },
    { file: "a.php", line: 3, text: "return $ready;", retrieved_range: false, packed_initial: true, packed_any: true, selected: false },
  ], { calls: 2, answer: true, endToEnd: 10 });
  const second = cell("Q2", "go", [
    { file: "main.go", line: 4, text: "run()", retrieved_range: false, packed_initial: false, packed_any: false, selected: false },
  ], { endToEnd: 20 });
  const summary = summarizeLanguageEval(artifact([first, second]), "raw-sha");
  assert.equal(summary.global.required, 3);
  assert.equal(summary.global.retrieved_range, 1);
  assert.equal(summary.global.packed_initial, 2);
  assert.equal(summary.global.packed_any, 2);
  assert.equal(summary.global.selected, 1);
  assert.equal(summary.global.scout_calls, 3);
  assert.equal(summary.global.scout_retries, 1);
  assert.equal(summary.global.answer_calls, 1);
  assert.equal(summary.global.total_calls, 4);
  assert.equal(summary.global.expansions, 1);
  assert.equal(summary.global.expansion_attempts, 1);
  assert.equal(summary.global.timings_ms.expansion, 0);
  assert.equal(summary.global.native_model_total_duration_ms, 9);
  assert.equal(summary.global.native_duration_calls, 4);
  assert.equal(summary.global.timings_ms.end_to_end, 30);
  assert.equal(summary.global.median_end_to_end_ms, 15);
  assert.deepEqual(summary.global.misses.packed_any, [{ id: "Q2", file: "main.go", line: 4 }]);
  assert.deepEqual(summary.global.missed_question_ids.packed_any, ["Q2"]);
  assert.equal(summary.by_language.php.required, 2);
  assert.equal(summary.by_language.go.selected, 0);
  assert.equal(summary.artifact_sha256, "raw-sha");
});

test("requires a completed run and internally consistent evidence counts", () => {
  assert.throws(() => summarizeLanguageEval({ ...artifact([]), complete: false }, "sha"), /not complete/);
  const invalid = cell("Q1", "php", [
    { file: "a.php", line: 1, text: "x", retrieved_range: false, packed_initial: false, packed_any: false, selected: false },
  ]);
  invalid.score.selected = 1;
  assert.throws(() => summarizeLanguageEval(artifact([invalid]), "sha"), /does not match/);
  invalid.score.selected = 0;
  invalid.timings_ms.end_to_end = -1;
  assert.throws(() => summarizeLanguageEval(artifact([invalid]), "sha"), /nonnegative finite/);
});

test("reports complete-run cells without scores as unscored instead of zero misses", () => {
  const unscored = { ...cell("ERR", "rust", []), score: null, status: "error" };
  const summary = summarizeLanguageEval(artifact([unscored]), "sha");
  assert.equal(summary.global.questions, 1);
  assert.equal(summary.global.scored_questions, 0);
  assert.deepEqual(summary.global.unscored_ids, ["ERR"]);
  assert.equal(summary.global.required, 0);
  assert.equal(summary.global.misses.selected.length, 0);
});
