import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateCitationFixture, type CitationFixture } from "./citation-eval-fixture.js";
import { evidenceAnswerRequest, validateEvidenceAnswer } from "./language-eval-score.js";
import { CITATION_FIXTURE, checkCitationOutput, parseCitationEvalArgs, runCitationEval, writeCitationOwnershipSidecar } from "./run-citation-eval.js";
import type { runLanguageEval, AnswerFromEvidenceResult } from "./run-language-eval.js";
type Options = Parameters<typeof runLanguageEval>[0];
const fixture = JSON.parse(readFileSync(CITATION_FIXTURE.manifestPath, "utf8")) as CitationFixture;
const selected = [1, 2, 3, 7, 8, 9, 10, 12, 15, 16].map(line => {
  const text = readFileSync(join(CITATION_FIXTURE.sourcePath, "python/scopes.py"), "utf8").split("\n")[line - 1];
  return { id: `C${line}`, file: "python/scopes.py", line, quote: text.trim() };
});
const scoutResult = { status: "needs_review", evidence: selected, candidates: [] } as unknown as Awaited<ReturnType<NonNullable<Options["scout"]>>>;
const defaults = { model: "mock:fixture", modelDigest: "mock-digest", ollamaVersion: "mock-version",
  showSettings: async () => ({ parameters: "num_ctx 4096\nnum_predict 512" }), only: ["PY-BACKGROUND"], scout: async () => scoutResult };
async function withOutput(run: (root: string, output: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "citation-runner-"));
  try { await run(root, join(root, "result.json")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const answer = (raw: string): NonNullable<Options["answer"]> => async (query, evidence, _model, onRequest, onGeneration, annotations) => {
  assert.equal(annotations, undefined);
  const request = evidenceAnswerRequest(query, evidence);
  onRequest?.(request, { fits: true }, {});
  onGeneration?.({ elapsed_ms: 1, raw_output: raw });
  return { request, input: { fits: true }, elapsed_ms: 1, raw_output: raw,
    completion: {}, checked: validateEvidenceAnswer(raw, evidence) } as unknown as AnswerFromEvidenceResult;
};
const rawAnswer = (claims: unknown[]) => JSON.stringify({ answer: "mock answer", claims, uncertainty: [] });
const citation = (line: number) => ({ file: "python/scopes.py", line });

test("citation default is ignored baseline and frozen drift fails before model setup", async () => {
  assert.equal(parseCitationEvalArgs([]).output, resolve("benchmark-data/language-eval/citation-development/model-run.json"));
  await withOutput(async (_root, output) => {
    let calls = 0;
    await assert.rejects(runCitationEval({ ...defaults, output, showSettings: async () => { calls++; return defaults.showSettings(); } },
      { ...CITATION_FIXTURE, sha256: "wrong" }), /frozen pin/);
    assert.equal(calls, 0);
  });
});
test("materialized Git target is source-only and baseline prompts exclude keys and targets", async () => {
  await withOutput(async (_root, output) => {
    const run = await runCitationEval({ ...defaults, output,
      scout: async params => {
        validateCitationFixture(fixture, params.repository_root);
        assert.deepEqual(execFileSync("git", ["-C", params.repository_root, "ls-files"], { encoding: "utf8" }).trim().split("\n"), ["python/scopes.py"]);
        assert.equal(params.query, fixture.questions[1].query);
        return scoutResult;
      },
      answer: async (...args) => {
        const prompt = evidenceAnswerRequest(args[0], args[1]).prompt;
        for (const excluded of [fixture.rubric, fixture.questions[1].answer, ...fixture.cases.map(c => c.claim), '"target":', '"claim_truth":', '"required":', '"forbidden_claims":'])
          assert.equal(prompt.includes(excluded), false);
        return answer(rawAnswer([{ text: "module observation", citations: [citation(2), citation(16)] }]))(...args);
      },
    });
    assert.equal(run.protocol.answer_context_mode, "selected_only");
    assert.equal(run.ownership.model_questions[0].manual_review.status, "pending");
    assert.equal((run.results[0] as { manual_review: { status: string } }).manual_review.status, "pending");
  });
});
test("posthoc claim mapping distinguishes foreign, local, module and missing citations without truth verdict", async () => {
  await withOutput(async (_root, output) => {
    const claims = [
      { text: "foreign", citations: [citation(9)] },
      { text: "same target", citations: [citation(16)] },
      { text: "module", citations: [citation(2)] },
      { text: "unsupported setting", citations: [] },
      { text: "unselected", citations: [citation(4)] },
      { text: "bad", citations: [{ file: "python/scopes.py", line: "bad" }] },
    ];
    const run = await runCitationEval({ ...defaults, output, answer: answer(rawAnswer(claims)) });
    const mapped = run.ownership.model_questions[0].claims;
    assert.deepEqual(mapped[0].review?.foreign_owner_citations, [citation(9)]);
    assert.deepEqual(mapped[1].review?.foreign_owner_citations, []);
    assert.deepEqual(mapped[2].review?.unresolved_citations, [citation(2)]);
    assert.deepEqual(mapped[3].review?.reasons, ["no_citations"]);
    assert.equal(mapped[4].status, "not_checked"); assert.equal(mapped[5].status, "not_checked");
    for (const claim of mapped.slice(0, 4)) assert.equal(claim.review?.status, "needs_review");
    assert.equal(run.ownership.static_cases.length, 6);
    const contrast = run.ownership.static_cases.find(c => c.id === "CLEAN-CONTRAST")!;
    assert.equal(contrast.claim_truth, "correct"); assert.ok(contrast.review.foreign_owner_citations.length);
    const bytes = readFileSync(output);
    assert.equal(run.ownership.raw_artifact_sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(run.ownership.source_hashes, fixture.source_hashes);
    assert.ok(run.ownership.implementation_sha256["scripts/experimental/run-citation-eval.ts"]);
    writeCitationOwnershipSidecar(output);
    assert.deepEqual(readFileSync(output), bytes);
  });
});
test("malformed and absent answers remain raw and not_checked with no-citation cue", async () => {
  await withOutput(async (_root, output) => {
    const run = await runCitationEval({ ...defaults, output, answer: answer("{malformed") });
    assert.ok(readFileSync(output, "utf8").includes("{malformed"));
    assert.equal(run.ownership.model_questions[0].ownership_status, "not_checked");
    assert.deepEqual(run.ownership.model_questions[0].no_citation_review.reasons, ["no_citations"]);
  });
  await withOutput(async (_root, output) => {
    const run = await runCitationEval({ ...defaults, output,
      scout: async () => ({ ...scoutResult, evidence: [] }) as typeof scoutResult });
    assert.equal(run.ownership.model_questions[0].ownership_status, "not_checked");
    assert.match(run.ownership.model_questions[0].error!, /No structured answer/);
  });
});
test("sidecar rechecks source/manifest pins and protects raw, sibling and symlink outputs", async () => {
  await withOutput(async (root, output) => {
    const sourcePath = join(root, "source"); cpSync(CITATION_FIXTURE.sourcePath, sourcePath, { recursive: true });
    const manifestPath = join(root, "fixture.json"); cpSync(CITATION_FIXTURE.manifestPath, manifestPath);
    const descriptor = { ...CITATION_FIXTURE, sourcePath, manifestPath };
    await runCitationEval({ ...defaults, output, answer: answer(rawAnswer([])) }, descriptor);
    writeFileSync(join(sourcePath, "python/scopes.py"), "changed\n");
    assert.throws(() => writeCitationOwnershipSidecar(output, descriptor), /Frozen source changed/);
    cpSync(CITATION_FIXTURE.sourcePath, sourcePath, { recursive: true });
    writeFileSync(manifestPath, "{}\n");
    assert.throws(() => writeCitationOwnershipSidecar(output, descriptor), /frozen pin/);
    assert.throws(() => checkCitationOutput(CITATION_FIXTURE.manifestPath), /overwrite/);
    assert.throws(() => checkCitationOutput(join(CITATION_FIXTURE.sourcePath, "result.json")), /overwrite/);
    const alias = join(root, "alias"); symlinkSync(CITATION_FIXTURE.sourcePath, alias);
    assert.throws(() => checkCitationOutput(join(alias, "result.json")), /overwrite/);
    const dangling = join(root, "dangling.json");
    symlinkSync(join(CITATION_FIXTURE.sourcePath, "new.py"), dangling);
    assert.throws(() => checkCitationOutput(dangling), /dangling symlink/);
    const siblingOutput = join(root, "sibling");
    const sidecarManifest = `${siblingOutput}.owners.json`;
    cpSync(CITATION_FIXTURE.manifestPath, sidecarManifest);
    assert.throws(() => checkCitationOutput(siblingOutput, { ...CITATION_FIXTURE, manifestPath: sidecarManifest }), /overwrite/);
  });
});
