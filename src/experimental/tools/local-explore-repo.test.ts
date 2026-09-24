import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { generate } from "../../ollama-client.js";
import { runLocalExploreRepo, validateModelAnswer, type Candidate } from "./local-explore-repo.js";

test("rejects model evidence that does not quote the supplied line", () => {
  const candidates: Candidate[] = [{ id: "C1", kind: "symbol", file: "src/pricing.ts", lines: [{ line: 3, text: "export function calculateTotal() {" }] }];
  const checked = validateModelAnswer(JSON.stringify({
    selected_ids: ["C1", "C99"],
    evidence: [
      { id: "C1", line: 3, quote: "calculateTotal" },
      { id: "C1", line: 3, quote: "wrongFunction" },
      { id: "C99", line: 3, quote: "calculateTotal" },
    ],
    confidence: "high",
    unresolved: [],
  }), candidates);
  assert.deepEqual(checked.selected_ids, ["C1"]);
  assert.equal(checked.evidence.length, 1);
  assert.equal(checked.rejected_evidence, 2);
});

test("retrieves before calling the model, then retries a bad quote once", async () => {
  const root = mkdtempSync(join(tmpdir(), "local-explore-repo-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/pricing.ts"), "export function calculateTotal(quantity: number) {\n  return quantity * 5;\n}\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "src/pricing.ts"]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    const before = readFileSync(join(root, "src/pricing.ts"), "utf8");
    let calls = 0;
    const stub: typeof generate = async (model, prompt, _system, format, think, options) => {
      calls++;
      assert.equal(model, "qwen3.5:4b");
      assert.equal(format, "json");
      assert.equal(think, false);
      assert.deepEqual(options, { num_ctx: 16_384, num_predict: 2_000 });
      const candidates = JSON.parse(prompt.split("Candidate excerpts: ")[1].split("\n")[0]) as Candidate[];
      const candidate = candidates.find((item) => item.lines.some((line) => line.text.includes("calculateTotal")));
      assert.ok(candidate);
      const line = candidate.lines.find((item) => item.text.includes("calculateTotal"))!;
      return JSON.stringify({ selected_ids: [candidate.id], evidence: [{ id: candidate.id, line: line.line, quote: calls === 1 ? "madeUpSymbol" : "calculateTotal" }], confidence: "medium", unresolved: [] });
    };
    const result = await runLocalExploreRepo({ repository_root: root, query: "Where is calculateTotal defined?" }, stub);
    assert.equal(result.status, "evidence_selected");
    assert.equal(result.model_calls, 2);
    assert.equal(result.evidence[0].file, "src/pricing.ts");
    assert.equal(readFileSync(join(root, "src/pricing.ts"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
