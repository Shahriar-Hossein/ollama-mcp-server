import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { LanguageFixture } from "./language-eval-fixture.js";
import { evidenceAnswerRequest } from "./language-eval-score.js";
import { validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";
import type { runLanguageEval } from "./run-language-eval.js";
import { parsePythonDictionaryEvalArgs, PYTHON_DICTIONARY_FIXTURE, runPythonDictionaryEval } from "./run-python-dictionary-eval.js";

type Options = Parameters<typeof runLanguageEval>[0];
const fixture = JSON.parse(readFileSync(PYTHON_DICTIONARY_FIXTURE.manifestPath, "utf8")) as LanguageFixture;
const selected = { id: "C1", file: "python/module.py", line: 13, quote: "def module_policy():" };
const scoutResult = { status: "needs_review", evidence: [selected], candidates: [] } as unknown as Awaited<ReturnType<NonNullable<Options["scout"]>>>;
const defaults = { model: "mock:fixture", modelDigest: "mock-digest", ollamaVersion: "mock-version",
  only: ["PD-MODULE"], showSettings: async () => ({ parameters: "num_ctx 4096\nnum_predict 512" }) };
async function temporary(run: (root: string, output: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "python-dictionary-runner-"));
  try { await run(root, join(root, "result.json")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("dictionary wrapper defaults to ignored baseline and rejects pin drift before model setup", async () => {
  assert.equal(parsePythonDictionaryEvalArgs([]).output, resolve("benchmark-data/language-eval/python-dictionary-development/baseline.json"));
  assert.equal(parsePythonDictionaryEvalArgs(["--output", "enhanced.json"]).output, resolve("enhanced.json"));
  assert.throws(() => parsePythonDictionaryEvalArgs(["--variant", "enhanced"]), /Unknown option/);
  await temporary(async (root, output) => {
    let calls = 0;
    const options = { ...defaults, output, showSettings: async () => { calls++; return defaults.showSettings(); } };
    await assert.rejects(runPythonDictionaryEval(options, { ...PYTHON_DICTIONARY_FIXTURE, sha256: "wrong" }), /manifest differs/);
    const sourcePath = join(root, "source");
    cpSync(PYTHON_DICTIONARY_FIXTURE.sourcePath, sourcePath, { recursive: true });
    writeFileSync(join(sourcePath, "python/module.py"), "changed\n");
    await assert.rejects(runPythonDictionaryEval(options, { ...PYTHON_DICTIONARY_FIXTURE, sourcePath }), /Frozen source changed/);
    assert.equal(calls, 0);
  });
});

test("dictionary runner materializes only four source files and excludes golden fields from prompts", async () => {
  await temporary(async (_root, output) => {
    const run = await runPythonDictionaryEval({ ...defaults, output,
      scout: async (params) => {
        validatePythonDictionaryFixture(fixture, params.repository_root);
        assert.deepEqual(execFileSync("git", ["-C", params.repository_root, "ls-files"], { encoding: "utf8" }).trim().split("\n"), Object.keys(fixture.source_hashes).sort());
        assert.equal(params.query, fixture.questions[0].query);
        for (const excluded of [fixture.questions[0].answer, ...fixture.questions[0].forbidden_claims, '"required":', '"answer":', '"forbidden_claims":']) assert.equal(JSON.stringify(params).includes(excluded), false);
        return scoutResult;
      },
      answer: async (query, evidence, _model, onRequest, onGeneration, annotations) => {
        assert.equal(annotations, undefined);
        const request = evidenceAnswerRequest(query, evidence);
        for (const excluded of [fixture.questions[0].answer, ...fixture.questions[0].forbidden_claims, fixture.questions[0].required[1].text.trim(), '"required":', '"forbidden_claims":']) assert.equal(request.prompt.includes(excluded), false);
        onRequest?.(request, { fits: true }, {});
        onGeneration?.({ elapsed_ms: 1, raw_output: "{malformed" });
        throw new Error("Final answer is not a JSON object");
      },
    });
    assert.equal(run.protocol.answer_context_mode, "selected_only");
    for (const file of PYTHON_DICTIONARY_FIXTURE.implementationFiles) assert.ok(run.protocol.implementation_sha256[file], file);
    const cell = run.results[0] as { answer_call: { output: string; error: string }; manual_review: { status: string } };
    assert.equal(cell.answer_call.output, "{malformed");
    assert.match(cell.answer_call.error, /not a JSON object/);
    assert.equal(cell.manual_review.status, "pending");
    const bytes = readFileSync(output, "utf8");
    assert.ok(bytes.includes("{malformed"));
    assert.equal(bytes.includes(fixture.questions[0].answer), false);
  });
});

test("dictionary runner protects frozen output paths", async () => {
  await assert.rejects(runPythonDictionaryEval({ ...defaults, output: PYTHON_DICTIONARY_FIXTURE.manifestPath }), /overwrite/);
  await assert.rejects(runPythonDictionaryEval({ ...defaults, output: join(PYTHON_DICTIONARY_FIXTURE.sourcePath, "python/module.py") }), /overwrite/);
});
