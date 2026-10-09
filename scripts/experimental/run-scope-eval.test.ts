import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateScopeFixture, type ScopeFixture } from "./scope-eval-fixture.js";
import { evidenceAnswerRequest } from "./language-eval-score.js";
import { runLanguageEval } from "./run-language-eval.js";
import { parseScopeEvalArgs, runScopeEval, SCOPE_FIXTURE } from "./run-scope-eval.js";

type Options = Parameters<typeof runLanguageEval>[0];
const fixture = JSON.parse(readFileSync(SCOPE_FIXTURE.manifestPath, "utf8")) as ScopeFixture;
const settings = async () => ({ parameters: "num_ctx 4096\nnum_predict 512" });
const mockOptions = {
  model: "mock:fixture",
  modelDigest: "mock-digest",
  ollamaVersion: "mock-version",
  showSettings: settings,
  only: ["PY-S1"],
};
const selected = { id: "C1", file: "python/scopes.py", line: 7, quote: "def execute():" };
const scoutResult = {
  status: "needs_review", evidence: [selected], candidates: [],
} as unknown as Awaited<ReturnType<NonNullable<Options["scout"]>>>;
const generation = {
  text: "{}",
  completion: {
    status: "complete", done: true, done_reason: "stop", prompt_eval_count: 1,
    eval_count: 1, total_duration: 1, load_duration: 0, prompt_eval_duration: 0, eval_duration: 1,
  },
} as Awaited<ReturnType<NonNullable<Options["generate"]>>>;

async function withOutput(run: (root: string, output: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "scope-runner-"));
  try { await run(root, join(root, "result.json")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("scope wrapper keeps an ignored default and rejects pin drift before model setup", async () => {
  assert.equal(parseScopeEvalArgs([]).output,
    resolve("benchmark-data/language-eval/scope-development/baseline.json"));
  await withOutput(async (_root, output) => {
    let calls = 0;
    await assert.rejects(runLanguageEval({ ...mockOptions, output,
      fixture: { ...SCOPE_FIXTURE, sha256: "wrong" },
      showSettings: async () => { calls++; return settings(); },
    }), /manifest differs/);
    assert.equal(calls, 0);
  });
});

test("scope target contains only two Git-tracked sources and answer keys stay out of prompts", async () => {
  await withOutput(async (_root, output) => {
    const run = await runScopeEval({ ...mockOptions, output,
      scout: async (params) => {
        validateScopeFixture(fixture, params.repository_root);
        const { execFileSync } = await import("node:child_process");
        assert.deepEqual(execFileSync("git", ["-C", params.repository_root, "ls-files"],
          { encoding: "utf8" }).trim().split("\n"), ["php/scopes.php", "python/scopes.py"]);
        return scoutResult;
      },
      answer: async (query, evidence, _model, onRequest, onGeneration) => {
        const request = evidenceAnswerRequest(query, evidence);
        assert.equal(request.prompt.includes(fixture.questions[0].answer), false);
        assert.equal(request.prompt.includes(fixture.questions[0].required[2].text.trim()), false);
        onRequest?.(request, { fits: true }, {});
        onGeneration?.({ elapsed_ms: 1, raw_output: "{malformed" });
        throw new Error("Final answer is not a JSON object");
      },
    });
    const cell = run.results[0] as { answer_call: { output: string; error: string } };
    assert.equal(cell.answer_call.output, "{malformed");
    assert.match(cell.answer_call.error, /not a JSON object/);
    const artifact = readFileSync(output, "utf8");
    assert.ok(artifact.includes("{malformed"));
    assert.equal(artifact.includes(fixture.questions[0].answer), false);
    assert.ok(run.protocol.implementation_sha256["scripts/experimental/run-scope-eval.ts"]);
    assert.ok(run.protocol.fixture_freeze_commit.startsWith("d340709"));
  });
});

for (const changedLocation of ["source", "target", "manifest"] as const) {
test(`${changedLocation} mutation between scout attempts blocks the second generation`, async () => {
  await withOutput(async (root, output) => {
    const sourcePath = join(root, "source");
    cpSync(SCOPE_FIXTURE.sourcePath, sourcePath, { recursive: true });
    const manifestPath = join(root, "manifest.json");
    cpSync(SCOPE_FIXTURE.manifestPath, manifestPath);
    let calls = 0;
    const error = changedLocation === "manifest" ? /Frozen answer manifest changed/ : /Frozen source changed/;
    await assert.rejects(runLanguageEval({ ...mockOptions, output,
      fixture: { ...SCOPE_FIXTURE, sourcePath, manifestPath },
      generate: async () => { calls++; return generation; },
      scout: async (params, generate) => {
        assert.ok(generate);
        await generate("mock:fixture", "prompt", "system", undefined, false, {});
        const changedPath = changedLocation === "manifest" ? manifestPath :
          join(changedLocation === "source" ? sourcePath : params.repository_root, "python/scopes.py");
        writeFileSync(changedPath, "changed\n");
        await generate("mock:fixture", "prompt", "system", undefined, false, {});
        return scoutResult;
      },
    }), error);
    assert.equal(calls, 1);
    const artifact = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(artifact.complete, false);
    assert.equal(artifact.results[0].scout_calls.length, 1);
    assert.match(artifact.results[0].error, error);
  });
});
}

test("answer setup mutation blocks generation and frozen paths cannot be outputs", async () => {
  await assert.rejects(runScopeEval({ ...mockOptions, output: SCOPE_FIXTURE.manifestPath }), /overwrite/);
  await assert.rejects(runScopeEval({ ...mockOptions,
    output: join(SCOPE_FIXTURE.sourcePath, "python/scopes.py") }), /overwrite/);
  await withOutput(async (root, output) => {
    const sourcePath = join(root, "source");
    cpSync(SCOPE_FIXTURE.sourcePath, sourcePath, { recursive: true });
    let calls = 0;
    await assert.rejects(runLanguageEval({ ...mockOptions, output,
      fixture: { ...SCOPE_FIXTURE, sourcePath },
      scout: async () => scoutResult,
      answer: async (query, evidence, _model, onRequest) => {
        writeFileSync(join(sourcePath, "python/scopes.py"), "changed\n");
        onRequest?.(evidenceAnswerRequest(query, evidence), {}, {});
        calls++;
        throw new Error("must not generate");
      },
    }), /Frozen source changed/);
    assert.equal(calls, 0);
    const artifact = JSON.parse(readFileSync(output, "utf8"));
    assert.match(artifact.results[0].answer_call.error, /Frozen source changed/);
  });
});

test("scope context opt-in persists lexical labels and includes them in the answer request", async () => {
  const parsed = parseScopeEvalArgs(["--scope-context"]);
  assert.equal(parsed.answerContextMode, "lexical_scopes");
  assert.ok(parsed.output.endsWith("/scope-context.json"));
  assert.equal(parseScopeEvalArgs([]).answerContextMode, "selected_only");
  await withOutput(async (_root, output) => {
    const { scopeAnswerRequest } = await import("./scope-answer-context.js");
    const selectedReturn = { id: "C1", file: "python/scopes.py", line: 12, quote: 'return DEFAULTS["mode"]' };
    const run = await runScopeEval({ ...mockOptions, output, answerContextMode: "lexical_scopes",
      scout: async () => ({ ...scoutResult, evidence: [selectedReturn] }) as unknown as typeof scoutResult,
      answer: async (query, evidence, _model, onRequest, onGeneration, annotations) => {
        assert.equal(annotations?.[0].enclosing?.line, 7);
        const request = scopeAnswerRequest(query, evidence, annotations);
        assert.ok(request.prompt.includes('"quote":"def execute():"'));
        assert.equal(request.prompt.includes(fixture.questions[0].answer), false);
        onRequest?.(request, { fits: true, prompt_bytes: Buffer.byteLength(request.prompt) }, {});
        onGeneration?.({ elapsed_ms: 1, raw_output: "{malformed" });
        throw new Error("mock malformed output");
      },
    });
    assert.equal(run.protocol.answer_context_mode, "lexical_scopes");
    const cell = run.results[0] as { answer_context: Array<{ enclosing: { line: number } }>;
      answer_call: { prompt: string; input: { prompt_bytes: number } } };
    assert.equal(cell.answer_context[0].enclosing.line, 7);
    assert.equal(cell.answer_call.input.prompt_bytes, Buffer.byteLength(cell.answer_call.prompt));
  });
});
