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
    "page.ts":
      "import { renderPage as render } from './render.js';\nexport function preparePage() {\n  const output = render();\n  return output;\n}\nexport function archivePage() {\n  return 'archived';\n}\nexport function nestedPage() {\n  function preview() { return render(); }\n  return preview();\n}\n",
    "render.ts":
      "import { policy as settings } from './policy.js';\nexport function renderPage() {\n  return 'page'.repeat(settings.displayWidth);\n}\nexport function shadowedPage(settings: { displayWidth: number }) {\n  return settings.displayWidth;\n}\n",
    "policy.ts": "export const policy = {\n  displayWidth: 12,\n};\n",
    "demo.ts":
      "export const demoPolicy = {\n  displayWidth: 99,\n};\nexport function previewPage() {\n  return demoPolicy.displayWidth;\n}\n",
    "worker.ts": "export class Worker {\n  prepare() { return this.provider.render(); }\n}\n",
  };
  for (const [file, source] of Object.entries(sources)) writeFileSync(join(root, file), source);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "fixture",
  ]);
  return Promise.resolve()
    .then(async () => {
      await run(root);
    })
    .finally(() => rmSync(root, { recursive: true, force: true }));
}

const cite = (root: string, file: string, line: number) => ({
  id: "C1",
  file,
  line,
  quote: readFileSync(join(root, file), "utf8").split("\n")[line - 1].trim(),
});

const flagSource = [
  "function readSwitch(environment, name) {",
  "  const value = environment[name]?.trim();",
  "  if (value === undefined || value === 'off') {",
  "    return false;",
  "  }",
  "  if (value === 'on') return true;",
  "  throw new Error('Expected on or off');",
  "}",
  "export function switches(environment) {",
  "  return { runOnBoot: readSwitch(environment, 'BACKGROUND_JOB_ENABLED') };",
  "}",
  "function exampleSwitch() {",
  "  const value = 'on';",
  "  if (value === undefined || value === 'off') return false;",
  "  if (value === 'on') return true;",
  "  throw new Error('Expected on or off');",
  "}",
].join("\n");
const flagQuestion =
  "How is the environment variable controlling runOnBoot resolved, including its default and invalid-input rejection?";

test("flag resolver shortlist requires the mapped helper's input, guards and outcomes", () =>
  fixture((root) => {
    writeFileSync(join(root, "flags.ts"), flagSource);
    execFileSync("git", ["-C", root, "add", "flags.ts"]);
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion(flagQuestion)[0];
    const good = [1, 2, 3, 4, 6, 7, 10].map((line) => cite(root, "flags.ts", line));
    assert.deepEqual(checks.missing(part, good), []);
    const mappingOnly = [cite(root, "flags.ts", 10)];
    assert.ok(checks.missing(part, mappingOnly).length >= 4);
    assert.ok(
      checks.missing(
        part,
        good.filter((item) => item.line !== 3),
      ).length > 0,
    );
    assert.ok(
      checks.missing(part, [
        good[0],
        good[6],
        ...[13, 14, 15, 16].map((line) => cite(root, "flags.ts", line)),
      ]).length > 0,
    );
    const shortlist = checks.checklist(
      part,
      good.map((item) => ({ ...item, ref: `E${item.line}` })),
    );
    assert.ok(
      shortlist.some((check) =>
        check.alternative_ref_sets.some((refs) => refs.includes("E3") && refs.includes("E4")),
      ),
    );
    assert.ok(
      shortlist.some((check) => check.alternative_ref_sets.some((refs) => refs.includes("E7"))),
    );
  }));

test("a shadowed flag resolver and a nonexistent requested flag remain unresolved", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "flags.ts"),
      flagSource.replace("switches(environment)", "switches(environment, readSwitch)"),
    );
    execFileSync("git", ["-C", root, "add", "flags.ts"]);
    const checks = createRelationshipChecks(root, indexRepository(root));
    const evidence = [1, 2, 3, 4, 6, 7, 10].map((line) => cite(root, "flags.ts", line));
    for (const query of [
      flagQuestion,
      "How is the MISSING_FEATURE_ENABLED flag resolved by default?",
    ]) {
      const part = decomposeQuestion(query)[0];
      assert.ok(checks.missing(part, evidence).length > 0);
      assert.ok(
        checks
          .checklist(
            part,
            evidence.map((item) => ({ ...item, ref: `E${item.line}` })),
          )
          .some((check) => !check.alternative_ref_sets.length),
      );
    }
  }));

test("aliased arrow resolvers keep else guards and exclude nested callable outcomes", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "parse.ts"),
      [
        "export const parseSwitch = (environment, name) => {",
        "  const value = environment[name];",
        "  function example() { throw new Error('nested outcome'); }",
        "  const unrelated = () => { return 'nested value'; };",
        "  if (value === 'on') {",
        "    return true;",
        "  } else {",
        "    return false;",
        "  }",
        "};",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "flags.ts"),
      "import { parseSwitch as readSwitch } from './parse.js';\nexport const switches = { runOnBoot: readSwitch({}, 'BACKGROUND_JOB_ENABLED') };\n",
    );
    execFileSync("git", ["-C", root, "add", "parse.ts", "flags.ts"]);
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion(flagQuestion)[0];
    const good = [
      cite(root, "flags.ts", 2),
      ...[1, 2, 5, 6, 7, 8].map((line) => cite(root, "parse.ts", line)),
    ];
    assert.deepEqual(checks.missing(part, good), []);
    assert.ok(
      checks.missing(
        part,
        good.filter((item) => item.file !== "parse.ts" || item.line !== 7),
      ).length > 0,
    );
    const all = [...good, ...[3, 4].map((line) => cite(root, "parse.ts", line))];
    const shortlist = checks.checklist(
      part,
      all.map((item) => ({ ...item, ref: `${item.file}:${item.line}` })),
    );
    assert.ok(
      shortlist.every((check) =>
        check.alternative_ref_sets.every(
          (refs) => !refs.includes("parse.ts:3") && !refs.includes("parse.ts:4"),
        ),
      ),
    );
    const missing = decomposeQuestion(
      "How are BACKGROUND_JOB_ENABLED and MISSING_FEATURE_ENABLED flags resolved by default?",
    )[0];
    assert.ok(
      checks.missing(missing, good).some((name) => name.includes("MISSING_FEATURE_ENABLED")),
    );
  }));

test("the scout exposes resolver shortlists and keeps complete flag semantics under review", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "flags.ts"), flagSource);
    execFileSync("git", ["-C", root, "add", "flags.ts"]);
    for (const mappingOnly of [true, false]) {
      let calls = 0;
      const result = await runLocalExploreRepo(
        { repository_root: root, query: flagQuestion },
        async (_model, prompt) => {
          calls++;
          const parts = JSON.parse(
            prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
          );
          const groups = parts[0].relationships as {
            requirement: string;
            alternative_ref_sets: string[][];
          }[];
          assert.ok(groups.some((group) => group.requirement.includes("resolver outcome")));
          const bundles = JSON.parse(
            prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0],
          );
          const lines = bundles.flatMap(
            (bundle: { sources: { lines: { ref: string; text: string }[] }[] }) =>
              bundle.sources.flatMap((source) => source.lines),
          );
          const refs = mappingOnly
            ? lines
                .filter((line: { text: string }) => line.text.includes("runOnBoot: readSwitch"))
                .map((line: { ref: string }) => line.ref)
            : [...new Set(groups.flatMap((group) => group.alternative_ref_sets[0] ?? []))];
          return JSON.stringify({
            part_evidence: [{ part_id: "P1", evidence_refs: refs }],
            confidence: "high",
            unresolved: [],
            next_action: { ref: "" },
          });
        },
        (model, overrides) =>
          resolveModelBudget(model, overrides, async () => ({
            parameters: "num_ctx 50000\nnum_predict 2048",
          })),
      );
      assert.equal(calls, 2);
      assert.equal(result.status, "needs_review");
      assert.ok(result.unresolved.some((item) => item.includes("semantic completeness")));
      assert.equal(
        result.unresolved.some((item) => item.includes("resolver outcome")),
        mappingOnly,
      );
      if (!mappingOnly)
        assert.ok(result.evidence.some((item) => item.quote.includes("Expected on or off")));
    }
  }));

test("caller identity follows aliases and local bindings but rejects another or nested caller", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const evidence = [cite(root, "page.ts", 3)];
    assert.deepEqual(
      checks.missing(decomposeQuestion("Where does preparePage call renderPage?")[0], evidence),
      [],
    );
    assert.deepEqual(
      checks.missing(decomposeQuestion("Where does archivePage call renderPage?")[0], evidence),
      ["archivePage -> renderPage caller identity"],
    );
    assert.deepEqual(
      checks.missing(decomposeQuestion("Where does nestedPage call renderPage?")[0], [
        cite(root, "page.ts", 9),
      ]),
      ["nestedPage -> renderPage caller identity"],
    );
  }));

test("configuration requires the imported provider pair and the named use owner", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion("How is displayWidth configured and used in renderPage?")[0];
    const good = [cite(root, "policy.ts", 2), cite(root, "render.ts", 3)];
    assert.deepEqual(checks.missing(part, good), []);
    assert.equal(checks.missing(part, [cite(root, "demo.ts", 2), good[1]]).length, 1);
    assert.equal(
      checks.missing(part, [cite(root, "demo.ts", 2), cite(root, "demo.ts", 5)]).length,
      1,
    );
    assert.equal(checks.missing(part, [good[0]]).length, 1);
    const checklist = checks.checklist(
      part,
      good.map((item, index) => ({ ...item, ref: `E${index + 1}` })),
    );
    assert.deepEqual(checklist[0].alternative_ref_sets, [["E1", "E2"]]);
  }));

test("shadowed import parameters cannot establish configuration provenance", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion("How is displayWidth configured and used in shadowedPage?")[0];
    assert.equal(
      checks.missing(part, [cite(root, "policy.ts", 2), cite(root, "render.ts", 6)]).length,
      1,
    );
  }));

test("the named provider excludes another correctly paired object", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion(
      "How is policy displayWidth configured and used in previewPage?",
    )[0];
    assert.equal(
      checks.missing(part, [cite(root, "demo.ts", 2), cite(root, "demo.ts", 5)]).length,
      1,
    );
  }));

test("an imported call alias shadowed by a parameter remains unresolved", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "page.ts"),
      "import { renderPage as render } from './render.js';\nexport function preparePage(render: () => string) {\n  return render();\n}\n",
    );
    const checks = createRelationshipChecks(root, indexRepository(root));
    assert.equal(
      checks.missing(decomposeQuestion("Where does preparePage call renderPage?")[0], [
        cite(root, "page.ts", 3),
      ]).length,
      1,
    );
  }));

test("member invocation does not establish a resolved provider implementation", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const evidence = [cite(root, "worker.ts", 2)];
    assert.deepEqual(
      checks.missing(
        decomposeQuestion("Where does Worker.prepare call this.provider.render?")[0],
        evidence,
      ),
      [],
    );
    const part = decomposeQuestion(
      "Where does Worker.prepare call this.provider.render? Show its implementation.",
    )[0];
    assert.deepEqual(checks.missing(part, evidence), [
      "this.provider.render statically resolved implementation",
    ]);
  }));

test("spread configuration and duplicate keys remain unresolved", () =>
  fixture((root) => {
    for (const source of [
      "export const policy = {\n  displayWidth: 12,\n  ...overrides,\n};\n",
      "export const policy = {\n  displayWidth: 12,\n  displayWidth: 99,\n};\n",
    ]) {
      writeFileSync(join(root, "policy.ts"), source);
      const checks = createRelationshipChecks(root, indexRepository(root));
      assert.equal(
        checks.missing(
          decomposeQuestion("How is displayWidth configured and used in renderPage?")[0],
          [cite(root, "policy.ts", 2), cite(root, "render.ts", 3)],
        ).length,
        1,
      );
    }
  }));

test("the scout rejects a high-confidence exact quote from the wrong caller", () =>
  fixture(async (root) => {
    let calls = 0;
    const result = await runLocalExploreRepo(
      { repository_root: root, query: "Where does archivePage call renderPage?" },
      async (_model, prompt) => {
        calls++;
        assert.match(prompt, /archivePage -> renderPage caller identity/);
        const bundles = JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]);
        const lines = bundles
          .flatMap((bundle: any) => bundle.sources)
          .flatMap((source: any) => source.lines);
        const ref = lines.find((line: any) => line.text.includes("const output = render()"))!.ref;
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: [ref] }],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
      (model, overrides, _load, reserve) =>
        resolveModelBudget(
          model,
          overrides,
          async () => ({ parameters: "num_ctx 50000\nnum_predict 16000" }),
          reserve,
        ),
    );
    assert.equal(calls, 2);
    assert.equal(result.status, "needs_review");
    assert.ok(result.unresolved.some((item) => item.includes("caller identity")));
    assert.equal(result.evidence[0].quote, "const output = render();");
  }));

test("the scout accepts an aliased call and its configuration binding across parts", () =>
  fixture(async (root) => {
    const result = await runLocalExploreRepo(
      {
        repository_root: root,
        query:
          "Where does preparePage call renderPage, and how is displayWidth configured and used in renderPage?",
      },
      async (_model, prompt) => {
        const bundles = JSON.parse(prompt.split("Evidence bundles: ")[1].split("\nReturn JSON")[0]);
        const sources = bundles.flatMap((bundle: any) => bundle.sources);
        const ref = (file: string, text: string) =>
          sources
            .find((source: any) => source.file === file)
            .lines.find((line: any) => line.text.includes(text)).ref;
        return JSON.stringify({
          part_evidence: [
            { part_id: "P1", evidence_refs: [ref("page.ts", "const output = render()")] },
            {
              part_id: "P2",
              evidence_refs: [
                ref("policy.ts", "displayWidth: 12"),
                ref("render.ts", "repeat(settings.displayWidth)"),
              ],
            },
          ],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      },
      (model, overrides, _load, reserve) =>
        resolveModelBudget(
          model,
          overrides,
          async () => ({ parameters: "num_ctx 50000\nnum_predict 16000" }),
          reserve,
        ),
    );
    assert.equal(result.status, "evidence_selected");
    assert.equal(result.model_calls, 1);
    assert.equal(result.evidence.length, 3);
  }));


test("Unicode preserves JS/TS nested shadow rejection and same-line provider lookups", () =>
  fixture((root) => {
    for (const extension of ["js", "ts"]) {
      const file = `unicode.${extension}`;
      writeFileSync(join(root, file), [
        "// é😀".repeat(40),
        "import { renderPage as render } from './render.js';",
        "import { policy as settings } from './policy.js';",
        "export function unicodeShadow() {",
        "  /* é😀 */ { const render = () => 'local'; render(); }",
        "}",
        "export function unicodeDirect() { /* é😀 */ return render(); }",
        "export function unicodeConfig() { /* é😀 */ return settings.displayWidth; }",
      ].join("\n"));
      execFileSync("git", ["-C", root, "add", file]);
      const checks = createRelationshipChecks(root, indexRepository(root));
      assert.equal(checks.missing(
        decomposeQuestion("Where does unicodeShadow call renderPage?")[0],
        [cite(root, file, 5)],
      ).length, 1);
      assert.deepEqual(checks.missing(
        decomposeQuestion("Where does unicodeDirect call renderPage?")[0],
        [cite(root, file, 7)],
      ), []);
      assert.deepEqual(checks.missing(
        decomposeQuestion("How is displayWidth configured and used in unicodeConfig?")[0],
        [cite(root, "policy.ts", 2), cite(root, file, 8)],
      ), []);
      rmSync(join(root, file));
      execFileSync("git", ["-C", root, "rm", "--cached", file]);
    }
  }));
