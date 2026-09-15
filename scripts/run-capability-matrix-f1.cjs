#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const models = [
  "exaone-deep:2.4b",
  "deepseek-r1:1.5b",
  "gemma4:e2b",
  "nemotron-3-nano:4b",
  "ministral-3:3b",
  "qwen2.5-coder:7b",
  "granite4.2:3b",
  "qwen2.5-coder:3b",
  "qwen3.5:4b",
];

const prompt = `Return bare JavaScript only: no Markdown fences, prose, imports, exports, or tests.

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

Return the repaired groupBy function declaration only.`;

function bareSource(source) {
  return !/```|<think>|<thought>|\b(import|export)\b/.test(source);
}

function grade(source) {
  const result = { format: bareSource(source), behavior: false, notes: [] };
  if (!result.format) result.notes.push("response is not bare source");
  try {
    const sandbox = {};
    vm.createContext(sandbox);
    new vm.Script(`"use strict"; ${source}; globalThis.__groupBy = groupBy;`, { timeout: 1000 }).runInContext(sandbox, { timeout: 1000 });
    const groupBy = sandbox.__groupBy;
    if (typeof groupBy !== "function") throw new Error("groupBy was not declared");
    const rows = [
      { kind: "10", id: 1 },
      { kind: "__proto__", id: 2 },
      { kind: "2", id: 3 },
      { kind: "10", id: 4 },
      { kind: "alpha", id: 5 },
      { kind: "__proto__", id: 6 },
    ];
    const before = JSON.stringify(rows);
    const groups = groupBy(rows);
    if (!(groups instanceof Map)) throw new Error("did not return a Map");
    const keys = [...groups.keys()];
    if (JSON.stringify(keys) !== JSON.stringify(["10", "__proto__", "2", "alpha"])) throw new Error(`wrong key order: ${JSON.stringify(keys)}`);
    for (const [key, expectedIds] of [["10", [1, 4]], ["__proto__", [2, 6]], ["2", [3]], ["alpha", [5]]]) {
      const actual = groups.get(key);
      if (!Array.isArray(actual) || JSON.stringify(actual.map((row) => row.id)) !== JSON.stringify(expectedIds)) throw new Error(`wrong group for ${key}`);
    }
    if (JSON.stringify(rows) !== before) throw new Error("mutated input rows");
    let threw = false;
    try { groupBy({}); } catch (error) { threw = error instanceof TypeError; }
    if (!threw) throw new Error("does not throw TypeError for non-array input");
    result.behavior = true;
  } catch (error) {
    result.notes.push(error.message);
  }
  result.result = result.format && result.behavior ? "PASS" : "FAIL";
  return result;
}

async function main() {
  const collectOnly = process.argv.includes("--collect-only");
  const output = path.resolve(process.cwd(), "benchmark-data/capability-matrix-2026-09-15/f1-local-results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const attempts = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")).attempts : [];
  const completedModels = new Set(attempts.map((attempt) => attempt.model));
  for (const model of models) {
    if (completedModels.has(model)) continue;
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 16384 },
          keep_alive: 0,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      attempts.push({ model, started_at: startedAt, response: data.response, done_reason: data.done_reason, total_duration_ns: data.total_duration, load_duration_ns: data.load_duration, prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count, grade: collectOnly ? { result: "PENDING", notes: ["raw completion collected; behavioral grading requires isolated execution"] } : grade(data.response) });
    } catch (error) {
      attempts.push({ model, started_at: startedAt, error: error.message, grade: { result: "ERROR", format: false, behavior: false, notes: [error.message] } });
    }
    fs.writeFileSync(output, `${JSON.stringify({ fixture: "F1 v2026-09-15-public-1", config: { think: false, num_ctx: 16384, num_predict: 16384, temperature: 0, seed: 42 }, prompt, attempts }, null, 2)}\n`);
    console.log(`${model}: ${attempts.at(-1).grade.result}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
