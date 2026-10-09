import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import { resolveModelBudget } from "../../ollama-client.js";
import { createRelationshipChecks } from "./local-explore-relationships.js";
import { buildCandidates, decomposeQuestion, runLocalExploreRepo } from "./local-explore-repo.js";

const query =
  "Explain configuration provenance for the default-import instance STORAGE_ENDPOINT in StorageSettings.options.";
const service = [
  "class StorageSettings {",
  "  constructor(private environment: NodeJS.ProcessEnv) {}",
  "  options() { return { endpoint: this.environment.STORAGE_ENDPOINT }; }",
  "}",
  "const service = new StorageSettings(process.env);",
  "export default service;",
].join("\n");
const consumer = [
  "import settings from './service.js';",
  "export function setup() { return settings.options(); }",
].join("\n");

async function fixture(run: (root: string) => unknown | Promise<unknown>) {
  const root = mkdtempSync(join(tmpdir(), "scout-instance-bindings-"));
  try {
    writeFileSync(join(root, "service.ts"), service);
    writeFileSync(join(root, "storage.ts"), consumer);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "service.ts", "storage.ts"]);
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
    await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function checkBinding(root: string, accepted: boolean, label: string) {
  const index = indexRepository(root);
  assert.ok(
    index.dependencies.some(
      (item) => item.file === "storage.ts" && item.target_file === "service.ts",
    ),
  );
  const part = decomposeQuestion(query)[0];
  const candidates = buildCandidates(root, [], index, query, part);
  const evidence = candidates.flatMap((candidate) =>
    candidate.lines.map((line) => ({
      id: candidate.id,
      ref: `${candidate.id}:${line.line}`,
      file: candidate.file,
      line: line.line,
      quote: line.text,
    })),
  );
  const checks = createRelationshipChecks(root, index);
  const binding = checks
    .checklist(part, evidence)
    .filter((item) => /construction and reader context/.test(item.requirement));
  assert.equal(binding.length, 1, label);
  assert.equal(binding[0].alternative_ref_sets.length, accepted ? 1 : 0, label);
  assert.equal(
    checks.missing(part, evidence).some((item) => /construction and reader context/.test(item)),
    !accepted,
    label,
  );
  assert.ok(
    checks
      .missing(part, evidence)
      .includes("default-import instance configuration semantics require parent review"),
    label,
  );
  assert.equal(part.completeness, "unchecked");
  assert.ok(new Set(candidates.map((candidate) => candidate.file)).size <= 6);
  for (const item of evidence)
    assert.equal(
      item.quote,
      readFileSync(join(root, item.file), "utf8").split("\n")[item.line - 1],
    );
}

test("destructured bindings reject imported-instance context without mistaking property keys for bindings", () =>
  fixture((root) => {
    checkBinding(root, true, "baseline");
    for (const [parameter, accepted] of [
      ["{ settings }", false],
      ["{ incoming: settings }", false],
      ["[settings]", false],
      ["{ nested: { incoming: settings = fallback } }", false],
      ["{ ...settings }", false],
      ["{ settings: other }", true],
      ["{ incoming: other = settings }", true],
    ] as const) {
      writeFileSync(join(root, "storage.ts"), consumer.replace("setup()", `setup(${parameter})`));
      checkBinding(root, accepted, parameter);
    }
    for (const [binding, accepted] of [
      ["const { incoming: settings } = replacement;", false],
      ["const [settings] = replacement;", false],
      ["const { settings: other } = replacement;", true],
      ["const { incoming: other = settings } = replacement;", true],
    ] as const) {
      writeFileSync(
        join(root, "storage.ts"),
        consumer.replace("return settings", `${binding} return settings`),
      );
      checkBinding(root, accepted, binding);
    }
  }));

test("direct calls require an ordinary instance reader declaration", () =>
  fixture((root) => {
    for (const modifier of ["static ", "get ", "set "]) {
      writeFileSync(
        join(root, "service.ts"),
        service.replace(
          "  options()",
          `  ${modifier}options(${modifier === "set " ? "value" : ""})`,
        ),
      );
      checkBinding(root, false, modifier);
    }
    writeFileSync(join(root, "service.ts"), service.replace("  options()", "  async options()"));
    checkBinding(root, true, "async instance method");
  }));

test("constructor and called-member writes invalidate direct instance bindings", () =>
  fixture((root) => {
    for (const [write, accepted] of [
      ["StorageSettings = Replacement;", false],
      ["StorageSettings ||= Replacement;", false],
      ["({ constructor: StorageSettings } = replacement);", false],
      ["[StorageSettings] = replacement;", false],
      ["Unrelated = Replacement;", true],
    ] as const) {
      writeFileSync(
        join(root, "service.ts"),
        service.replace("const service", `${write}\nconst service`),
      );
      checkBinding(root, accepted, write);
    }
    for (const instance of ["service", "settings"]) {
      for (const [write, accepted] of [
        [`${instance}.options = replacement;`, false],
        [`${instance}.options ||= replacement;`, false],
        [`${instance}['options']++;`, false],
        [`({ reader: ${instance}.options } = replacement);`, false],
        [`[${instance}] = replacement;`, false],
        [`${instance}.unrelated = replacement;`, true],
      ] as const) {
        writeFileSync(
          join(root, "service.ts"),
          instance === "service"
            ? service.replace("export default", `${write}\nexport default`)
            : service,
        );
        writeFileSync(
          join(root, "storage.ts"),
          instance === "settings"
            ? consumer.replace("return settings", `${write} return settings`)
            : consumer,
        );
        checkBinding(root, accepted, write);
      }
    }
  }));

test("invalid instance bindings remain needs_review even with complete nearby evidence", () =>
  fixture(async (root) => {
    for (const [label, provider, storage] of [
      ["baseline", service, consumer],
      ["shadowed", service, consumer.replace("setup()", "setup({ settings })")],
      ["static reader", service.replace("  options()", "  static options()"), consumer],
      [
        "constructor write",
        service.replace("const service", "StorageSettings = Replacement;\nconst service"),
        consumer,
      ],
      [
        "reader write",
        service,
        consumer.replace("return settings", "settings.options = replacement; return settings"),
      ],
    ]) {
      writeFileSync(join(root, "service.ts"), provider);
      writeFileSync(join(root, "storage.ts"), storage);
      let calls = 0;
      const result = await runLocalExploreRepo(
        { repository_root: root, query, model: "fixture:instance-bindings" },
        async (_model, prompt) => {
          calls++;
          const parts = JSON.parse(
            prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
          ) as { relationships: { alternative_ref_sets: string[][] }[] }[];
          const nearbyRefs = [...prompt.matchAll(/"ref":"(E\d+)"/g)].map((match) => match[1]);
          const refs = [
            ...new Set([
              ...parts[0].relationships.flatMap((item) => item.alternative_ref_sets[0] ?? []),
              ...nearbyRefs,
            ]),
          ];
          assert.ok(refs.length > 0 && refs.length <= 16, label);
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
      assert.equal(result.status, "needs_review", label);
      assert.ok(result.evidence.length > 0, label);
      assert.ok(
        result.unresolved.some((item) =>
          item.includes("default-import instance configuration semantics require parent review"),
        ),
        label,
      );
      assert.equal(
        result.unresolved.some((item) => /construction and reader context/.test(item)),
        label !== "baseline",
        label,
      );
      assert.ok(calls <= 2, label);
    }
  }));
