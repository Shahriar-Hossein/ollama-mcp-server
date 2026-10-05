import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import { resolveModelBudget } from "../../ollama-client.js";
import { createRelationshipChecks } from "./local-explore-relationships.js";
import { decomposeQuestion, runLocalExploreRepo } from "./local-explore-repo.js";

function fixture(run: (root: string) => unknown | Promise<unknown>) {
  const root = mkdtempSync(join(tmpdir(), "scout-relationships-"));
  const sources = {
    "page.ts": "import { renderPage as render } from './render.js';\nexport function preparePage() {\n  const output = render();\n  return output;\n}\nexport function archivePage() {\n  return 'archived';\n}\nexport function nestedPage() {\n  function preview() { return render(); }\n  return preview();\n}\n",
    "render.ts": "import { policy as settings } from './policy.js';\nexport function renderPage() {\n  return 'page'.repeat(settings.displayWidth);\n}\nexport function shadowedPage(settings: { displayWidth: number }) {\n  return settings.displayWidth;\n}\n",
    "policy.ts": "export const policy = {\n  displayWidth: 12,\n};\n",
    "demo.ts": "export const demoPolicy = {\n  displayWidth: 99,\n};\nexport function previewPage() {\n  return demoPolicy.displayWidth;\n}\n",
    "worker.ts": "export class Worker {\n  prepare() { return this.provider.render(); }\n}\n",
  };
  for (const [file, source] of Object.entries(sources)) writeFileSync(join(root, file), source);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
  return Promise.resolve().then(async () => { await run(root); }).finally(() => rmSync(root, { recursive: true, force: true }));
}

const cite = (root: string, file: string, line: number) => ({ id: "C1", file, line, quote: readFileSync(join(root, file), "utf8").split("\n")[line - 1].trim() });

test("caller identity follows aliases and local bindings but rejects another or nested caller", () => fixture((root) => {
  const checks = createRelationshipChecks(root, indexRepository(root));
  const evidence = [cite(root, "page.ts", 3)];
  assert.deepEqual(checks.missing(decomposeQuestion("Where does preparePage call renderPage?")[0], evidence), []);
  assert.deepEqual(checks.missing(decomposeQuestion("Where does archivePage call renderPage?")[0], evidence), ["archivePage -> renderPage caller identity"]);
  assert.deepEqual(checks.missing(decomposeQuestion("Where does nestedPage call renderPage?")[0], [cite(root, "page.ts", 9)]), ["nestedPage -> renderPage caller identity"]);
}));

test("configuration requires the imported provider pair and the named use owner", () => fixture((root) => {
  const checks = createRelationshipChecks(root, indexRepository(root));
  const part = decomposeQuestion("How is displayWidth configured and used in renderPage?")[0];
  const good = [cite(root, "policy.ts", 2), cite(root, "render.ts", 3)];
  assert.deepEqual(checks.missing(part, good), []);
  assert.equal(checks.missing(part, [cite(root, "demo.ts", 2), good[1]]).length, 1);
  assert.equal(checks.missing(part, [cite(root, "demo.ts", 2), cite(root, "demo.ts", 5)]).length, 1);
  assert.equal(checks.missing(part, [good[0]]).length, 1);
  const checklist = checks.checklist(part, good.map((item, index) => ({ ...item, ref: `E${index + 1}` })));
  assert.deepEqual(checklist[0].alternative_ref_sets, [["E1", "E2"]]);
}));

test("shadowed import parameters cannot establish configuration provenance", () => fixture((root) => {
  const checks = createRelationshipChecks(root, indexRepository(root));
  const part = decomposeQuestion("How is displayWidth configured and used in shadowedPage?")[0];
  assert.equal(checks.missing(part, [cite(root, "policy.ts", 2), cite(root, "render.ts", 6)]).length, 1);
}));

test("the named provider excludes another correctly paired object", () => fixture((root) => {
  const checks = createRelationshipChecks(root, indexRepository(root));
  const part = decomposeQuestion("How is policy displayWidth configured and used in previewPage?")[0];
  assert.equal(checks.missing(part, [cite(root, "demo.ts", 2), cite(root, "demo.ts", 5)]).length, 1);
}));

test("an imported call alias shadowed by a parameter remains unresolved", () => fixture((root) => {
  writeFileSync(join(root, "page.ts"), "import { renderPage as render } from './render.js';\nexport function preparePage(render: () => string) {\n  return render();\n}\n");
  const checks = createRelationshipChecks(root, indexRepository(root));
  assert.equal(checks.missing(decomposeQuestion("Where does preparePage call renderPage?")[0], [cite(root, "page.ts", 3)]).length, 1);
}));

test("member invocation does not establish a resolved provider implementation", () => fixture((root) => {
  const checks = createRelationshipChecks(root, indexRepository(root));
  const evidence = [cite(root, "worker.ts", 2)];
  assert.deepEqual(checks.missing(decomposeQuestion("Where does Worker.prepare call this.provider.render?")[0], evidence), []);
  const part = decomposeQuestion("Where does Worker.prepare call this.provider.render? Show its implementation.")[0];
  assert.deepEqual(checks.missing(part, evidence), ["this.provider.render statically resolved implementation"]);
}));

test("spread configuration and duplicate keys remain unresolved", () => fixture((root) => {
  for (const source of ["export const policy = {\n  displayWidth: 12,\n  ...overrides,\n};\n", "export const policy = {\n  displayWidth: 12,\n  displayWidth: 99,\n};\n"]) {
    writeFileSync(join(root, "policy.ts"), source);
    const checks = createRelationshipChecks(root, indexRepository(root));
    assert.equal(checks.missing(decomposeQuestion("How is displayWidth configured and used in renderPage?")[0], [cite(root, "policy.ts", 2), cite(root, "render.ts", 3)]).length, 1);
  }
}));

test("the scout rejects a high-confidence exact quote from the wrong caller", () => fixture(async (root) => {
  let calls = 0;
  const result = await runLocalExploreRepo({ repository_root: root, query: "Where does archivePage call renderPage?" }, async (_model, prompt) => {
    calls++;
    assert.match(prompt, /archivePage -> renderPage caller identity/);
    const bundles = JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]);
    const lines = bundles.flatMap((bundle: any) => bundle.sources).flatMap((source: any) => source.lines);
    const ref = lines.find((line: any) => line.text.includes("const output = render()"))!.ref;
    return JSON.stringify({ part_evidence: [{ part_id: "P1", evidence_refs: [ref] }], confidence: "high", unresolved: [], next_action: { ref: "" } });
  }, (model, overrides, _load, reserve) => resolveModelBudget(model, overrides, async () => ({ parameters: "num_ctx 50000\nnum_predict 16000" }), reserve));
  assert.equal(calls, 2);
  assert.equal(result.status, "needs_review");
  assert.ok(result.unresolved.some((item) => item.includes("caller identity")));
  assert.equal(result.evidence[0].quote, "const output = render();");
}));

test("the scout accepts an aliased call and its configuration binding across parts", () => fixture(async (root) => {
  const result = await runLocalExploreRepo({ repository_root: root, query: "Where does preparePage call renderPage, and how is displayWidth configured and used in renderPage?" }, async (_model, prompt) => {
    const bundles = JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]);
    const sources = bundles.flatMap((bundle: any) => bundle.sources);
    const ref = (file: string, text: string) => sources.find((source: any) => source.file === file).lines.find((line: any) => line.text.includes(text)).ref;
    return JSON.stringify({ part_evidence: [
      { part_id: "P1", evidence_refs: [ref("page.ts", "const output = render()")] },
      { part_id: "P2", evidence_refs: [ref("policy.ts", "displayWidth: 12"), ref("render.ts", "repeat(settings.displayWidth)")] },
    ], confidence: "high", unresolved: [], next_action: { ref: "" } });
  }, (model, overrides, _load, reserve) => resolveModelBudget(model, overrides, async () => ({ parameters: "num_ctx 50000\nnum_predict 16000" }), reserve));
  assert.equal(result.status, "evidence_selected");
  assert.equal(result.model_calls, 1);
  assert.equal(result.evidence.length, 3);
}));
