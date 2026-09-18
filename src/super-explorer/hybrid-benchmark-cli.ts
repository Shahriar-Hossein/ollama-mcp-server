import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hybridRetrieve, type RetrievalMode } from "./hybrid-retrieval.js";

const GOLD_COMMIT = "f1a75a19d1708e36f60bba0de76714acc2343492";
const DEFAULT_MODEL = "nomic-embed-text-v2-moe";

const questions = [
  ["SE-01", "Where is local_explorer_task registered, and is it enabled by default?", ["src/index.ts", "src/tools/local-explorer-task.ts"]],
  ["SE-02", "Which environment variables gate the autonomous tools, and which tool does each gate?", ["src/index.ts", "src/tools/run-cloud-claude-task.ts", "src/tools/run-local-worker-task.ts"]],
  ["SE-03", "What host and timeout do ordinary Ollama HTTP calls use, and which operations share them?", ["src/ollama-client.ts"]],
  ["SE-04", "Trace the timeout error shown by run_ollama_task to the shared client configuration.", ["src/tools/run-ollama-task.ts", "src/ollama-client.ts"]],
  ["SE-05", "How does the local worker prevent a model-supplied git command from using shell chaining?", ["src/shell-allowlist.ts", "src/tools/run-local-worker-task.ts"]],
  ["SE-06", "What independently validates Bash commands for the cloud Claude worker, and how is it attached?", ["src/tools/run-cloud-claude-task.ts", "scripts/validate-cloud-bash.cjs"]],
  ["SE-07", "Which functions stop a local explorer model from reading outside its requested repository root?", ["src/tools/local-explorer-task.ts"]],
  ["SE-08", "How are tool-call and distinct-file-read budgets enforced in local_explorer_task?", ["src/tools/local-explorer-task.ts"]],
  ["SE-09", "What is the default model for local exploration, and what evidence justifies treating low-confidence results as untrusted?", ["src/tools/local-explorer-task.ts", "docs/benchmarks/runs/2026-09-16-local-explorer.md"]],
  ["SE-10", "If the cloud Bash validation hook receives invalid JSON, does it block the command?", ["scripts/validate-cloud-bash.cjs"]],
  ["SE-11", "Which commit introduced the local explorer tool, and which source files did that introduction add or change?", ["src/index.ts", "src/tools/local-explorer-task.ts"], "5b0f7d8edecfff3fe2304d8dffc43feff4606412"],
  ["SE-12", "Does this repository define a usable automated test command for the server?", ["package.json"]],
] as const;

function evidenceFiles(evidence: Awaited<ReturnType<typeof hybridRetrieve>>["results"][number]["evidence"]): string[] {
  if (evidence.kind === "git_commit") return evidence.files ?? [];
  return evidence.file ? [evidence.file] : [];
}

function evidenceIsSourceBacked(root: string, evidence: Awaited<ReturnType<typeof hybridRetrieve>>["results"][number]["evidence"]): boolean {
  if (evidence.kind === "git_commit") {
    try {
      execFileSync("git", ["cat-file", "-e", `${evidence.commit_hash}^{commit}`], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  if (!evidence.file || !existsSync(resolve(root, evidence.file))) return false;
  if (evidence.kind !== "json") return true;
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, evidence.file), "utf8")) as { scripts?: Record<string, unknown> };
    const script = evidence.json_pointer?.split("/").at(-1);
    return Boolean(script && parsed.scripts?.[script] === evidence.value);
  } catch {
    return false;
  }
}

const [modeArgument, repositoryRootArgument, limitArgument, modelArgument] = process.argv.slice(2);
if ((modeArgument !== "lexical" && modeArgument !== "hybrid") || !repositoryRootArgument) {
  throw new Error("Usage: benchmark:hybrid <lexical|hybrid> <repository-root> [limit] [embedding-model]");
}
const mode = modeArgument as RetrievalMode;
const root = resolve(repositoryRootArgument);
const limit = limitArgument === undefined ? 10 : Number(limitArgument);
const model = modelArgument ?? DEFAULT_MODEL;
const runs = [];
for (const [benchmark_id, query, gold_files, gold_commit] of questions) {
  const result = await hybridRetrieve(root, query, limit, mode, model);
  const files = new Set(result.results.flatMap(({ evidence }) => evidenceFiles(evidence)));
  const commits = new Set(result.results.flatMap(({ evidence }) => evidence.kind === "git_commit" ? [evidence.commit_hash] : []));
  const expected = [...gold_files, ...(gold_commit ? [gold_commit] : [])];
  const observed = new Set([...files, ...commits]);
  const supported = result.results.every(({ evidence }) => evidenceIsSourceBacked(root, evidence));
  runs.push({
    benchmark_id,
    query,
    retrieval_commit: result.commit_hash,
    gold_files,
    gold_commit: gold_commit ?? null,
    evidence_recall: expected.filter((target) => observed.has(target)).length / expected.length,
    unsupported_results: supported ? 0 : 1,
    results: result.results,
  });
}
const summary = {
  fixture_commit: GOLD_COMMIT,
  retrieval_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  mode,
  limit,
  model: mode === "hybrid" ? model : null,
  full_evidence_recall: runs.reduce((sum, run) => sum + run.evidence_recall, 0) / runs.length,
  unsupported_results: runs.reduce((sum, run) => sum + run.unsupported_results, 0),
  runs,
};
const output = resolve(root, "benchmark-data", `super-explorer-hybrid-${new Date().toISOString().slice(0, 10)}`, `full-${mode}.json`);
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, full_evidence_recall: summary.full_evidence_recall, unsupported_results: summary.unsupported_results })}\n`);
