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
import { parseConfigurationContexts } from "./local-explore-config-context.js";
import { configurationKeys, missingEvidenceRequirements } from "./local-explore-validation.js";

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

async function provenanceFixture(run: (root: string) => unknown | Promise<unknown>) {
  return fixture(async (root) => {
    const files = {
      "constants.ts":
        "export const SIGNING_TOKEN = process.env.SIGNING_TOKEN;\nexport const unused = 'unused';\nexport const options = {\n  signingToken: process.env.SIGNING_TOKEN,\n  other: 'unrelated',\n};\n",
      "signer.ts": [
        "import { SIGNING_TOKEN as token, unused, options } from './constants.js';",
        "import { JwtModule } from '@nestjs/jwt';",
        "@Module({ imports: [",
        "  JwtModule.register({",
        "    secret: token,",
        "  }),",
        "] })",
        "export class SignerModule {}",
        "export class OtherReader {",
        "  read() { return options.signingToken; }",
        "}",
      ].join("\n"),
      "startup.ts":
        "import { config as load } from 'dotenv';\nimport { SignerModule } from './signer.js';\nload({\n  path: '.env.runtime',\n});\nexport function bootstrap() { return SignerModule; }\n",
    };
    for (const [file, source] of Object.entries(files)) writeFileSync(join(root, file), source);
    execFileSync("git", ["-C", root, "add", ...Object.keys(files)]);
    await run(root);
  });
}

function packedEvidence(root: string, query: string) {
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
  return { index, part, candidates, evidence, checks: createRelationshipChecks(root, index) };
}

test("configuration value provenance excludes module arrays and provider tokens", () =>
  provenanceFixture((root) => {
    const source = readFileSync(join(root, "signer.ts"), "utf8");
    writeFileSync(
      join(root, "signer.ts"),
      source.replace(
        "@Module({ imports: [",
        "import { unknownModule, providerToken } from './tokens.js';\n@Module({ providers: [{ provide: providerToken, inject: [providerToken], useValue: token }], exports: [unknownModule], imports: [unknownModule,",
      ),
    );
    const { part, evidence, checks } = packedEvidence(
      root,
      "Which imported constant supplies configuration to SignerModule registration?",
    );
    const requirements = checks.checklist(
      part,
      evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
    );
    const values = requirements.filter((item) =>
      item.requirement.startsWith("imported configuration"),
    );
    assert.equal(values.length, 2);
    assert.ok(values.every((item) => /token provenance/.test(item.requirement)));
    assert.ok(values.every((item) => item.alternative_ref_sets.length === 1));
    assert.ok(
      !checks.missing(part, evidence).some((name) => /unknownModule|providerToken/.test(name)),
    );
  }));

async function instanceFixture(run: (root: string) => unknown | Promise<unknown>) {
  return fixture(async (root) => {
    writeFileSync(
      join(root, "service.ts"),
      [
        "import { config as load } from 'dotenv';",
        "load({ path: '.env.service' });",
        "class StorageSettings {",
        "  constructor(private environment: NodeJS.ProcessEnv) {}",
        "  options() {",
        "    return { endpoint: this.environment.STORAGE_ENDPOINT };",
        "  }",
        "}",
        "const service = new StorageSettings(process.env);",
        "export default service;",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "storage.ts"),
      [
        "import settings from './service.js';",
        "import { StorageModule } from '@vendor/storage';",
        "export class StorageFeature {",
        "  setup() {",
        "    return StorageModule.register(settings.options());",
        "  }",
        "}",
      ].join("\n"),
    );
    execFileSync("git", ["-C", root, "add", "service.ts", "storage.ts"]);
    await run(root);
  });
}

const instanceQuery =
  "Does the default-import instance read STORAGE_ENDPOINT in StorageSettings.options before environment initialization?";

test("default-import instance binds construction, constructor argument and named reader call", () =>
  instanceFixture((root) => {
    const { part, evidence, checks, candidates } = packedEvidence(root, instanceQuery);
    const requirements = checks.checklist(
      part,
      evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
    );
    const context = requirements.find((item) =>
      /construction and reader context/.test(item.requirement),
    );
    assert.ok(context);
    assert.equal(context.alternative_ref_sets.length, 1);
    for (const text of [
      "import settings",
      "settings.options()",
      "class StorageSettings",
      "constructor(",
      "options() {",
      "this.environment.STORAGE_ENDPOINT",
      "new StorageSettings(process.env)",
      "export default service",
    ])
      assert.ok(
        checks
          .missing(
            part,
            evidence.filter((item) => !item.quote.includes(text)),
          )
          .some((name) => /construction and reader context/.test(name)),
        text,
      );
    assert.ok(evidence.some((item) => item.quote.includes("load({ path: '.env.service' })")));
    assert.ok(
      checks
        .missing(part, evidence)
        .includes("default-import instance configuration semantics require parent review"),
    );
    assert.ok(
      checks
        .missing(part, evidence)
        .includes("configuration initialization order requires parent review"),
    );
    assert.equal(part.completeness, "unchecked");
    assert.ok(new Set(candidates.map((item) => item.file)).size <= 6);
  }));

test("instance context preserves object reference, scalar capture and copied environment arguments", () =>
  instanceFixture((root) => {
    const base = readFileSync(join(root, "service.ts"), "utf8");
    for (const argument of ["process.env", "process.env.STORAGE_ENDPOINT", "{ ...process.env }"]) {
      writeFileSync(
        join(root, "service.ts"),
        base.replace("new StorageSettings(process.env)", `new StorageSettings(${argument})`),
      );
      const { part, evidence, checks } = packedEvidence(root, instanceQuery);
      assert.ok(evidence.some((item) => item.quote.includes(`new StorageSettings(${argument})`)));
      assert.ok(
        !checks
          .missing(part, evidence)
          .some((name) => /construction and reader context/.test(name)),
      );
      assert.ok(
        checks.missing(part, evidence).some((name) => /semantics require parent review/.test(name)),
      );
    }
    writeFileSync(
      join(root, "service.ts"),
      base.replace(
        "const service = new StorageSettings(process.env);\nexport default service;",
        "export default new StorageSettings(process.env);",
      ),
    );
    const next = packedEvidence(root, instanceQuery);
    assert.ok(
      !next.checks
        .missing(next.part, next.evidence)
        .some((name) => /construction and reader context/.test(name)),
    );
  }));

test("shadowed, reassigned, factory and reexported default instances remain unresolved", () =>
  instanceFixture((root) => {
    const base = readFileSync(join(root, "service.ts"), "utf8");
    const consumer = readFileSync(join(root, "storage.ts"), "utf8");
    for (const source of [
      base.replace("new StorageSettings(process.env)", "makeSettings(process.env)"),
      base.replace("const service", "let service"),
      base.replace("export default service", "service = replacement;\nexport default service"),
      base.replace(
        "export default service",
        "function demo(service) { return service; }\nexport default service",
      ),
      base.replace("new StorageSettings(process.env)", "new StorageSettings(...args)"),
      base.replace(
        "class StorageSettings",
        "const StorageSettings = replacement;\nclass StorageSettings",
      ),
      "export { default } from './elsewhere.js';",
    ]) {
      writeFileSync(join(root, "service.ts"), source);
      const next = packedEvidence(
        root,
        "Explain configuration provenance for the default-import instance STORAGE_ENDPOINT.",
      );
      assert.ok(
        next.checks
          .missing(next.part, next.evidence)
          .some((name) => /construction and reader context/.test(name)),
        source,
      );
    }
    writeFileSync(join(root, "service.ts"), base);
    for (const source of [
      consumer.replace("setup()", "setup(settings)"),
      consumer.replace("return StorageModule", "settings = replacement;\n    return StorageModule"),
      consumer.replace("import settings", "import type settings"),
    ]) {
      writeFileSync(join(root, "storage.ts"), source);
      const next = packedEvidence(root, instanceQuery);
      assert.ok(
        next.checks
          .missing(next.part, next.evidence)
          .some((name) => /construction and reader context/.test(name)),
        source,
      );
    }
  }));

test("default instance reader selection excludes unrelated keys and competing owners", () =>
  instanceFixture((root) => {
    for (const question of [
      "Explain configuration provenance for the default-import instance OTHER_SETTING in StorageSettings.options.",
      "Explain configuration provenance for the default-import instance STORAGE_ENDPOINT in DifferentReader.",
    ]) {
      const { part, evidence, checks } = packedEvidence(root, question);
      assert.ok(
        !checks
          .checklist(
            part,
            evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
          )
          .some((item) => /construction and reader context/.test(item.requirement)),
      );
      assert.ok(
        checks
          .missing(part, evidence)
          .includes("imported configuration constant/property provenance"),
      );
    }
  }));

test("instance key context excludes comments and nested example reads", () =>
  instanceFixture((root) => {
    const base = readFileSync(join(root, "service.ts"), "utf8");
    for (const replacement of [
      "// STORAGE_ENDPOINT\n    return {};",
      "function example() { return process.env.STORAGE_ENDPOINT; }\n    return {};",
    ]) {
      writeFileSync(
        join(root, "service.ts"),
        base.replace("return { endpoint: this.environment.STORAGE_ENDPOINT };", replacement),
      );
      const { part, evidence, checks } = packedEvidence(root, instanceQuery);
      assert.ok(
        !checks
          .checklist(
            part,
            evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
          )
          .some((item) => /construction and reader context/.test(item.requirement)),
      );
      assert.ok(
        checks
          .missing(part, evidence)
          .includes("imported configuration constant/property provenance"),
      );
    }
  }));

test("instance shortlists remain under review and oversized constructors refuse generation", () =>
  instanceFixture(async (root) => {
    let calls = 0;
    const generate = async (_model: string, prompt: string) => {
      calls++;
      const parts = JSON.parse(
        prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
      ) as { relationships: { alternative_ref_sets: string[][] }[] }[];
      const refs = [
        ...new Set(parts[0].relationships.flatMap((group) => group.alternative_ref_sets[0] ?? [])),
      ];
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: refs }],
        confidence: "high",
        unresolved: [],
        next_action: { ref: "" },
      });
    };
    const budget: typeof resolveModelBudget = (model, overrides) =>
      resolveModelBudget(model, overrides, async () => ({
        parameters: "num_ctx 50000\nnum_predict 2048",
      }));
    const result = await runLocalExploreRepo(
      { repository_root: root, query: instanceQuery, model: "fixture:instance" },
      generate,
      budget,
    );
    assert.equal(result.status, "needs_review");
    assert.ok(
      result.evidence.some((item) => item.quote.includes("new StorageSettings(process.env)")),
    );
    assert.ok(result.evidence.some((item) => item.quote.includes("options() {")));
    assert.ok(result.unresolved.some((name) => /semantics require parent review/.test(name)));
    const before = calls;
    const source = readFileSync(join(root, "service.ts"), "utf8");
    writeFileSync(
      join(root, "service.ts"),
      source.replace(
        "constructor(private environment: NodeJS.ProcessEnv) {}",
        `constructor(private environment: NodeJS.ProcessEnv) {\n${Array.from({ length: 500 }, (_, i) => `    console.log('${i}${"x".repeat(100)}');`).join("\n")}\n  }`,
      ),
    );
    const oversized = await runLocalExploreRepo(
      { repository_root: root, query: instanceQuery, model: "fixture:instance" },
      generate,
      budget,
    );
    assert.equal(oversized.packing_overflow, true);
    assert.equal(calls, before);
  }));

test("imported scalar provenance binds the alias, initializer, registration and named reader", () =>
  provenanceFixture((root) => {
    const query = "Which imported constant supplies configuration to SignerModule registration?";
    const { part, evidence, checks } = packedEvidence(root, query);
    const requirements = checks.checklist(
      part,
      evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
    );
    const provenance = requirements.filter((item) =>
      item.requirement.startsWith("imported configuration"),
    );
    assert.equal(provenance.length, 1);
    assert.match(provenance[0].requirement, /token provenance/);
    assert.equal(provenance[0].alternative_ref_sets.length, 1);
    assert.ok(
      !checks.missing(part, evidence).some((name) => name.startsWith("imported configuration")),
    );
    for (const text of [
      "SIGNING_TOKEN =",
      "import { SIGNING_TOKEN",
      "class SignerModule",
      "secret: token",
      "JwtModule.register",
    ])
      assert.ok(
        checks
          .missing(
            part,
            evidence.filter((item) => !item.quote.includes(text)),
          )
          .some((name) => name.startsWith("imported configuration")),
        text,
      );
    assert.ok(!provenance.some((item) => /unused|options/.test(item.requirement)));
    assert.equal(part.completeness, "unchecked");
    const missingOwner = packedEvidence(
      root,
      "Which imported constant supplies configuration in MissingReader?",
    );
    assert.ok(
      missingOwner.checks
        .missing(missingOwner.part, missingOwner.evidence)
        .includes("imported configuration constant/property provenance"),
    );
  }));

test("imported property provenance retains its object declaration and excludes duplicate or spread fields", () =>
  provenanceFixture((root) => {
    const query = "Which imported configuration property is read in OtherReader?";
    const first = packedEvidence(root, query);
    assert.ok(
      !first.checks
        .missing(first.part, first.evidence)
        .some((name) => name.startsWith("imported configuration")),
    );
    for (const text of [
      "options =",
      "signingToken: process.env",
      "class OtherReader",
      "return options.signingToken",
    ])
      assert.ok(
        first.checks
          .missing(
            first.part,
            first.evidence.filter((item) => !item.quote.includes(text)),
          )
          .some((name) => name.startsWith("imported configuration")),
        text,
      );
    const base = readFileSync(join(root, "constants.ts"), "utf8");
    for (const extra of ["...overrides,", "signingToken: 'replacement',"]) {
      writeFileSync(join(root, "constants.ts"), base.replace("  other:", `  ${extra}\n  other:`));
      const next = packedEvidence(root, query);
      assert.ok(
        next.checks
          .missing(next.part, next.evidence)
          .some((name) => name.startsWith("imported configuration")),
      );
    }
  }));

test("shadowed imports, mutable declarations and reexports cannot establish constant provenance", () =>
  provenanceFixture((root) => {
    const query = "Which imported configuration property is read in OtherReader?";
    const base = readFileSync(join(root, "signer.ts"), "utf8");
    writeFileSync(join(root, "signer.ts"), base.replace("read()", "read(options)"));
    let next = packedEvidence(root, query);
    assert.ok(
      next.checks
        .missing(next.part, next.evidence)
        .some((name) => name.startsWith("imported configuration")),
    );
    writeFileSync(join(root, "signer.ts"), base);
    const constants = readFileSync(join(root, "constants.ts"), "utf8");
    for (const source of [
      constants.replace("const options", "let options"),
      "export { options } from './other.js';\n",
    ]) {
      writeFileSync(join(root, "constants.ts"), source);
      next = packedEvidence(root, query);
      assert.ok(
        next.checks
          .missing(next.part, next.evidence)
          .some((name) => name.startsWith("imported configuration")),
      );
    }
  }));

test("named constructor readers cannot borrow another class's configuration injection", () =>
  provenanceFixture((root) => {
    writeFileSync(
      join(root, "reader.ts"),
      [
        "export class DesiredReader {",
        "  read() { return this.settings.get('SIGNING_TOKEN'); }",
        "}",
        "export class NearbyReader {",
        "  constructor(private settings: SettingsService) {}",
        "  read() { return this.settings.get('SIGNING_TOKEN'); }",
        "}",
      ].join("\n"),
    );
    execFileSync("git", ["-C", root, "add", "reader.ts"]);
    const { part, evidence, checks } = packedEvidence(
      root,
      "Which injected configuration provider supplies SIGNING_TOKEN in DesiredReader?",
    );
    const requirements = checks.checklist(
      part,
      evidence.map((item, i) => ({ ...item, ref: `E${i}` })),
    );
    const injections = requirements.filter((item) =>
      /constructor injection/.test(item.requirement),
    );
    assert.equal(injections.length, 1);
    assert.deepEqual(injections[0].alternative_ref_sets, []);
    assert.ok(!requirements.some((item) => /reader.ts:6/.test(item.requirement)));
  }));

test("initialization-order packing preserves loader options and import-time capture but requires review", () =>
  provenanceFixture((root) => {
    const query =
      "Does SignerModule use its imported configuration constant before environment initialization?";
    const { part, evidence, candidates, checks } = packedEvidence(root, query);
    for (const text of [
      "config as load",
      "load({",
      "path: '.env.runtime'",
      "SIGNING_TOKEN =",
      "JwtModule.register",
      "class SignerModule",
    ])
      assert.ok(
        evidence.some((item) => item.quote.includes(text)),
        text,
      );
    assert.ok(new Set(candidates.map((item) => item.file)).size <= 6);
    const missing = checks.missing(part, evidence);
    assert.ok(missing.includes("configuration initialization order requires parent review"));
    assert.ok(!missing.some((name) => /configuration initialization loader/.test(name)));
    assert.equal(part.completeness, "unchecked");
  }));

test("dotenv imports and aliases are loader context, while unrelated or shadowed loaders stay unresolved", () => {
  const query = "Explain configuration initialization order before environment reads.";
  for (const source of [
    "import 'dotenv/config';",
    "import dotenv from 'dotenv';\ndotenv.config({ path: '.env.test' });",
    "import * as env from 'dotenv';\nenv.config();",
    "import { config as load } from 'dotenv';\nload();",
  ])
    assert.ok(
      parseConfigurationContexts(source, "boot.ts", query).some(
        (context) => context.lines.length > 0,
      ),
    );
  assert.deepEqual(
    parseConfigurationContexts(
      "import { config as load } from './custom';\nload();",
      "boot.ts",
      query,
    ),
    [],
  );
  assert.ok(
    parseConfigurationContexts(
      "import { config as load } from 'dotenv';\nfunction demo(load) { load(); }",
      "boot.ts",
      query,
    ).every((context) => !context.lines.length),
  );
});

test("complete constant and loader selection remains under review and oversized initializers refuse generation", () =>
  provenanceFixture(async (root) => {
    const query =
      "Does SignerModule use its imported configuration constant before environment initialization?";
    let calls = 0;
    const generate = async (_model: string, prompt: string) => {
      calls++;
      const parts = JSON.parse(
        prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
      ) as { relationships: { alternative_ref_sets: string[][] }[] }[];
      const refs = [
        ...new Set(parts[0].relationships.flatMap((group) => group.alternative_ref_sets[0] ?? [])),
      ];
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: refs }],
        confidence: "high",
        unresolved: [],
        next_action: { ref: "" },
      });
    };
    const budget: typeof resolveModelBudget = (model, overrides) =>
      resolveModelBudget(model, overrides, async () => ({
        parameters: "num_ctx 50000\nnum_predict 2048",
      }));
    const result = await runLocalExploreRepo(
      { repository_root: root, query, model: "fixture:constant" },
      generate,
      budget,
    );
    assert.equal(result.status, "needs_review");
    assert.ok(result.evidence.some((item) => item.quote.includes("SIGNING_TOKEN =")));
    assert.ok(result.evidence.some((item) => item.quote.includes("path: '.env.runtime'")));
    assert.ok(
      result.unresolved.some((item) =>
        item.includes("initialization order requires parent review"),
      ),
    );
    const before = calls;
    writeFileSync(
      join(root, "constants.ts"),
      `export const SIGNING_TOKEN = [\n${Array.from({ length: 500 }, (_, i) => `  '${i}${"x".repeat(100)}',`).join("\n")}\n];\n`,
    );
    const oversized = await runLocalExploreRepo(
      { repository_root: root, query, model: "fixture:constant" },
      generate,
      budget,
    );
    assert.equal(oversized.packing_overflow, true);
    assert.equal(calls, before);
  }));

test("direct registration requires the call while guarded tool registration still requires its guard", () => {
  const evidence = [
    {
      id: "C1",
      file: "module.ts",
      line: 1,
      quote: "const signer = JwtModule.register({ secret: token });",
    },
  ];
  assert.deepEqual(
    missingEvidenceRequirements(
      decomposeQuestion("Where is the signer registered?")[0],
      evidence,
      "",
    ),
    [],
  );
  assert.ok(
    missingEvidenceRequirements(
      decomposeQuestion("Where is the worker tool registered?")[0],
      [{ ...evidence[0], quote: "registerWorker(server);" }],
      "",
    ).includes("registration guard"),
  );
});

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

test("initialization context recognizes imported aliases and preserves multiline options", () => {
  const source = [
    "import { ConfigModule as Settings } from '@nestjs/config';",
    "export const setup = Settings.forRoot({",
    "  isGlobal: true,",
    "  envFilePath: ['.env.stage', '.env'],",
    "  ignoreEnvFile: false,",
    "});",
  ].join("\n");
  const query = "Where is configuration initialized and which environment files are loaded?";
  const contexts = parseConfigurationContexts(source, "app.ts", query);
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0].lines, [1, 2, 3, 4, 5]);
  assert.equal(decomposeQuestion(query)[0].completeness, "unchecked");
  for (const rejected of [
    source.replace("@nestjs/config", "./unrelated"),
    "// ConfigModule.forRoot({ isGlobal: true })",
    "export const setup = OtherModule.forRoot({ isGlobal: true });",
  ])
    assert.deepEqual(parseConfigurationContexts(rejected, "app.ts", query), []);
  const shadowed = source + "\nfunction demo(Settings: unknown) { return Settings.forRoot({}); }";
  assert.ok(
    parseConfigurationContexts(shadowed, "app.ts", query).every((context) => !context.lines.length),
  );
});

test("factory provenance context pairs the named read with token, injection and parameter", () => {
  const source = [
    "export const providers = [{",
    "  provide: 'MESSAGE_TRANSPORT',",
    "  inject: [Logger, SettingsService],",
    "  useFactory: (logger: Logger, settings: SettingsService) => {",
    "    const channel = settings.get('MESSAGE_CHANNEL', 'console');",
    "    return createTransport(channel);",
    "  },",
    "}];",
  ].join("\n");
  const query = "Which injected configuration provider supplies MESSAGE_CHANNEL?";
  const contexts = parseConfigurationContexts(source, "provider.ts", query);
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0].lines, [2, 3, 4, 5]);
  for (const invalid of [
    source.replace("settings.get", "unrelated.get"),
    source.replace("const channel =", "const settings = other; const channel ="),
    source.replace("inject: [Logger, SettingsService]", "inject: [Logger]"),
    source.replace("inject: [Logger, SettingsService]", "inject: tokens"),
    source.replace("inject: [Logger, SettingsService]", "inject: [...tokens, SettingsService]"),
    source.replace("provide: 'MESSAGE_TRANSPORT',", "provide: 'MESSAGE_TRANSPORT', ...overrides,"),
    source.replace(
      "provide: 'MESSAGE_TRANSPORT',",
      "provide: 'MESSAGE_TRANSPORT', provide: Other,",
    ),
  ])
    assert.ok(
      parseConfigurationContexts(invalid, "provider.ts", query).every(
        (context) => !context.lines.length,
      ),
    );
  const nested = source.replace(
    "const channel = settings.get('MESSAGE_CHANNEL', 'console');",
    "const demo = () => settings.get('MESSAGE_CHANNEL', 'console');",
  );
  assert.deepEqual(parseConfigurationContexts(nested, "provider.ts", query), []);
});

test("constructor context retains the reader parameter and refuses a missing binding", () => {
  const source = [
    "export class Endpoint {",
    "  constructor(private settings: SettingsService) {}",
    ...Array.from({ length: 60 }, () => "// distant reader"),
    "  address() { return this.settings.get('PUBLIC_ADDRESS'); }",
    "}",
  ].join("\n");
  const query = "Which injected configuration provider supplies PUBLIC_ADDRESS?";
  const contexts = parseConfigurationContexts(source, "endpoint.ts", query);
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0].lines, [2, 63]);
  assert.deepEqual(
    parseConfigurationContexts(
      source.replace("this.settings", "this.other"),
      "endpoint.ts",
      query,
    )[0].lines,
    [],
  );
});

test("initialization and factory context packing preserves distant declarations within six files", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "app.ts"),
      "import { ConfigModule as Settings } from '@nestjs/config';\nimport { chooseDelivery } from './delivery.js';\nexport const init = Settings.forRoot({ isGlobal: true, envFilePath: '.env.dev' });\n",
    );
    writeFileSync(
      join(root, "factory.ts"),
      [
        "import { chooseDelivery } from './delivery.js';",
        "export const provider = {",
        "  provide: 'DELIVERY',",
        ...Array.from({ length: 55 }, () => "// separated factory options"),
        "  inject: [SettingsService],",
        ...Array.from({ length: 55 }, () => "// separated factory options"),
        "  useFactory: (settings: SettingsService) => settings.get('DELIVERY_CHANNEL', 'console'),",
        "};",
      ].join("\n"),
    );
    execFileSync("git", ["-C", root, "add", "app.ts", "factory.ts"]);
    const query =
      "How is configuration initialized for DELIVERY_CHANNEL with the provider injecting its settings?";
    const index = indexRepository(root);
    const part = decomposeQuestion(query)[0];
    const candidates = buildCandidates(root, [], index, query, part);
    for (const text of [
      "envFilePath",
      "provide: 'DELIVERY'",
      "inject: [SettingsService]",
      "useFactory:",
    ])
      assert.ok(
        candidates.some((candidate) => candidate.lines.some((line) => line.text.includes(text))),
        text,
      );
    assert.ok(new Set(candidates.map((candidate) => candidate.file)).size <= 6);
    const evidence = candidates.flatMap((candidate) =>
      candidate.lines.map((line) => ({
        id: candidate.id,
        file: candidate.file,
        line: line.line,
        quote: line.text,
        ref: `${candidate.file}:${line.line}`,
      })),
    );
    const checks = createRelationshipChecks(root, index);
    assert.deepEqual(checks.missing(part, evidence), []);
    for (const text of ["envFilePath", "provide: 'DELIVERY'", "inject: [SettingsService]"])
      assert.ok(
        checks.missing(
          part,
          evidence.filter((item) => !item.quote.includes(text)),
        ).length > 0,
      );
  }));

test("absent initialization and provider context stay unresolved despite nearby getters", () =>
  fixture((root) => {
    const part = decomposeQuestion(
      "Explain configuration initialization with the provider supplying DELIVERY_CHANNEL.",
    )[0];
    const checks = createRelationshipChecks(root, indexRepository(root));
    const missing = checks.missing(part, []);
    assert.ok(missing.some((name) => name === "configuration initialization context"));
    assert.ok(missing.some((name) => name === "configuration provider provenance context"));
  }));

test("complete initialization citations still require review and oversized options refuse generation", () =>
  fixture(async (root) => {
    const base =
      "import { ConfigModule } from '@nestjs/config';\nexport const init = ConfigModule.forRoot({\n  isGlobal: true,\n});\n";
    writeFileSync(join(root, "app.ts"), base);
    execFileSync("git", ["-C", root, "add", "app.ts"]);
    const query = "Where is application configuration initialized?";
    let calls = 0;
    const generate = async (_model: string, prompt: string) => {
      calls++;
      const parts = JSON.parse(
        prompt.split("Question parts: ")[1].split("\nRelevant repo map:")[0],
      ) as { relationships: { alternative_ref_sets: string[][] }[] }[];
      const refs = [
        ...new Set(parts[0].relationships.flatMap((group) => group.alternative_ref_sets[0] ?? [])),
      ];
      return JSON.stringify({
        part_evidence: [{ part_id: "P1", evidence_refs: refs }],
        confidence: "high",
        unresolved: [],
        next_action: { ref: "" },
      });
    };
    const budget: typeof resolveModelBudget = (model, overrides) =>
      resolveModelBudget(model, overrides, async () => ({
        parameters: "num_ctx 50000\nnum_predict 2048",
      }));
    const result = await runLocalExploreRepo(
      { repository_root: root, query, model: "fixture:initialization" },
      generate,
      budget,
    );
    assert.equal(result.status, "needs_review");
    assert.ok(result.evidence.some((item) => item.quote === "isGlobal: true,"));
    assert.ok(
      !result.unresolved.some((item) => item.includes("configuration initialization context")),
    );
    assert.ok(result.unresolved.some((item) => item.includes("semantic completeness")));
    writeFileSync(
      join(root, "app.ts"),
      base.replace(
        "  isGlobal: true,",
        Array.from({ length: 500 }, (_, i) => `  option${i}: '${"x".repeat(100)}',`).join("\n"),
      ),
    );
    const before = calls;
    const oversized = await runLocalExploreRepo(
      { repository_root: root, query, model: "fixture:initialization" },
      generate,
      budget,
    );
    assert.equal(oversized.packing_overflow, true);
    assert.equal(calls, before);
  }));
