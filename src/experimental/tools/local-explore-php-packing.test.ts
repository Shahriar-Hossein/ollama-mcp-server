import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { indexRepository } from "../../explorer/indexer.js";
import {
  buildCandidates, compileEvidenceBundles, MAX_CONTEXT_CHARS, MAX_LINE_CHARS,
} from "./local-explore-packing.js";
import { decomposeQuestion } from "./local-explore-repo.js";

const startup = [
  "<?php",
  "use Launch\\Executor;",
  "require_once __DIR__ . '/options.php';",
  "if (getenv('START_TASK') === 'yes') {",
  "  return ['mode' => 'active', 'attempts' => 3];",
  "} else {",
  "  return ['mode' => 'paused', 'attempts' => 0];",
  "}",
].join("\n");
const options = "<?php\nreturn ['region' => 'north', 'budget' => 17];\n";

function fixture(sources: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "php-packing-"));
  try {
    for (const [file, source] of Object.entries(sources)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), source);
    }
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"]);
    run(root);
    for (const [file, source] of Object.entries(sources)) {
      assert.equal(readFileSync(join(root, file), "utf8"), source);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("named top-level PHP sources pack guards, literal entries and include context without symbols", () => {
  fixture({ "setup/startup.php": startup, "setup/options.php": options }, (root) => {
    const index = indexRepository(root);
    assert.equal(index.symbols.length, 0);
    const query = "Explain startup.php and options.php guards and literal settings.";
    const parts = decomposeQuestion(query);
    const pool = buildCandidates(root, [], index, query, parts[0]);
    const packed = compileEvidenceBundles(parts, new Map([[parts[0].id, pool]]));
    assert.equal(packed.overflow, false);
    assert.deepEqual(packed.candidates.map((candidate) => candidate.file), ["setup/startup.php", "setup/options.php"]);
    for (const file of ["setup/startup.php", "setup/options.php"]) {
      const candidate = packed.candidates.find((item) => item.file === file);
      assert.ok(candidate);
      const lines = readFileSync(join(root, file), "utf8").split("\n");
      for (const line of candidate.lines) assert.equal(line.text, lines[line.line - 1]);
    }
    for (const line of [2, 3, 4, 5, 6, 7]) {
      assert.ok(packed.candidates[0].lines.some((item) => item.line === line && item.text === startup.split("\n")[line - 1]));
    }
    assert.ok(packed.candidates[1].lines.some((line) => line.text === options.split("\n")[1]));
  });
});

test("qualified PHP target wins duplicate basenames and unknown or unsafe targets add nothing", () => {
  fixture({ "setup/options.php": options, "other/options.php": "<?php\nreturn ['region' => 'south'];" }, (root) => {
    const index = indexRepository(root);
    assert.deepEqual(buildCandidates(root, [], index, "Read setup/options.php").map((item) => item.file), ["setup/options.php"]);
    for (const query of ["Read options.php", "Read missing/options.php", "Read ../options.php", "Read /setup/options.php", "Read C:\\setup\\options.php"]) {
      assert.deepEqual(buildCandidates(root, [], index, query), [], query);
    }
  });
});

test("named PHP context keeps separated include, guard and scalar-entry windows", () => {
  const source = [
    "<?php", "require_once __DIR__ . '/limits.php';",
    ...Array.from({ length: 45 }, (_, i) => `// spacer a${i}`),
    "if (getenv('RUN_SIGNAL') !== 'ready') { return []; }",
    ...Array.from({ length: 45 }, (_, i) => `// spacer b${i}`),
    "$limits = [", "  'ceiling' => 23,", "  'zone' => 'west',", "];",
  ].join("\n");
  fixture({ "setup/separated.php": source }, (root) => {
    const index = indexRepository(root);
    assert.equal(index.symbols.length, 0);
    const pool = buildCandidates(root, [], index, "Explain separated.php");
    const lines = pool[0].lines;
    for (const text of ["require_once __DIR__ . '/limits.php';", "if (getenv('RUN_SIGNAL') !== 'ready') { return []; }", "  'ceiling' => 23,", "  'zone' => 'west',"]) {
      const line = source.split("\n").indexOf(text) + 1;
      assert.ok(lines.some((item) => item.line === line && item.text === text), text);
    }
  });
});

test("explicit PHP file reserves a slot before six unrelated indexed sources", () => {
  const sources: Record<string, string> = { "setup/startup.php": startup };
  for (let i = 0; i < 6; i++) sources[`other/ranked${i}.ts`] = `export function ranked${i}() { return 'startup settings guards'; }`;
  fixture(sources, (root) => {
    const index = indexRepository(root);
    assert.equal(new Set(index.symbols.map((item) => item.file)).size, 6);
    const query = "Explain startup.php settings guards";
    const parts = decomposeQuestion(query);
    const pool = buildCandidates(root, [], index, query, parts[0]);
    assert.equal(pool[0].file, "setup/startup.php");
    assert.ok(new Set(pool.map((item) => item.file)).size <= 6);
    const packed = compileEvidenceBundles(parts, new Map([[parts[0].id, pool]]));
    assert.equal(packed.candidates[0].file, "setup/startup.php");
    assert.equal(packed.overflow, false);
  });
});

test("PHP windows retain line bounds and global packing overflow", () => {
  const large = ["<?php", ...Array.from({ length: 200 }, (_, i) =>
    i % 30 === 0 ? "if (getenv('START_TASK')) { return ['limit' => 9]; }" : `// padding ${i} ${"x".repeat(190)}`,
  )].join("\n");
  fixture({ "setup/first.php": large, "setup/second.php": large, "setup/third.php": large, "setup/fourth.php": large }, (root) => {
    const query = "Explain first.php second.php guards";
    const parts = decomposeQuestion(query);
    const pool = buildCandidates(root, [], indexRepository(root), query, parts[0]);
    assert.equal(pool.length, 2);
    for (const candidate of pool) {
      assert.ok(candidate.lines.length <= 6 * 20);
      assert.ok(candidate.lines.every((line) => line.text.length <= MAX_LINE_CHARS));
    }
    const other = { ...parts[0], id: "P2", question: "Explain third.php fourth.php guards" };
    const otherPool = buildCandidates(root, [], indexRepository(root), other.question, other);
    const packed = compileEvidenceBundles([...parts, other], new Map([[parts[0].id, pool], [other.id, otherPool]]));
    assert.ok(packed.candidates.flatMap((item) => item.lines).reduce((sum, line) => sum + line.text.length, 0) > MAX_CONTEXT_CHARS);
    assert.equal(packed.overflow, true);
  });
});

test("non-PHP and unanchored queries retain ordinary indexed retrieval", () => {
  fixture({ "setup/startup.php": startup, "other/task.ts": "export function launchTask() { return 'launcher'; }" }, (root) => {
    const index = indexRepository(root);
    const before = buildCandidates(root, [], index, "Explain launchTask launcher");
    const after = buildCandidates(root, [], index, "Explain launchTask launcher absent.php");
    assert.deepEqual(after, before);
    assert.ok(before.length > 0);
    assert.ok(before.every((candidate) => candidate.file === "other/task.ts"));
  });
});

test("PHP anchor read rejects tracked symlinks outside the root", () => {
  fixture({ "setup/startup.php": startup }, (root) => {
    const outside = join(tmpdir(), `php-outside-${process.pid}.php`);
    try {
      writeFileSync(outside, "<?php return [];\n");
      symlinkSync(outside, join(root, "external.php"));
      execFileSync("git", ["-C", root, "add", "external.php"]);
      assert.throws(() => buildCandidates(root, [], indexRepository(root), "Read external.php"), /outside repository/);
    } finally {
      rmSync(outside, { force: true });
    }
  });
});
