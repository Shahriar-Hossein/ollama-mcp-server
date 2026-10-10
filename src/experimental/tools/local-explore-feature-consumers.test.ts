import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type Candidate, withFeatureConsumers } from "./local-explore-packing.js";

const query = "Which variable gates the cloud claude worker and where is it registered?";
const text = (line: string, n: number) => ({ line: n, text: line });
const config: Candidate = {
  id: "C1",
  kind: "configuration",
  file: "src/features.ts",
  lines: [
    text('  cloudClaudeWorker: autonomousFlag(environment, "CLOUD_CLAUDE_ENABLED"),', 3),
    text('  unrelatedThing: autonomousFlag(environment, "OTHER"),', 4),
  ],
};

test("flag consumers replace the last text match when the file cap is full", () => {
  const root = mkdtempSync(join(tmpdir(), "scout-consumers-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src/index.ts"),
      "if (features.unrelatedThing) {\n  other();\n}\nif (features.cloudClaudeWorker) {\n  registerCloud(server);\n}\n",
    );
    execFileSync("git", ["init", "-q", root]);
    const fillers: Candidate[] = Array.from({ length: 5 }, (_, i) => ({
      id: `C${i + 2}`,
      kind: "text_match",
      file: `src/filler${i}.ts`,
      lines: [text("worker", 1)],
    }));
    const result = withFeatureConsumers(root, [config, ...fillers], ["src/index.ts"], query);
    const consumer = result.find((item) => item.file === "src/index.ts");
    assert.equal(consumer?.kind, "callsite");
    assert.deepEqual(consumer?.lines.slice(0, 2).map((l) => l.line), [4, 5]);
    assert.equal(new Set(result.map((item) => item.file)).size, 6);
    assert.ok(result.some((item) => item.id === "C1" && item.kind === "configuration"));
    assert.ok(!result.some((item) => item.file === "src/filler4.ts"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags not named in the question add nothing", () => {
  const out = withFeatureConsumers("/nonexistent", [config], ["src/index.ts"], "What is the TTL?");
  assert.deepEqual(out, [config]);
});
