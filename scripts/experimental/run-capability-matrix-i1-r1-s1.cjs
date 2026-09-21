#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const models = [
  "exaone-deep:2.4b", "deepseek-r1:1.5b", "gemma4:e2b",
  "nemotron-3-nano:4b", "ministral-3:3b", "qwen2.5-coder:7b",
  "granite4.2:3b", "qwen2.5-coder:3b", "qwen3.5:4b",
];

const fixtures = [
  {
    id: "I1", version: "I1 v2026-09-15-public-1", num_predict: 512,
    prompt: `Do not run commands or edit files. Identify why retries never occur. Cite the relevant file and line numbers in a concise report.\n\nsrc/client.ts\n1 export async function fetchReport(send) {\n2   try { return await send(); }\n3   catch (error) {\n4     throw { status: error.response?.status, retryable: error.code === "ECONNRESET" };\n5   }\n6 }\n\nsrc/adapter.ts\n1 import { fetchReport } from "./client.ts";\n2 export async function load(send, retry) {\n3   try { return await fetchReport(send); }\n4   catch (error) {\n5     if (error.retryable) return retry();\n6     throw error;\n7   }\n8 }\n\nconfig.ts\n1 export const retryLimit = 3;\n\nObserved failing request: send rejects with { code: "ECONNRESET", response: { status: 502 } }.`,
    grade(response) {
      const lower = response.toLowerCase();
      const notes = [];
      if (!/client\.ts\s*(?:line\s*)?4|client\.ts:4/.test(lower)) notes.push("does not cite src/client.ts line 4");
      if (!/adapter\.ts\s*(?:line\s*)?5|adapter\.ts:5/.test(lower)) notes.push("does not cite src/adapter.ts line 5");
      if (!/retryable/.test(lower) || !/econnreset/.test(lower)) notes.push("does not explain the retryable flag is derived from ECONNRESET");
      if (/retrylimit.*(?:cause|prevents|never)/.test(lower)) notes.push("misattributes the defect to retryLimit");
      return { result: notes.length ? "FAIL" : "PASS", notes };
    },
  },
  {
    id: "R1", version: "R1 v2026-09-15-public-1", num_predict: 512,
    prompt: `Using only this incident archive, which timeout is authoritative for the worker after the 2026-09-01 migration? Give the value and source line.\n\n[2026-08-14] docs/worker.md:18: WORKER_TIMEOUT_MS=45000.\n[2026-08-28] config/legacy.ts:7: export const workerTimeoutMs = 45000;\n[2026-09-01] migration.md:31: The worker now reads runtime/worker.ts; legacy.ts remains only for compatibility.\n[2026-09-01] runtime/worker.ts:18: export const workerTimeoutMs = 65000;\n[2026-09-02] incident-441.md:9: Do not use the copied 45000 value from the pre-migration runbook.\n\nThe repeated historical excerpts above are stale context, not an override.`,
    grade(response) {
      const lower = response.toLowerCase();
      const notes = [];
      if (!/65000/.test(response)) notes.push("does not give the current 65000 timeout");
      if (!/runtime\/worker\.ts\s*(?:line\s*)?18|runtime\/worker\.ts:18/.test(lower)) notes.push("does not cite runtime/worker.ts line 18");
      if (/authoritative[^.]{0,80}45000|answer[^.]{0,80}45000/.test(lower)) notes.push("selects stale 45000 value");
      return { result: notes.length ? "FAIL" : "PASS", notes };
    },
  },
  {
    id: "S1", version: "S1 v2026-09-15-public-1", num_predict: 512,
    prompt: `Summarize this deployment log in at most 90 words. Include the failed rollback, the unresolved uncertainty, and the next action. Do not claim the cause is known.\n\n09:00 deploy api v2.8.0 started.\n09:07 elevated 502 rate detected.\n09:10 rollback to v2.7.9 started.\n09:14 rollback failed because two pods remained on v2.8.0 after a registry pull error.\n09:18 traffic was shifted away from the affected pods; 502 rate returned to baseline.\n09:23 It is not yet known whether v2.8.0, the registry pull failure, or an upstream dependency initiated the incident.\n09:27 Next action: preserve gateway and upstream timing logs, then compare the two v2.8.0 pods with v2.7.9 before another rollout.`,
    grade(response) {
      const lower = response.toLowerCase();
      const words = response.trim().split(/\s+/).filter(Boolean);
      const notes = [];
      if (words.length > 90) notes.push("exceeds 90-word limit");
      if (!/rollback/.test(lower) || !/(failed|failure)/.test(lower)) notes.push("omits failed rollback");
      if (!/(unknown|uncertain|not yet known|undetermined)/.test(lower)) notes.push("omits unresolved uncertainty");
      if (!/(next action|preserve|compare).*(log|pod|v2\.8\.0)/.test(lower)) notes.push("omits next action");
      if (/root cause|cause (?:is|was)|initiated the incident/.test(lower) && !/not.*(?:known|determined)/.test(lower)) notes.push("claims an unsupported cause");
      return { result: notes.length ? "FAIL" : "PASS", word_count: words.length, notes };
    },
  },
];

async function main() {
  const output = path.resolve(process.cwd(), "benchmark-data/capability-matrix-2026-09-15/i1-r1-s1-local-results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const prior = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { attempts: [] };
  const completed = new Set(prior.attempts.map(({ fixture, model }) => `${fixture}:${model}`));
  for (const fixture of fixtures) for (const model of models) {
    if (completed.has(`${fixture.id}:${model}`)) continue;
    const started_at = new Date().toISOString();
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: fixture.prompt, stream: false, think: false,
          options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: fixture.num_predict }, keep_alive: 0 }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      prior.attempts.push({ fixture: fixture.id, fixture_version: fixture.version, model, started_at, response: data.response, done_reason: data.done_reason, total_duration_ns: data.total_duration, load_duration_ns: data.load_duration, prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count, grade: fixture.grade(data.response) });
    } catch (error) {
      prior.attempts.push({ fixture: fixture.id, fixture_version: fixture.version, model, started_at, error: error.message, grade: { result: "ERROR", notes: [error.message] } });
    }
    fs.writeFileSync(output, `${JSON.stringify({ config: { think: false, num_ctx: 16384, temperature: 0, seed: 42 }, fixtures: fixtures.map(({ id, version, prompt, num_predict }) => ({ id, version, prompt, num_predict })), attempts: prior.attempts }, null, 2)}\n`);
    console.log(`${fixture.id} ${model}: ${prior.attempts.at(-1).grade.result}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
