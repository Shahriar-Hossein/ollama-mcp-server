import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import { resolveModelBudget } from "../../ollama-client.js";
import { createRelationshipChecks } from "./local-explore-relationships.js";
import {
  buildCandidates,
  decomposeQuestion,
  runLocalExploreRepo,
  validateModelAnswer,
} from "./local-explore-repo.js";
import { configurationKeys } from "./local-explore-validation.js";

const query = "How does DELIVERY_CHANNEL affect startup, defaults and validation?";
const sources = {
  "delivery.ts": [
    "import { Relay } from './relay.js';",
    "export function chooseDelivery(settings) {",
    "  const channel = settings.get<string>(",
    "    'DELIVERY_CHANNEL',",
    "    'console',",
    "  );",
    "  function example() { return 'nested example'; }",
    ...Array.from({ length: 45 }, (_, i) => `// delivery padding ${i}`),
    "  if (channel === 'relay') {",
    "    return new Relay(settings);",
    "  } else {",
    "    return console;",
    "  }",
    "}",
  ].join("\n"),
  "boot.ts": [
    "import { chooseDelivery } from './delivery.js';",
    "export function bootstrap(settings) {",
    ...Array.from({ length: 70 }, (_, i) => `// bootstrap padding ${i}`),
    "  if (",
    "    settings.get('APP_STAGE') === 'live' &&",
    "    settings.get('DELIVERY_CHANNEL') !== 'relay'",
    "  ) {",
    "    throw new Error(",
    "      'Live delivery requires a relay channel',",
    "    );",
    "  }",
    "  return chooseDelivery(settings);",
    "}",
  ].join("\n"),
  "relay.ts": [
    "export class Relay {",
    "  constructor(settings) {",
    "    this.endpoint = settings.getOrThrow<string>('RELAY_ENDPOINT');",
    ...Array.from({ length: 55 }, (_, i) => `// relay padding ${i}`),
    "    this.token = settings.getOrThrow<string>('RELAY_TOKEN');",
    "  }",
    "}",
  ].join("\n"),
  "example.ts":
    "// settings.get('DELIVERY_CHANNEL')\nexport function example() { return 'irrelevant'; }\n",
  "number.ts":
    "export const resolvePort = (settings) => settings.get<number>(\n  'PUBLIC_PORT',\n  0,\n);\n",
};

async function fixture(run: (root: string) => unknown | Promise<unknown>) {
  const root = mkdtempSync(join(tmpdir(), "scout-configuration-"));
  try {
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
    await run(root);
    for (const [file, source] of Object.entries(sources))
      assert.equal(readFileSync(join(root, file), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("configuration key recognition keeps flag resolution separate", () => {
  assert.deepEqual(
    configurationKeys("DELIVERY_CHANNEL ENABLE_MAIL MAIL_ENABLED DELIVERY_CHANNEL"),
    ["DELIVERY_CHANNEL"],
  );
  assert.equal(decomposeQuestion(query)[0].completeness, "unchecked");
});

test("short literal defaults are selectable only as complete checked source lines", () => {
  const candidate = {
    id: "C1",
    kind: "configuration" as const,
    file: "settings.ts",
    lines: [
      { line: 1, text: "  0," },
      { line: 2, text: "  ''," },
      { line: 3, text: "  )," },
      { line: 4, text: "  const port = 0," },
    ],
  };
  const refs = new Map(candidate.lines.map((line) => [`E${line.line}`, { candidate, line }]));
  const answer = validateModelAnswer(
    JSON.stringify({ evidence_refs: ["E1", "E2", "E3"] }),
    [candidate],
    [],
    [],
    refs,
  );
  assert.deepEqual(
    answer.evidence.map((item) => item.quote),
    ["0,", "'',"],
  );
  assert.equal(answer.rejected_evidence, 1);
  const forged = validateModelAnswer(
    JSON.stringify({ evidence: [{ id: "C1", line: 4, quote: "0," }] }),
    [candidate],
  );
  assert.equal(forged.rejected_evidence, 1);
});

test("ranked variable excerpts preserve complete source lines at both boundaries", () =>
  fixture((root) => {
    const index = indexRepository(root);
    const symbol = index.symbols.find((item) => item.name === "channel");
    assert.ok(symbol);
    assert.ok(symbol.range.start.column > 1);
    const candidates = buildCandidates(
      root,
      [{ score: 1, sources: [], evidence: { kind: "symbol", file: symbol.file, symbol } }],
      index,
      query,
      decomposeQuestion(query)[0],
    );
    const ranked = candidates.find(
      (candidate) => candidate.kind === "symbol" && candidate.symbol === symbol.qualified_name,
    );
    assert.ok(ranked);
    assert.equal(ranked.lines[0].text, "  const channel = settings.get<string>(");
    assert.equal(ranked.lines.at(-1)?.text, "  );");
    for (const candidate of candidates)
      for (const line of candidate.lines)
        assert.equal(
          line.text,
          sources[candidate.file as keyof typeof sources].split("\n")[line.line - 1],
        );
  }));

test("expression arrow readers retain short numeric defaults and implicit outcomes", () =>
  fixture((root) => {
    const part = decomposeQuestion("How is PUBLIC_PORT defaulted?")[0];
    const checks = createRelationshipChecks(root, indexRepository(root));
    const evidence = sources["number.ts"].split("\n").map((quote, offset) => ({
      id: "C1",
      ref: `E${offset + 1}`,
      file: "number.ts",
      line: offset + 1,
      quote,
    }));
    assert.deepEqual(checks.missing(part, evidence), []);
    assert.ok(
      checks
        .checklist(part, evidence)
        .some((check) => check.requirement.includes("configuration outcome")),
    );
    assert.ok(
      checks.missing(
        part,
        evidence.filter((item) => item.quote.trim() !== "0,"),
      ).length > 0,
    );
  }));

test("configuration packing keeps distant defaults, startup rejection and provider reads", () =>
  fixture((root) => {
    const candidates = buildCandidates(
      root,
      [],
      indexRepository(root),
      query,
      decomposeQuestion(query)[0],
    );
    for (const text of [
      "'console',",
      "if (channel === 'relay')",
      "return new Relay(settings)",
      "return console",
      "settings.get('APP_STAGE')",
      "Live delivery requires",
      "'RELAY_ENDPOINT'",
      "'RELAY_TOKEN'",
    ]) {
      assert.ok(
        candidates.some((candidate) => candidate.lines.some((line) => line.text.includes(text))),
        `${text} must be packed`,
      );
    }
    assert.ok(new Set(candidates.map((candidate) => candidate.file)).size <= 6);
    for (const candidate of candidates)
      for (const line of candidate.lines)
        assert.equal(
          line.text,
          sources[candidate.file as keyof typeof sources].split("\n")[line.line - 1],
        );
  }));

test("configuration shortlists require read defaults and same-scope guarded outcomes", () =>
  fixture((root) => {
    const checks = createRelationshipChecks(root, indexRepository(root));
    const part = decomposeQuestion(query)[0];
    const evidence = Object.entries(sources).flatMap(([file, source]) =>
      source.split("\n").map((quote, offset) => ({
        id: "C1",
        ref: `${file}:${offset + 1}`,
        file,
        line: offset + 1,
        quote,
      })),
    );
    assert.deepEqual(checks.missing(part, evidence), []);
    const shortlist = checks.checklist(part, evidence);
    assert.ok(shortlist.some((check) => check.requirement.includes("configuration outcome")));
    assert.ok(
      shortlist.every((check) =>
        check.alternative_ref_sets.every(
          (refs) =>
            !refs.includes("delivery.ts:7") && !refs.some((ref) => ref.startsWith("example.ts:")),
        ),
      ),
    );
    for (const text of [
      "'console',",
      "if (channel === 'relay')",
      "} else {",
      "settings.get('APP_STAGE')",
      "Live delivery requires",
    ]) {
      const partial = evidence.filter((item) => !item.quote.includes(text));
      assert.ok(checks.missing(part, partial).length > 0, `${text} must be selected`);
    }
    const missing = decomposeQuestion("How does ABSENT_CHANNEL affect startup?")[0];
    assert.ok(checks.missing(missing, evidence).some((name) => name.includes("ABSENT_CHANNEL")));
  }));

test("the scout exposes configuration shortlists and keeps semantics under review", () =>
  fixture(async (root) => {
    let calls = 0;
    const result = await runLocalExploreRepo(
      { repository_root: root, query, model: "fixture:configuration" },
      async (_model, prompt) => {
        calls++;
        const parts = JSON.parse(
          prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
        ) as { relationships: { requirement: string; alternative_ref_sets: string[][] }[] }[];
        const groups = parts[0].relationships;
        assert.ok(groups.length > 0);
        assert.ok(groups.every((group) => group.alternative_ref_sets.length > 0));
        const refs = [...new Set(groups.flatMap((group) => group.alternative_ref_sets[0]))];
        assert.ok(refs.length <= 16);
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
    assert.ok(
      !result.unresolved.some(
        (item) => item.includes("configuration outcome") || item.includes("configuration read"),
      ),
      JSON.stringify(result.unresolved),
    );
  }));
