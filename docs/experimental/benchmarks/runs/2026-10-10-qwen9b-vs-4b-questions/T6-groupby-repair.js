/*
T6 - groupBy repair (hard pass, JavaScript)

Run 2026-10-10: tool run_ollama_task, timeout 180 s, no system prompt set. The harness then used its default system prompt "You are a specialized sub-agent assistant." Prompt verbatim from scripts/experimental/run-capability-matrix-f1.cjs (checked identical).

# T6 - HARD PASS: spec-sensitive code fix (4B passed)
Tool: run_ollama_task (timeout_ms=180000)
system_prompt: (none)
prompt (verbatim from scripts/experimental/run-capability-matrix-f1.cjs):
```
Return bare JavaScript only: no Markdown fences, prose, imports, exports, or tests.

Repair this function:

function groupBy(rows) {
  const groups = {};
  for (const row of rows) (groups[row.kind] ||= []).push(row);
  return groups;
}

Contract:
- Return a Map whose keys are each row's kind values and whose values are arrays of the original row objects.
- Both keys and rows within each group must retain first-seen input order. This includes numeric-like string keys such as "10" and "2".
- The key "__proto__" must work as an ordinary key.
- Do not mutate the input array or any row object.
- Throw TypeError when rows is not an array.

Return the repaired groupBy function declaration only.
```
## Original 4B outcome
runs/2026-09-16-capability-matrix-results.md, F1 `qwen3.5:4b` (think:false, ctx16K) PASS 14.45 s: bare source; Map order, __proto__, immutability, TypeError all correct. (Base qwen3.5:4b, not the H tag; of 8 small models, 4 failed this.) Hidden grader: grade() in the f1 script.

## Rubric (run grader logic in a VM: node script with the script's rows [{kind:"10"},{kind:"__proto__"},{kind:"2"},{kind:"10"},{kind:"alpha"},{kind:"__proto__"}])
Pass: bare source (no ``` / <think> / import / export), returns real Map, key order 10,__proto__,2,alpha, groups hold original row objects in order, input JSON unchanged, groupBy(null)/groupBy({}) throw TypeError.
Partial: behavior right but wrapped in fences/prose. Fail: object instead of Map, wrong order, __proto__ broken, or throws wrongly.
*/
