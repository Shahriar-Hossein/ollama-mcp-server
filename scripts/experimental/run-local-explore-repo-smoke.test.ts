import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("runner scores source lines and retains raw answers when a later rubric audit fails", () => {
  const root = mkdtempSync(join(tmpdir(), "scout-runner-"));
  const source =
    "import { ConfigModule } from '@nestjs/config';\nexport const setup = ConfigModule.forRoot({\n  isGlobal: true,\n});\n";
  try {
    writeFileSync(join(root, "app.ts"), source);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "app.ts"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ]);
    const preload = join(root, "mock.mjs");
    writeFileSync(
      preload,
      `
      import axios from ${JSON.stringify(resolve("node_modules/axios/index.js"))};
      axios.post = async (url, request) => {
        if (url.endsWith('/api/show')) return { data: { parameters: 'num_ctx 24000\\nnum_predict 2048' } };
        const refs = [...new Set(request.prompt.match(/\\bE\\d+\\b/g) ?? [])].slice(0, 16);
        return { data: { response: JSON.stringify({
          part_evidence: [{ part_id: 'P1', evidence_refs: refs }],
          confidence: 'high', unresolved: [], next_action: { ref: '' }
        }), done: true, done_reason: 'stop' } };
      };
    `,
    );
    const fixturePath = join(root, "fixture.json");
    const outputPath = join(root, "result.json");
    for (const fail of [false, true]) {
      writeFileSync(
        fixturePath,
        JSON.stringify({
          version: 1,
          files: { "app.ts": createHash("sha256").update(source).digest("hex") },
          questions: [
            {
              id: "initialization",
              query: "Where is application configuration initialized?",
              required: [
                { file: "app.ts", line: 3, text: fail ? "incorrect rubric" : "isGlobal: true," },
              ],
            },
          ],
        }),
      );
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          preload,
          "scripts/experimental/run-local-explore-repo-smoke.ts",
          "--repository-root",
          root,
          "--fixture",
          fixturePath,
          outputPath,
          "fixture:runner",
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(run.status, fail ? 1 : 0, run.stderr);
      const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
      const question = artifact.results[0].questions[0];
      assert.ok(question.calls[0].output);
      assert.ok(question.result.evidence.length > 0);
      assert.equal(question.audit.status, fail ? "failed" : "passed");
      assert.equal(artifact.complete, !fail);
      if (fail) assert.match(question.audit.error, /Rubric differs from source/);
      else
        assert.deepEqual(question.score, {
          required: 1,
          supplied: 1,
          selected: 1,
          parent_completion: "pending",
        });
    }
    assert.equal(readFileSync(join(root, "app.ts"), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
