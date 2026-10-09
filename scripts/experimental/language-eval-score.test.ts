import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { LocalExploreObserverEvent } from "../../src/experimental/tools/local-explore-repo.js";
import type { LanguageFixture } from "./language-eval-fixture.js";
import {
  emptyManualReview,
  evidenceAnswerRequest,
  scoreLanguageEvidence,
  missingRowValues,
  parameterShadowNotes,
  missingShadowWords,
  validateEvidenceAnswer,
  validateManualReview,
} from "./language-eval-score.js";

const fixture = JSON.parse(
  readFileSync(resolve("docs/experimental/benchmarks/runs/2026-10-09-language-eval.json"), "utf8"),
) as LanguageFixture;

test("scores exact evidence tuples once across overlapping retrieval ranges and retries", () => {
  const question = fixture.questions[0];
  const expected = question.required[0];
  const events: LocalExploreObserverEvent[] = [
    {
      type: "retrieval",
      part_id: "P1",
      query: "q",
      elapsed_ms: 2,
      results: [
        {
          score: 1,
          sources: [],
          evidence: {
            kind: "symbol",
            file: expected.file,
            symbol: {
              id: "x",
              file: expected.file,
              qualified_name: "X",
              kind: "class",
              range: {
                start: { line: expected.line - 2, column: 0, byte: 0 },
                end: { line: expected.line + 2, column: 0, byte: 20 },
              },
            },
          },
        },
      ],
    },
    { type: "generation_context", attempt: 1, refs: [{ ref: "E1", candidate_id: "C1", file: expected.file, line: expected.line, text: expected.text }] },
    { type: "generation_context", attempt: 2, refs: [
      { ref: "E1", candidate_id: "C1", file: expected.file, line: expected.line, text: expected.text },
      { ref: "E2", candidate_id: "C2", file: expected.file, line: expected.line + 1, text: "expanded" },
    ] },
  ];
  const score = scoreLanguageEvidence(question, events, [
    { file: expected.file, line: expected.line, quote: expected.text.trim() },
    { file: expected.file, line: expected.line, quote: "wrong text" },
  ]);
  assert.equal(score.required, question.required.length);
  assert.equal(score.retrieved_range, 2);
  assert.equal(score.packed_initial, 1);
  assert.equal(score.packed_any, 1);
  assert.equal(score.selected, 1);
});

test("same file and line with the wrong text receives no evidence credit", () => {
  const question = fixture.questions[0];
  const score = scoreLanguageEvidence(question, [], [
    { file: question.required[0].file, line: question.required[0].line, quote: "different source text" },
  ]);
  assert.equal(score.selected, 0);
  assert.equal(score.packed_any, 0);
});

test("required rows dedupe the exact trimmed tuple but retain different text at one location", () => {
  const original = fixture.questions[0];
  const first = original.required[0];
  const question = {
    ...original,
    required: [first, { ...first, text: ` ${first.text} ` }, { ...first, text: "different line text" }],
  };
  const score = scoreLanguageEvidence(question, [], [
    { file: first.file, line: first.line, quote: first.text },
  ]);
  assert.equal(score.required, 2);
  assert.equal(score.selected, 1);
});

test("manual correction timings must be null or nonnegative", () => {
  const review = emptyManualReview();
  assert.doesNotThrow(() => validateManualReview(review));
  assert.throws(
    () => validateManualReview({ ...review, correction_ms: -1 }),
    /nonnegative finite number/,
  );
  assert.throws(
    () => validateManualReview({ ...review, retries: -1 }),
    /nonnegative integer/,
  );
});

test("evidence-only answer prompt cannot receive fixture answer keys and validates citations", () => {
  const question = fixture.questions[0];
  const request = evidenceAnswerRequest(question.query, [
    { file: "php/src/Worker.php", line: 5, quote: "public function run(array $payload): array {" },
  ]);
  assert.ok(!request.prompt.includes(question.answer));
  assert.ok(!request.prompt.includes(question.required[0].text));
  const checked = validateEvidenceAnswer(
    JSON.stringify({
      answer: "A method is declared.",
      claims: [{ text: "The method is run.", citations: [{ file: "php/src/Worker.php", line: 5 }] }],
      uncertainty: [],
    }),
    [{ file: "php/src/Worker.php", line: 5, quote: "public function run(array $payload): array {" }],
  );
  assert.equal(checked.audit_status, "pending_manual_review");
  assert.deepEqual(checked.invalid_citations, []);
});

test("evidence answer flags citations outside selected source lines", () => {
  const checked = validateEvidenceAnswer(
    JSON.stringify({
      answer: "Unsupported claim.",
      claims: [{ text: "Unsupported claim.", citations: [{ file: "missing.php", line: 99 }] }],
      uncertainty: [],
    }),
    [],
  );
  assert.equal(checked.audit_status, "invalid_citations");
  assert.equal(checked.invalid_citations.length, 1);
});

test("evidence answer flags unfinished prose under a valid JSON stop", () => {
  const check = (answer: string, text: string) =>
    validateEvidenceAnswer(
      JSON.stringify({ answer, claims: [{ text, citations: [] }], uncertainty: [] }),
      [],
    );
  assert.equal(check("Reads the `CONFIG` dictionary.", "Returns `CONFIG[").audit_status, "incomplete_text");
  assert.equal(check("It returns the value of key `", "Done.").incomplete_text.length, 1);
  assert.equal(check("Reads CONFIG.", "Returns the mode (see line 7").audit_status, "incomplete_text");
  assert.equal(check("Reads `CONFIG`.", "Returns `CONFIG[\"mode\"]`.").audit_status, "pending_manual_review");
});

test("missingRowValues flags dictionary row values the answer never states", () => {
  const required = [{ text: '    "mode": "idle",' }, { text: '    "attempts": 8,' }, { text: "def read_state():" }];
  const say = (answer: string) => ({ answer, claims: [] });
  assert.deepEqual(missingRowValues(say("Returns the 'mode' key; attempts is 8."), required), ["idle"]);
  assert.deepEqual(missingRowValues(say("Returns idle with attempts 8."), required), []);
});

test("missingShadowWords flags answers that never mention the hiding scope", () => {
  const key = "It reads its own parameter, not the module dictionary.";
  const say = (answer: string) => ({ answer, claims: [] });
  assert.equal(missingShadowWords(say("Returns the mode key."), key), true);
  assert.equal(missingShadowWords(say("Reads its own parameter; module dict not read."), key), false);
  assert.equal(missingShadowWords(say("Returns the mode key."), "Reads the module dict."), false);
});

test("parameterShadowNotes flags a read of the reader's own parameter only", () => {
  const ev = (line: number, quote: string) => ({ file: "a.py", line, quote });
  assert.equal(parameterShadowNotes([ev(1, "def f(*, POLICY):"), ev(2, '    return POLICY["mode"]')]).length, 1);
  assert.equal(parameterShadowNotes([ev(1, "def g(CACHE: dict = None):"), ev(2, '    return CACHE["mode"]')]).length, 1);
  assert.equal(parameterShadowNotes([ev(1, "def f():"), ev(2, '    return POLICY["mode"]')]).length, 0);
  assert.equal(parameterShadowNotes([ev(1, "def f(x):"), ev(2, '    return x["a"]'), ev(3, "x = {")]).length, 0);
});

test("parameterShadowNotes covers **kwargs parameters and nonlocal reads", () => {
  const ev = (line: number, quote: string) => ({ file: "a.py", line, quote });
  assert.equal(parameterShadowNotes([ev(1, "def f(**ROUTE):"), ev(2, '    return ROUTE["mode"]')]).length, 1);
  const notes = parameterShadowNotes([ev(1, "LEVEL = {"), ev(7, "LEVEL = {"), ev(13, "nonlocal LEVEL")]);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /a\.py:7/);
  assert.equal(parameterShadowNotes([ev(13, "        nonlocal LEVEL")]).length, 0);
});
