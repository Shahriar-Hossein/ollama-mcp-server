import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

function withArtifact(runTest: (root: string, grade: () => ReturnType<typeof spawnSync>) => void) {
  const root = mkdtempSync(join(tmpdir(), "h-grader-"));
  try {
    const source = "export const setting = 12;\nexport const unrelated = 99;\n";
    writeFileSync(join(root, "source.ts"), source);
    const fixture = {
      version: 3,
      files: { "source.ts": createHash("sha256").update(source).digest("hex") },
      questions: [
        {
          id: "positive",
          kind: "positive",
          required: [{ file: "source.ts", line: 1, text: "export const setting = 12;" }],
        },
        {
          id: "negative",
          kind: "negative",
          required: [],
          forbidden: [{ file: "source.ts", line: 2, text: "export const unrelated = 99;" }],
        },
      ],
    };
    const fixtureText = JSON.stringify(fixture);
    writeFileSync(join(root, "fixture.json"), fixtureText);
    const result = (line: number) => ({
      status: "needs_review",
      unresolved: ["caller identity"],
      candidates: [
        {
          file: "source.ts",
          lines: source
            .trimEnd()
            .split("\n")
            .map((text, index) => ({ line: index + 1, text })),
        },
      ],
      evidence: [{ file: "source.ts", line, quote: source.split("\n")[line - 1] }],
    });
    writeFileSync(
      join(root, "run.json"),
      JSON.stringify({
        complete: true,
        protocol: { fixture_sha256: createHash("sha256").update(fixtureText).digest("hex") },
        results: [
          {
            questions: [
              { id: "positive", result: result(1), calls: [], elapsed_ms: 1 },
              {
                id: "negative",
                result: result(2),
                calls: [{ metrics: { done: true, done_reason: "stop" } }],
                elapsed_ms: 1,
              },
            ],
          },
        ],
      }),
    );
    const grade = () =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("scripts/experimental/grade-h-heldout.ts"),
          join(root, "fixture.json"),
          join(root, "run.json"),
          root,
          join(root, "score.json"),
        ],
        { encoding: "utf8" },
      );
    runTest(root, grade);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("grading separates line coverage, support, distractors, abstention and generation", () =>
  withArtifact((root, grade) => {
    const process = grade();
    assert.equal(process.status, 0, String(process.stderr));
    const [positive, negative] = JSON.parse(readFileSync(join(root, "score.json"), "utf8")).scores;
    assert.equal(positive.complete_evidence, true);
    assert.equal(positive.positive_supported, false);
    assert.equal(positive.generation_completed, false);
    assert.equal(negative.appropriate_abstention, true);
    assert.equal(negative.avoids_frozen_distractors, false);
    assert.equal(negative.frozen_distractor_citations.length, 1);
    assert.equal(negative.generation_completed, true);
  }));

test("grading refuses changed frozen source before emitting scores", () =>
  withArtifact((root, grade) => {
    writeFileSync(join(root, "source.ts"), "export const setting = 999;\n");
    const process = grade();
    assert.notEqual(process.status, 0);
    assert.match(process.stderr as string, /Frozen source changed/);
  }));
