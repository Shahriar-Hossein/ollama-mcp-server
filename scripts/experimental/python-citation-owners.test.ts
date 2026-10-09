import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import type { EvidenceLine } from "./scope-answer-context.js";
import type { CitationFixture, CitationRef } from "./citation-eval-fixture.js";
import { pythonCitationOwners, reviewPythonCitations } from "./python-citation-owners.js";
import { MAX_CONTEXT_CHARS } from "../../src/experimental/tools/local-explore-packing.js";
const frozenRoot = resolve("scripts/experimental/fixtures/citation-eval/source");
const fixture: CitationFixture = JSON.parse(readFileSync("docs/experimental/benchmarks/runs/2026-10-09-citation-eval.json", "utf8"));
const evidence = (r: CitationRef): EvidenceLine => ({ file: r.file, line: r.line, quote: r.text });
const loc = (r: CitationRef) => ({ file: r.file, line: r.line });
for (const c of fixture.cases) {
  test(`frozen ${c.id}: lexical review cues independent of ${c.claim_truth} truth`, () => {
    const review = reviewPythonCitations(frozenRoot, evidence(c.target), c.citations.map(evidence));
    assert.equal(review.status, "needs_review");
    assert.deepEqual(review.resolved_target, loc(c.target));
    assert.deepEqual(review.foreign_owner_citations, c.expected_foreign.map(loc));
    assert.deepEqual(review.unresolved_citations, c.expected_unresolved.map(loc));
    if (c.id === "CLEAN-CONTRAST") {
      assert.equal(c.claim_truth, "correct");
      assert.ok(review.foreign_owner_citations.length);
    }
    if (c.id === "UNKNOWN") assert.deepEqual(review.reasons, ["no_citations"]);
  });
}
function temporary(source: string, run: (root: string, ref: (line: number, file?: string) => EvidenceLine) => void) {
  const root = mkdtempSync(resolve(tmpdir(), "python-owner-"));
  writeFileSync(resolve(root, "sample.py"), source);
  try {
    run(root, (line, file = "sample.py") => ({ file, line, quote: readFileSync(resolve(root, file), "utf8").split("\n")[line - 1] }));
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("nested function headers and bodies use the nearest function", () => {
  temporary('def outer():\n    def inner():\n        return "inner"\n    return "outer"\n', (root, ref) => {
    assert.deepEqual(pythonCitationOwners(root, [ref(1), ref(2), ref(3), ref(4)]).map(r => r.owner),
      [1, 2, 2, 1].map(line => ({ file: "sample.py", line })));
    assert.deepEqual(reviewPythonCitations(root, ref(2), [ref(3)]).resolved_target, { file: "sample.py", line: 2 });
  });
});
test("class and lambda scopes block outer function attribution", () => {
  temporary('def outer():\n    class Inner:\n        value = 1\n        def method(self):\n            return 2\n    callback = lambda: 3\n    return callback\n', (root, ref) => {
    assert.deepEqual(pythonCitationOwners(root, [ref(2), ref(3), ref(4), ref(5), ref(6), ref(7)]).map(r => r.owner),
      [null, null, { file: "sample.py", line: 4 }, { file: "sample.py", line: 4 }, null, { file: "sample.py", line: 1 }]);
  });
});
test("malformed sources and multiple scopes starting on one row stay unresolved", () => {
  temporary('def broken(:\n    return 1\n', (root, ref) => {
    const result = reviewPythonCitations(root, ref(1), [ref(2)]);
    assert.equal(result.resolved_target, null);
    assert.deepEqual(result.reasons, ["unresolved_target", "unknown_owners"]);
    assert.deepEqual(result.unresolved_citations, [{ file: "sample.py", line: 2 }]);
    assert.throws(() => pythonCitationOwners(root, [{ ...ref(2), quote: "return" }]), /quote differs/);
  });
  temporary('def outer():\n    callback = lambda: (lambda: 2)\n    return callback\n', (root, ref) => {
    assert.equal(pythonCitationOwners(root, [ref(2)])[0].owner, null);
  });
});
test("body and module target locations are not inferred declarations; null target remains unresolved", () => {
  temporary('VALUE = 1\ndef work():\n    return VALUE\n', (root, ref) => {
    for (const target of [null, ref(1), ref(3)]) {
      const review = reviewPythonCitations(root, target, [ref(3)]);
      assert.equal(review.resolved_target, null);
      assert.deepEqual(review.foreign_owner_citations, []);
      assert.deepEqual(review.unresolved_citations, [{ file: "sample.py", line: 3 }]);
      assert.ok(review.reasons.includes("unresolved_target"));
    }
  });
});
test("complete trimmed quotes pass; invalid lines, partial quotes and unsafe paths throw", () => {
  temporary('def work():\n    return 1\n', (root, ref) => {
    assert.equal(pythonCitationOwners(root, [{ ...ref(2), quote: "return 1" }])[0].owner?.line, 1);
    assert.equal(pythonCitationOwners(root, [{ ...ref(2), quote: "  return 1  " }])[0].owner?.line, 1);
    for (const invalid of [
      { ...ref(2), line: 0 }, { ...ref(2), line: 1.5 }, { ...ref(2), line: 50 },
      { ...ref(2), quote: "return" }, { ...ref(2), quote: "return 2" }, { ...ref(2), file: "../sample.py" },
      { ...ref(2), file: resolve(root, "sample.py") }, { ...ref(2), file: "sample.txt" },
    ]) assert.throws(() => pythonCitationOwners(root, [invalid]));
    const outside = mkdtempSync(resolve(tmpdir(), "python-owner-outside-"));
    try {
      writeFileSync(resolve(outside, "outside.py"), 'def work():\n    return 1\n');
      symlinkSync(resolve(outside, "outside.py"), resolve(root, "escape.py"));
      assert.throws(() => pythonCitationOwners(root, [{ ...ref(2), file: "escape.py" }]), /outside repository/);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});
test("reference and unique-file/source caps reject overflow without truncation", () => {
  temporary('def work():\n    return 1\n', (root, ref) => {
    assert.equal(pythonCitationOwners(root, Array.from({ length: 96 }, () => ref(2))).length, 96);
    assert.throws(() => pythonCitationOwners(root, Array.from({ length: 97 }, () => ref(2))), /positions/);
    assert.throws(() => reviewPythonCitations(root, ref(1), Array.from({ length: 96 }, () => ref(2))), /positions/);
    const files: EvidenceLine[] = [];
    for (let i = 0; i < 7; i++) {
      const file = `file${i}.py`; writeFileSync(resolve(root, file), "VALUE = 1\n");
      files.push({ file, line: 1, quote: "VALUE = 1" });
    }
    assert.equal(pythonCitationOwners(root, files.slice(0, 6)).length, 6);
    assert.throws(() => pythonCitationOwners(root, files), /files/);
    writeFileSync(resolve(root, "big.py"), "VALUE = 1\n" + " ".repeat(MAX_CONTEXT_CHARS));
    assert.throws(() => pythonCitationOwners(root, [{ file: "big.py", line: 1, quote: "VALUE = 1" }]), /character cap/);
    const chunk = "VALUE = 1\n" + " ".repeat(MAX_CONTEXT_CHARS / 2);
    writeFileSync(resolve(root, "a.py"), chunk); writeFileSync(resolve(root, "b.py"), chunk);
    assert.throws(() => pythonCitationOwners(root, ["a.py", "b.py"].map(file => ({ file, line: 1, quote: "VALUE = 1" }))), /character cap/);
  });
});
test("duplicates preserve input positions, review cues deduplicate, and request caches refresh", () => {
  temporary('def first():\n    return 1\ndef second():\n    return 2\n', (root, ref) => {
    const target = ref(3), refs = [ref(2), ref(2)];
    const before = structuredClone({ target, refs });
    const review = reviewPythonCitations(root, target, refs);
    assert.equal(review.owners.length, 2);
    assert.deepEqual(review.foreign_owner_citations, [{ file: "sample.py", line: 2 }]);
    review.owners[0].citation.line = 99;
    assert.deepEqual({ target, refs }, before);
    writeFileSync(resolve(root, "sample.py"), 'VALUE = 0\nVALUE = 1\n');
    assert.equal(pythonCitationOwners(root, [ref(2)])[0].owner, null);
    assert.throws(() => pythonCitationOwners(root, refs), /quote differs/);
  });
});
