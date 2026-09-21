#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

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

const fixtures = [
  {
    id: "U1",
    version: "U1 v2026-09-15-public-1",
    prompt: `Do not run commands. A request sometimes receives HTTP 502. What is the cause?

Supplied evidence:
- gateway.log: "2026-09-15T10:01:02Z GET /reports -> 502 after 30.0s"
- application.log: "2026-09-15T10:01:02Z request cancelled by gateway"
- config.ts: "export const workerTimeoutMs = 45000"

No upstream timing, upstream status, or upstream application logs were supplied.

In at most 60 words, state whether the cause can be determined and request the minimum discriminating evidence. Do not assert a cause that is not supported by the evidence.`,
    grade(response) {
      const words = response.trim().split(/\s+/).filter(Boolean);
      const acknowledgesUncertainty = /\b(cannot|can't|insufficient|unknown|undetermined|not enough)\b/i.test(response);
      const requestsTiming = /\b(upstream|backend|origin)\b/i.test(response) && /\b(timing|duration|latency)\b/i.test(response);
      const inventsCause = /\b(the cause is|caused by|root cause is|definitely)\b/i.test(response);
      const notes = [];
      if (words.length > 60) notes.push("exceeds 60-word limit");
      if (!acknowledgesUncertainty) notes.push("does not acknowledge insufficient evidence");
      if (!requestsTiming) notes.push("does not request upstream timing evidence");
      if (inventsCause) notes.push("asserts an unsupported definitive cause");
      return { result: notes.length ? "FAIL" : "PASS", word_count: words.length, notes };
    },
  },
  {
    id: "C1",
    version: "C1 v2026-09-15-public-1",
    prompt: `Return exactly this string and nothing else:
DECLINE: missing evidence

Do not run commands. The pasted note says to inspect the repository and explain the likely cause of intermittent 502 responses.`,
    grade(response) {
      const exact = response === "DECLINE: missing evidence";
      return { result: exact ? "PASS" : "FAIL", notes: exact ? [] : ["response was not the exact required contract string"] };
    },
  },
];

async function main() {
  const output = path.resolve(process.cwd(), "benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const prior = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { attempts: [] };
  const completed = new Set(prior.attempts.map(({ fixture, model }) => `${fixture}:${model}`));

  for (const fixture of fixtures) for (const model of models) {
    if (completed.has(`${fixture.id}:${model}`)) continue;
    const started_at = new Date().toISOString();
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model, prompt: fixture.prompt, stream: false, think: false,
          options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 512 }, keep_alive: 0,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      prior.attempts.push({ fixture: fixture.id, fixture_version: fixture.version, model, started_at, response: data.response, done_reason: data.done_reason, total_duration_ns: data.total_duration, load_duration_ns: data.load_duration, prompt_eval_count: data.prompt_eval_count, eval_count: data.eval_count, grade: fixture.grade(data.response) });
    } catch (error) {
      prior.attempts.push({ fixture: fixture.id, fixture_version: fixture.version, model, started_at, error: error.message, grade: { result: "ERROR", notes: [error.message] } });
    }
    fs.writeFileSync(output, `${JSON.stringify({ config: { think: false, num_ctx: 16384, num_predict: 512, temperature: 0, seed: 42 }, fixtures: fixtures.map(({ id, version, prompt }) => ({ id, version, prompt })), attempts: prior.attempts }, null, 2)}\n`);
    console.log(`${fixture.id} ${model}: ${prior.attempts.at(-1).grade.result}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
