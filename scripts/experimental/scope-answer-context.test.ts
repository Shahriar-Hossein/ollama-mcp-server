import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { evidenceAnswerRequest, validateEvidenceAnswer } from "./language-eval-score.js";
import { annotateEvidenceScopes, checkedEvidenceScopes, scopeAnswerRequest } from "./scope-answer-context.js";

const root = resolve("scripts/experimental/fixtures/scope-eval/source");
const line = (file: string, number: number) => ({ file, line: number,
  quote: readFileSync(resolve(root, file), "utf8").split("\n")[number - 1].trim() });

test("scope annotations dedupe trimmed tuples, lookup once and copy clean properties", () => {
  const selected = { file: "x.py", line: 4, quote: " value ", extra: "private" };
  const header = { file: "x.py", line: 3, quote: " def inner(): ", reason: "enclosing Python function definition ", extra: "private" };
  let calls = 0;
  const result = annotateEvidenceScopes([selected, { ...selected, quote: "value" },
    { ...selected, line: 5 }], (item) => {
    calls++;
    item.quote = "mutated lookup input";
    return [header, { ...header, line: 1, quote: "class Outer:" }];
  });
  assert.equal(calls, 2);
  selected.quote = "mutated"; header.quote = "mutated";
  assert.deepEqual(result[0], { evidence: { file: "x.py", line: 4, quote: "value" },
    enclosing: { file: "x.py", line: 3, quote: "def inner():", reason: "enclosing Python function definition" } });
  assert.equal(result[1].evidence.line, 5);
});

test("scope annotations ignore foreign, invalid and unrelated headers without inferring module scope", () => {
  const selected = { file: "x.py", line: 5, quote: "value" };
  const header = { ...selected, line: 1, quote: "def x():", reason: "enclosing Python function definition" };
  const result = annotateEvidenceScopes([selected], () => [
    { ...header, file: "foreign.py" }, { ...header, line: 0 },
    { ...header, line: 1.5 }, { ...header, line: Number.MAX_SAFE_INTEGER + 1 },
    { ...header, quote: "  " }, { ...header, reason: "scalar sibling" },
  ]);
  assert.equal(result[0].enclosing, null);
  for (const invalid of [{ ...selected, line: 0 }, { ...selected, quote: " " }])
    assert.throws(() => annotateEvidenceScopes([invalid], () => []), /Invalid selected/);
});

test("fresh source adapter attaches nearest function headers instead of dictionary or neighboring initializers", () => {
  const evidence = [line("python/scopes.py", 8), line("python/scopes.py", 12),
    line("python/scopes.py", 16), line("php/scopes.php", 4), line("php/scopes.php", 12),
    line("python/scopes.py", 7), line("python/scopes.py", 2)];
  const annotated = checkedEvidenceScopes(root, evidence);
  assert.deepEqual(annotated.map((item) => item.enclosing?.line ?? null), [7, 7, 15, 2, 10, null, null]);
  assert.throws(() => checkedEvidenceScopes(root, [{ ...evidence[0], quote: "wrong" }]), /quote differs/);
});

test("default request is identical and lexical labels add no allowed citation locations or semantic proof", () => {
  const selected = [line("php/scopes.php", 12), line("php/scopes.php", 2)];
  assert.deepEqual(scopeAnswerRequest("question", selected), evidenceAnswerRequest("question", selected));
  const request = scopeAnswerRequest("question", selected, checkedEvidenceScopes(root, selected));
  assert.ok(request.prompt.includes("Lexical enclosing declaration metadata"));
  assert.ok(request.prompt.includes("not an enclosing callable or class"));
  assert.ok(request.prompt.includes("do not establish binding or claim entailment"));
  assert.ok(request.prompt.includes('"line":10'));
  const raw = (citation: number) => JSON.stringify({ answer: "secondary belongs to primary", claims: [
    { text: "secondary belongs to primary", citations: [{ file: "php/scopes.php", line: citation }] },
  ], uncertainty: [] });
  assert.equal(validateEvidenceAnswer(raw(10), selected).invalid_citations.length, 1);
  // Location acceptance cannot validate the knowingly wrong neighboring-function claim.
  assert.equal(validateEvidenceAnswer(raw(2), selected).audit_status, "pending_manual_review");
});

test("lexical metadata is charged by generation input budgeting and can exceed the available input", async () => {
  const { checkGenerationInputBudget, resolveModelBudget } = await import("../../src/ollama-client.js");
  const selected = [line("python/scopes.py", 12)];
  const baseline = scopeAnswerRequest("q", selected);
  const annotated = scopeAnswerRequest("q", selected, checkedEvidenceScopes(root, selected));
  const budget = await resolveModelBudget("mock:fixture", { num_ctx: 4096, num_predict: 512 },
    async () => ({ parameters: "num_ctx 4096", template: "" }));
  const plain = await checkGenerationInputBudget(budget, baseline);
  const scoped = await checkGenerationInputBudget({ ...budget, input_budget: plain.input_token_bound }, annotated);
  assert.equal(plain.input_bytes.prompt, Buffer.byteLength(baseline.prompt));
  assert.equal(scoped.input_bytes.prompt, Buffer.byteLength(annotated.prompt));
  assert.ok(scoped.input_token_bound > plain.input_token_bound);
  assert.equal(scoped.fits, false);
});
