import assert from "node:assert/strict";
import test from "node:test";
import { foreignOwnerCitations, type OwnedCitation } from "./citation-owner-check.js";

test("compares owner file and declaration line independently", () => {
  const target = { file: "python/scopes.py", line: 7 };
  const citations: OwnedCitation[] = [
    { citation: { file: target.file, line: 8 }, owner: { ...target } },
    { citation: { file: target.file, line: 16 }, owner: { file: target.file, line: 15 } },
    { citation: { file: "python/other.py", line: 8 }, owner: { file: "python/other.py", line: 7 } },
  ];
  assert.deepEqual(foreignOwnerCitations(target, citations), [citations[1].citation, citations[2].citation]);
});

test("null target and module owners yield no foreign cue", () => {
  const target = { file: "python/scopes.py", line: 15 };
  const moduleCitation: OwnedCitation = { citation: { file: target.file, line: 2 }, owner: null };
  const foreign: OwnedCitation = { citation: { file: target.file, line: 9 }, owner: { file: target.file, line: 7 } };
  assert.deepEqual(foreignOwnerCitations(null, [moduleCitation, foreign]), []);
  assert.deepEqual(foreignOwnerCitations(target, [moduleCitation]), []);
});

test("deduplicates citation locations in first order and copies output without mutation", () => {
  const target = { file: "python/scopes.py", line: 15 };
  const owner = { file: target.file, line: 7 };
  const citations: OwnedCitation[] = [
    { citation: { file: target.file, line: 10 }, owner },
    { citation: { file: target.file, line: 9 }, owner },
    { citation: { file: target.file, line: 10 }, owner },
  ];
  const before = structuredClone({ target, citations });
  const result = foreignOwnerCitations(target, citations);
  assert.deepEqual(result, [{ file: target.file, line: 10 }, { file: target.file, line: 9 }]);
  assert.notStrictEqual(result[0], citations[0].citation);
  result[0].line = 999;
  assert.deepEqual({ target, citations }, before);
});
