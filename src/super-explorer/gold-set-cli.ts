import { resolve } from "node:path";
import { exploreRepository, type ExploreResult } from "./explore.js";

// Gold questions from docs/super-explorer/benchmarks.md — keep in sync by hand.
const GOLD_QUESTIONS: Record<string, string> = {
  "SE-01": "Where is `local_explorer_task` registered, and is it enabled by default?",
  "SE-02": "Which environment variables gate the autonomous tools, and which tool does each gate?",
  "SE-03": "What host and timeout do ordinary Ollama HTTP calls use, and which operations share them?",
  "SE-04": "Trace the timeout error shown by `run_ollama_task` to the shared client configuration.",
  "SE-05": "How does the local worker prevent a model-supplied git command from using shell chaining?",
  "SE-06": "What independently validates Bash commands for the cloud Claude worker, and how is it attached?",
  "SE-07": "Which functions stop a local explorer model from reading outside its requested repository root?",
  "SE-08": "How are tool-call and distinct-file-read budgets enforced in `local_explorer_task`?",
  "SE-09": "What is the default model for local exploration, and what evidence justifies treating low-confidence results as untrusted?",
  "SE-10": "If the cloud Bash validation hook receives invalid JSON, does it block the command?",
  "SE-11": "Which commit introduced the local explorer tool, and which source files did that introduction add or change?",
  "SE-12": "Does this repository define a usable automated test command for the server?",
};

// These checks deliberately mirror the required relationships in
// docs/super-explorer/benchmarks.md. They provide a repeatable pass/fail
// verdict; detailed benchmark artifacts may still be scored separately.
const GOLD_CHECKS: Record<string, { files: string[]; phrases: string[] }> = {
  "SE-01": { files: ["src/index.ts", "src/tools/local-explorer-task.ts"], phrases: ["unconditional", "local_explorer_task", "cloud_claude_enabled", "local_worker_enabled"] },
  "SE-02": { files: ["src/index.ts", "src/tools/run-cloud-claude-task.ts", "src/tools/run-local-worker-task.ts"], phrases: ["cloud_claude_enabled", "run_cloud_claude_task", "local_worker_enabled", "run_local_worker_task"] },
  "SE-03": { files: ["src/ollama-client.ts"], phrases: ["http://localhost:11434", "120_000", "generate", "listmodels"] },
  "SE-04": { files: ["src/tools/run-ollama-task.ts", "src/ollama-client.ts"], phrases: ["generate", "econnaborted", "request_timeout_ms", "axios"] },
  "SE-05": { files: ["src/shell-allowlist.ts", "src/tools/run-local-worker-task.ts"], phrases: ["metacharacter", "tokenize", "parseallowedgitcommand", "argv", "spawnsync", "without a shell"] },
  "SE-06": { files: ["src/tools/run-cloud-claude-task.ts", "scripts/validate-cloud-bash.cjs"], phrases: ["pretooluse", "bash", "hook", "validator"] },
  "SE-07": { files: ["src/tools/local-explorer-task.ts"], phrases: ["resolvewithinroot", "rungrep", "runread", "outside"] },
  "SE-08": { files: ["src/tools/local-explorer-task.ts"], phrases: ["toolcallcount", "max_tool_calls", "set", "max_files_read"] },
  "SE-09": { files: ["src/tools/local-explorer-task.ts", "docs/benchmarks/local-explorer-2026-09-16.md"], phrases: ["qwen3.5:4b", "low confidence"] },
  "SE-10": { files: ["scripts/validate-cloud-bash.cjs"], phrases: ["invalid json", "exit 0"] },
  "SE-11": { files: ["src/index.ts", "src/tools/local-explorer-task.ts"], phrases: ["5b0f7d8edecfff3fe2304d8dffc43feff4606412", "feat: add local explorer tool"] },
  "SE-12": { files: ["package.json"], phrases: ["no usable automated test", "error: no test specified", "exit 1"] },
};

interface Verdict {
  id: string;
  passed: boolean;
  reasons: string[];
}

function verdictFor(id: string, result?: ExploreResult, error?: string): Verdict {
  if (error) return { id, passed: false, reasons: [error] };
  if (!result) return { id, passed: false, reasons: ["No result returned."] };

  const check = GOLD_CHECKS[id];
  if (!check) return { id, passed: false, reasons: ["No gold check is defined for this question."] };
  const answer = result.answer_to_user.toLowerCase();
  const citations = result.cited_claims.flatMap((claim) => claim.citations).join("\n").toLowerCase();
  const missingFiles = check.files.filter((file) => !citations.includes(file.toLowerCase()));
  const missingPhrases = check.phrases.filter((phrase) => !answer.includes(phrase.toLowerCase()));
  const reasons = [
    ...(missingFiles.length ? [`missing citations: ${missingFiles.join(", ")}`] : []),
    ...(missingPhrases.length ? [`missing required answer details: ${missingPhrases.join(", ")}`] : []),
  ];
  return { id, passed: reasons.length === 0, reasons };
}

const [repositoryRoot, model, ...ids] = process.argv.slice(2);
if (!repositoryRoot) {
  throw new Error(
    "Usage: gold-set:super-explorer <repository-root> [model] [question-id ...]\n" +
      "  With no question-ids, runs SE-01 through SE-05.\n" +
      "  Pass 'all' as the only question-id to run SE-01 through SE-12.",
  );
}

let selected: string[];
if (ids.length === 0) selected = ["SE-01", "SE-02", "SE-03", "SE-04", "SE-05"];
else if (ids.length === 1 && ids[0] === "all") selected = Object.keys(GOLD_QUESTIONS);
else selected = ids;

const root = resolve(repositoryRoot);
const verdicts: Verdict[] = [];
for (const id of selected) {
  const question = GOLD_QUESTIONS[id];
  if (!question) {
    process.stderr.write(`Unknown question id: ${id}\n`);
    continue;
  }
  process.stderr.write(`\n=== ${id}: ${question}\n`);
  const started = Date.now();
  try {
    const result = await exploreRepository({ repository_root: root, question, model });
    process.stdout.write(`${JSON.stringify({ id, latency_ms: Date.now() - started, result })}\n`);
    verdicts.push(verdictFor(id, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ id, latency_ms: Date.now() - started, error: message })}\n`);
    verdicts.push(verdictFor(id, undefined, message));
  }
}

const passed = verdicts.filter((verdict) => verdict.passed);
process.stderr.write(`\n=== FINAL VERDICT: ${passed.length === verdicts.length ? "PASS" : "FAIL"} (${passed.length}/${verdicts.length} passed) ===\n`);
for (const verdict of verdicts) {
  process.stderr.write(`${verdict.passed ? "PASS" : "FAIL"} ${verdict.id}${verdict.reasons.length ? ` — ${verdict.reasons.join("; ")}` : ""}\n`);
}
