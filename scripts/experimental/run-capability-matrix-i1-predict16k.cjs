#!/usr/bin/env node
// Follow-up probe: I1 (bug investigation) ran its Phase-1 screen at num_predict 512,
// far below the plan's 16384 baseline. Every loser's failure was "did not cite" a
// required line, and the slowest losers (granite4.2:3b 27s, qwen2.5-coder:7b 31s)
// ran far longer than the passing model (qwen3.5:4b, 12.53s) - consistent with
// getting cut off mid-investigation rather than a genuine capability gap. This
// reruns the I1 losers once each at num_predict 16384, same prompt/grader/model set
// otherwise, to check whether more output room recovers any of them.
const fs = require("node:fs");
const path = require("node:path");

const I1_PROMPT = `Do not run commands or edit files. Identify why retries never occur. Cite the relevant file and line numbers in a concise report.

src/client.ts
1 export async function fetchReport(send) {
2   try { return await send(); }
3   catch (error) {
4     throw { status: error.response?.status, retryable: error.code === "ECONNRESET" };
5   }
6 }

src/adapter.ts
1 import { fetchReport } from "./client.ts";
2 export async function load(send, retry) {
3   try { return await fetchReport(send); }
4   catch (error) {
5     if (error.retryable) return retry();
6     throw error;
7   }
8 }

config.ts
1 export const retryLimit = 3;

Observed failing request: send rejects with { code: "ECONNRESET", response: { status: 502 } }.`;

function gradeI1(response) {
  const lower = response.toLowerCase();
  const notes = [];
  if (!/client\.ts\s*(?:line\s*)?4|client\.ts:4/.test(lower)) notes.push("does not cite src/client.ts line 4");
  if (!/adapter\.ts\s*(?:line\s*)?5|adapter\.ts:5/.test(lower)) notes.push("does not cite src/adapter.ts line 5");
  if (!/retryable/.test(lower) || !/econnreset/.test(lower)) notes.push("does not explain the retryable flag is derived from ECONNRESET");
  if (/retrylimit.*(?:cause|prevents|never)/.test(lower)) notes.push("misattributes the defect to retryLimit");
  return { result: notes.length ? "FAIL" : "PASS", notes };
}

// Every model except the Phase-1 winner (qwen3.5:4b) and exaone-deep:2.4b
// (q8_0-incompatible, handled separately under f16).
const MODELS = [
  "deepseek-r1:1.5b", "gemma4:e2b", "nemotron-3-nano:4b",
  "ministral-3:3b", "qwen2.5-coder:7b", "granite4.2:3b", "qwen2.5-coder:3b",
];

async function main() {
  const output = path.resolve(process.cwd(), "benchmark-data/capability-matrix-2026-09-16-i1-predict16k/results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const prior = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { attempts: [] };
  const completed = new Set(prior.attempts.map((a) => a.model));
  for (const model of MODELS) {
    if (completed.has(model)) continue;
    const started_at = new Date().toISOString();
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: I1_PROMPT, stream: false, think: false,
          options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 16384 }, keep_alive: 0 }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      prior.attempts.push({ model, started_at, response: data.response, done_reason: data.done_reason,
        total_duration_ns: data.total_duration, load_duration_ns: data.load_duration,
        prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count, grade: gradeI1(data.response) });
    } catch (error) {
      prior.attempts.push({ model, started_at, error: error.message, grade: { result: "ERROR", notes: [error.message] } });
    }
    fs.writeFileSync(output, `${JSON.stringify({ fixture: "I1", fixture_version: "I1 v2026-09-15-public-1", prompt: I1_PROMPT, config: { think: false, num_ctx: 16384, num_predict: 16384, temperature: 0, seed: 42 }, attempts: prior.attempts }, null, 2)}\n`);
    console.log(`I1 ${model}: ${prior.attempts.at(-1).grade.result}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
