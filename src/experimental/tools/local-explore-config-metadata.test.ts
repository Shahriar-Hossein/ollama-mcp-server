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

const query = "Which imported constant supplies SIGNING_TOKEN configuration?";

async function fixture(source: string, run: (root: string) => unknown | Promise<unknown>) {
  const root = mkdtempSync(join(tmpdir(), "scout-config-metadata-"));
  const constants = [
    "export const token = process.env.SIGNING_TOKEN;",
    "export const moduleToken = 'module';",
    "export const providerToken = 'provider';",
  ].join("\n");
  try {
    writeFileSync(join(root, "constants.ts"), constants);
    writeFileSync(join(root, "consumer.ts"), source);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    await run(root);
    assert.equal(readFileSync(join(root, "constants.ts"), "utf8"), constants);
    assert.equal(readFileSync(join(root, "consumer.ts"), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function packed(root: string) {
  const index = indexRepository(root);
  const part = decomposeQuestion(query)[0];
  const candidates = buildCandidates(root, [], index, query, part);
  const evidence = candidates.flatMap((candidate) =>
    candidate.lines.map((line) => ({
      id: candidate.id,
      file: candidate.file,
      line: line.line,
      quote: line.text,
    })),
  );
  const checks = createRelationshipChecks(root, index);
  const requirements = checks
    .checklist(part, evidence.map((item, i) => ({ ...item, ref: `E${i}` })))
    .filter((item) => item.requirement.startsWith("imported configuration"));
  return { index, part, evidence, checks, requirements };
}

const imported = "import { token, moduleToken, providerToken } from './constants.js';";
const metadata = [
  "@Module({",
  "  imports: [moduleToken],",
  "  providers: [providerToken, {",
  "    provide: providerToken,",
  "    inject: [providerToken],",
  "    useFactory: () => ({ provide: token }),",
  "  }, { provide: providerToken, useValue: token }],",
  "  exports: [moduleToken],",
  "})",
  "export class Feature {}",
].join("\n");

test("ordinary returned metadata-named properties retain real-index value provenance", async () => {
  for (const key of ["secret", "provide", "inject", "imports", "providers", "exports"]) {
    const value = key === "provide" || key === "secret" ? "token" : "[token]";
    await fixture(`${imported}\nexport function setup() { return { ${key}: ${value} }; }`, (root) => {
      const { index, part, evidence, checks, requirements } = packed(root);
      assert.ok(index.references.some((item) => item.target_symbol_id && item.resolution === "static"));
      assert.equal(requirements.length, 1, key);
      assert.match(requirements[0].requirement, /token provenance/);
      assert.equal(requirements[0].alternative_ref_sets.length, 1, key);
      assert.ok(!checks.missing(part, evidence).some((item) => item.startsWith("imported configuration")));
      assert.equal(part.completeness, "unchecked");
    });
  }
});

test("imported Module metadata excludes direct tokens and retains factory and useValue reads", async () => {
  for (const alias of ["Module", "NestModule"]) {
    await fixture(
      `${imported}\nimport { Module as ${alias} } from '@nestjs/common';\n${metadata.replace("@Module", `@${alias}`)}`,
      (root) => {
        const { requirements } = packed(root);
        assert.equal(requirements.length, 2);
        assert.ok(requirements.every((item) => /token provenance/.test(item.requirement)));
        assert.ok(requirements.every((item) => item.alternative_ref_sets.length === 1));
      },
    );
  }
});

test("unbound, unrelated and shadowed Module decorators cannot suppress value obligations", async () => {
  for (const declaration of [
    "",
    "import { Module } from './other.js';",
    "import type { Module } from '@nestjs/common';",
    "import { Module } from '@nestjs/common';\nfunction example(Module) {}",
    "import { Module } from '@nestjs/common';\nfunction example({ Module }) {}",
    "import { Module } from '@nestjs/common';\nconst example = Module => {};",
    "import { Module } from '@nestjs/common';\nModule = replacement;",
  ]) {
    await fixture(`${imported}\n${declaration}\n${metadata}`, (root) => {
      const { requirements } = packed(root);
      assert.ok(requirements.some((item) => /moduleToken provenance/.test(item.requirement)), declaration);
      assert.ok(requirements.some((item) => /providerToken provenance/.test(item.requirement)), declaration);
    });
  }
});

test("generic provider-shaped objects and ambiguous metadata retain value obligations", async () => {
  for (const source of [
    "export function setup() { return { provide: providerToken, inject: [providerToken], useValue: token }; }",
    "Module({ imports: [moduleToken] });",
    "@Module({ imports: [moduleToken], ...overrides })\nexport class Feature {}",
    "@Module({ imports: [moduleToken], imports: [] })\nexport class Feature {}",
    "@Module({ providers: [{ provide: providerToken, ...overrides, useValue: token }] })\nexport class Feature {}",
    "@Module({ providers: [{ provide: providerToken }] })\nexport class Feature {}",
  ]) {
    await fixture(`${imported}\nimport { Module } from '@nestjs/common';\n${source}`, (root) => {
      const { requirements } = packed(root);
      assert.ok(requirements.some((item) => /(?:moduleToken|providerToken) provenance/.test(item.requirement)), source);
    });
  }
});

test("complete metadata and ordinary-value selections still require parent review", async () => {
  await fixture(
    `${imported}\nimport { Module } from '@nestjs/common';\n${metadata}\nexport function setup() { return { provide: token }; }`,
    async (root) => {
      const generate = async (_model: string, prompt: string) => {
        const parts = JSON.parse(
          prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
        ) as { relationships: { alternative_ref_sets: string[][] }[] }[];
        const refs = [...new Set(parts[0].relationships.flatMap((group) => group.alternative_ref_sets[0] ?? []))];
        return JSON.stringify({
          part_evidence: [{ part_id: "P1", evidence_refs: refs }],
          confidence: "high",
          unresolved: [],
          next_action: { ref: "" },
        });
      };
      const budget: typeof resolveModelBudget = (model, overrides) =>
        resolveModelBudget(model, overrides, async () => ({ parameters: "num_ctx 50000\nnum_predict 2048" }));
      const result = await runLocalExploreRepo(
        { repository_root: root, query, model: "fixture:metadata" },
        generate,
        budget,
      );
      assert.equal(result.status, "needs_review");
      assert.ok(result.evidence.some((item) => item.quote.includes("return { provide: token }")));
    },
  );
});
