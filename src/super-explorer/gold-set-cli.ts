import { resolve } from "node:path";
import { exploreRepository, type ExploreResult } from "./explore.js";

// Gold questions from docs/super-explorer/benchmarks.md — keep in sync by hand.
//
// `group` splits the set by feature area, not randomly, so a train/test split
// can hold out whole areas (e.g. everything about hybrid retrieval) rather
// than individual questions that share an answer with a "trained" sibling.
// See docs/planning/explorer-finetune-plan.md — "Split the gold set by
// repository/feature, not randomly".
const GOLD_GROUPS: Record<string, string> = {
  "SE-01": "core-wiring",
  "SE-02": "core-wiring",
  "SE-03": "ollama-client",
  "SE-04": "ollama-client",
  "SE-05": "shell-safety",
  "SE-06": "shell-safety",
  "SE-07": "local-explorer",
  "SE-08": "local-explorer",
  "SE-09": "local-explorer",
  "SE-10": "shell-safety",
  "SE-11": "repo-meta",
  "SE-12": "repo-meta",
  "SE-13": "discovery",
  "SE-14": "discovery",
  "SE-15": "discovery",
  "SE-16": "discovery",
  "SE-17": "hybrid-retrieval",
  "SE-18": "hybrid-retrieval",
  "SE-19": "hybrid-retrieval",
  "SE-20": "hybrid-retrieval",
  "SE-21": "indexing-knowledge",
  "SE-22": "indexing-knowledge",
  "SE-23": "indexing-knowledge",
  "SE-24": "indexing-knowledge",
  "SE-25": "indexing-knowledge",
  "SE-26": "structural-tools",
  "SE-27": "structural-tools",
  "SE-28": "structural-tools",
  "SE-29": "structural-tools",
  "SE-30": "outline-read-symbol",
  "SE-31": "outline-read-symbol",
  "SE-32": "outline-read-symbol",
  "SE-33": "outline-read-symbol",
  "SE-34": "semantic-search",
  "SE-35": "semantic-search",
  "SE-36": "semantic-search",
  "SE-37": "synthesis-verification",
  "SE-38": "synthesis-verification",
  "SE-39": "synthesis-verification",
  "SE-40": "synthesis-verification",
  "SE-41": "synthesis-verification",
  "SE-42": "framework-adapters",
  "SE-43": "framework-adapters",
  "SE-44": "framework-adapters",
  "SE-45": "framework-adapters",
  "SE-46": "explore-orchestration",
  "SE-47": "explore-orchestration",
  "SE-48": "explore-orchestration",
  "SE-49": "git-history",
  "SE-50": "git-history",
};

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
  "SE-13": "What model does evidence discovery use by default, and what five evidence kinds can a hypothesis request?",
  "SE-14": "Why does `discoverEvidence` deliberately avoid answering the question or setting a verification status itself?",
  "SE-15": "How does `discoverEvidence` recover when the model's first JSON response fails schema validation?",
  "SE-16": "What does the `discover_evidence` MCP tool's description say it will never do?",
  "SE-17": "How many distinct evidence sources does `hybridRetrieve` merge, and what constant controls the rank-fusion formula?",
  "SE-18": "What problem does `GUARD_TRIGGER_WORDS` solve in hybrid retrieval, and name two of the trigger words?",
  "SE-19": "What score threshold must a git-history candidate meet to be surfaced by hybrid retrieval, and how does that compare to the threshold for a package.json script match?",
  "SE-20": "What two things must be true of the `limit` argument passed to `hybridRetrieve`?",
  "SE-21": "What does `guardConditionFor` capture for a call site, and how is a condition reached via an `else` branch represented?",
  "SE-22": "What precondition does `assertCleanCheckout` enforce before writing knowledge updates, and what error does it throw if that precondition fails?",
  "SE-23": "Where is the Super Explorer's knowledge database stored on disk?",
  "SE-24": "What three verification statuses can a stored claim have, and what does `refresh_knowledge_freshness` do when a directly-sourced file changes?",
  "SE-25": "Which MCP tool registers `refreshKnowledgeFreshness` and `saveKnowledgeUpdates`, and what do those two functions do?",
  "SE-26": "How does `findSymbol` prioritize an ID match versus an exact name match versus a partial name match?",
  "SE-27": "What is deliberately excluded from `findReferences`'s results, and why?",
  "SE-28": "What does each of `find_callers` and `find_callees` return, and what extra field does each result carry?",
  "SE-29": "What error does `findSymbol` throw for a blank symbol ID, and which other structural-tools function shares that same check?",
  "SE-30": "How does `outlineFile` prevent a path from escaping the repository root?",
  "SE-31": "What must a caller do before calling `read_symbol`, according to its MCP tool description, and why?",
  "SE-32": "How does `readSymbol` build `context_before` and `context_after` for a symbol?",
  "SE-33": "How does `outlineFile` normalize file paths for cross-platform consistency?",
  "SE-34": "What embedding model does semantic search use by default, and how can it be overridden?",
  "SE-35": "How does `semanticSearch` decide whether an existing embedding index can be reused instead of rebuilt?",
  "SE-36": "What text does semantic search embed for a symbol, and to how many characters is it truncated?",
  "SE-37": "What must be true of a claim's citations before `synthesizeVerifiedClaims` will include it in the answer text?",
  "SE-38": "What model does `verifyClaims` use by default, and what system prompt instructs it to be strict?",
  "SE-39": "What error does verification throw if a `SUPPORTED` result cites no evidence, and what does synthesis do with results that are not `SUPPORTED`?",
  "SE-40": "How does verification's path-safety check reject an evidence file argument, and what error message does it raise?",
  "SE-41": "What citation format does `synthesizeVerifiedClaims` use for a git-commit citation versus a source-range citation?",
  "SE-42": "What three checks does `extractAdapterFacts` run before trusting a framework adapter's output, and what does it forbid an adapter from doing?",
  "SE-43": "Which two WordPress function names does the WooCommerce adapter treat as hook registrations, and which four does it treat as hook emitters?",
  "SE-44": "How does the WordPress adapter detect an AJAX handler versus a WooCommerce cart hook?",
  "SE-45": "What does every fact produced by the WordPress/WooCommerce adapter embed, and why?",
  "SE-46": "What is the pipeline order inside `exploreRepository`, from discovery through to the final answer?",
  "SE-47": "What does `exploreRepository` do if the repository's commit hash changes between discovery and evidence materialization?",
  "SE-48": "What message does `exploreRepository` return as the answer when it cannot materialize any evidence for the discovered hypotheses?",
  "SE-49": "How does `gitFindFileIntroduction`'s underlying git command differ from `gitFindSymbolIntroduction`'s, in terms of following renames versus line ranges?",
  "SE-50": "Why does the `git-history` CLI reject a limit argument for the `blame-symbol` operation?",
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
  "SE-09": { files: ["src/tools/local-explorer-task.ts", "docs/benchmarks/runs/2026-09-16-local-explorer.md"], phrases: ["qwen3.5:4b", "low confidence"] },
  "SE-10": { files: ["scripts/validate-cloud-bash.cjs"], phrases: ["invalid json", "exit 0"] },
  "SE-11": { files: ["src/index.ts", "src/tools/local-explorer-task.ts"], phrases: ["5b0f7d8edecfff3fe2304d8dffc43feff4606412", "feat: add local explorer tool"] },
  "SE-12": { files: ["package.json"], phrases: ["no usable automated test", "error: no test specified", "exit 1"] },
  "SE-13": { files: ["src/super-explorer/discovery.ts"], phrases: ["qwen3.5:4b", "source_range", "symbol", "relationship", "adapter_fact", "git_history"] },
  "SE-14": { files: ["src/super-explorer/discovery.ts"], phrases: ["deliberately never returns an answer", "verification status"] },
  "SE-15": { files: ["src/super-explorer/discovery.ts"], phrases: ["canonical json schema", "retry"] },
  "SE-16": { files: ["src/tools/discover-evidence.ts"], phrases: ["discover_evidence", "never answers the question or verifies claims"] },
  "SE-17": { files: ["src/super-explorer/hybrid-retrieval.ts"], phrases: ["rrf_k", "60"] },
  "SE-18": { files: ["src/super-explorer/hybrid-retrieval.ts"], phrases: ["guard_trigger_words", "gate"] },
  "SE-19": { files: ["src/super-explorer/hybrid-retrieval.ts"], phrases: ["score >= 4", "score >= 2"] },
  "SE-20": { files: ["src/super-explorer/hybrid-retrieval.ts"], phrases: ["limit", "1", "100"] },
  "SE-21": { files: ["src/super-explorer/indexer.ts"], phrases: ["guardconditionfor", "negat", "else"] },
  "SE-22": { files: ["src/super-explorer/knowledge-store.ts"], phrases: ["assertcleancheckout", "clean git checkout", "commit or stash tracked changes first"] },
  "SE-23": { files: ["src/super-explorer/knowledge-store.ts"], phrases: ["explorer.sqlite", ".super-explorer"] },
  "SE-24": { files: ["src/super-explorer/knowledge-store.ts"], phrases: ["supported", "contradicted", "insufficient", "stale"] },
  "SE-25": { files: ["src/tools/save-knowledge-updates.ts", "src/super-explorer/knowledge-store.ts"], phrases: ["refresh_knowledge_freshness", "refreshknowledgefreshness", "saveknowledgeupdates"] },
  "SE-26": { files: ["src/super-explorer/structural-tools.ts"], phrases: ["id", "exact", "partial"] },
  "SE-27": { files: ["src/super-explorer/structural-tools.ts", "src/tools/structural-queries.ts"], phrases: ["unresolved", "excluded"] },
  "SE-28": { files: ["src/super-explorer/structural-tools.ts", "src/tools/structural-queries.ts"], phrases: ["findcallers", "findcallees", "resolution"] },
  "SE-29": { files: ["src/super-explorer/structural-tools.ts", "src/super-explorer/read-symbol.ts"], phrases: ["symbol id must not be empty"] },
  "SE-30": { files: ["src/super-explorer/outline-file.ts"], phrases: ["relativepath", "..", "sep"] },
  "SE-31": { files: ["src/tools/read-symbol.ts"], phrases: ["outline_file", "stable", "symbol id"] },
  "SE-32": { files: ["src/super-explorer/read-symbol.ts"], phrases: ["context_before", "context_after", "line"] },
  "SE-33": { files: ["src/super-explorer/outline-file.ts"], phrases: ["forward slash", "split", "join"] },
  "SE-34": { files: ["src/super-explorer/semantic-search.ts"], phrases: ["nomic-embed-text-v2-moe", "super_explorer_embedding_model"] },
  "SE-35": { files: ["src/super-explorer/semantic-search.ts"], phrases: ["commit_hash", "version", "model"] },
  "SE-36": { files: ["src/super-explorer/semantic-search.ts"], phrases: ["signature", "docblock", "1,600", "1600", "1_600"] },
  "SE-37": { files: ["src/super-explorer/synthesis.ts"], phrases: ["has no citable evidence", "supported"] },
  "SE-38": { files: ["src/super-explorer/verification.ts"], phrases: ["qwen3.5:4b", "strict evidence verifier"] },
  "SE-39": { files: ["src/super-explorer/verification.ts", "src/super-explorer/synthesis.ts"], phrases: ["must cite supplied evidence", "omitted_claim_ids"] },
  "SE-40": { files: ["src/super-explorer/verification.ts"], phrases: ["repository-relative"] },
  "SE-41": { files: ["src/super-explorer/synthesis.ts"], phrases: ["git:", "source_range"] },
  "SE-42": { files: ["src/super-explorer/framework-adapter.ts"], phrases: ["unsupported adapter index schema version", "does not match", "same commit as the generic index"] },
  "SE-43": { files: ["src/super-explorer/wordpress-woocommerce-adapter.ts"], phrases: ["add_action", "add_filter", "do_action", "apply_filters"] },
  "SE-44": { files: ["src/super-explorer/wordpress-woocommerce-adapter.ts"], phrases: ["wp_ajax_", "woocommerce_"] },
  "SE-45": { files: ["src/super-explorer/framework-adapter.ts", "src/super-explorer/wordpress-woocommerce-adapter.ts"], phrases: ["schema_version", "adapter_schema_version"] },
  "SE-46": { files: ["src/super-explorer/explore.ts"], phrases: ["discoverevidence", "verifyclaims", "synthesizeverifiedclaims"] },
  "SE-47": { files: ["src/super-explorer/explore.ts"], phrases: ["repository changed between discovery and evidence materialization"] },
  "SE-48": { files: ["src/super-explorer/explore.ts"], phrases: ["i could not materialize evidence for a supported answer"] },
  "SE-49": { files: ["src/super-explorer/git-history.ts"], phrases: ["--follow", "-l"] },
  "SE-50": { files: ["src/super-explorer/git-history-cli.ts"], phrases: ["blame-symbol does not accept a limit"] },
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

// Selects whole feature groups (see GOLD_GROUPS) rather than a random subset
// of questions, so "trained on" and "tested on" questions never share a
// feature area.
function idsForGroups(groups: string[]): string[] {
  const wanted = new Set(groups);
  return Object.keys(GOLD_QUESTIONS).filter((id) => wanted.has(GOLD_GROUPS[id]));
}

const ALL_GROUPS = [...new Set(Object.values(GOLD_GROUPS))];

const [repositoryRoot, model, ...ids] = process.argv.slice(2);
if (!repositoryRoot) {
  throw new Error(
    "Usage: gold-set:super-explorer <repository-root> [model] [question-id ...]\n" +
      "  With no question-ids, runs SE-01 through SE-05.\n" +
      "  Pass 'all' as the only question-id to run every question (SE-01..SE-50).\n" +
      "  Pass 'group:<name>[,<name>...]' to run whole feature groups, e.g.\n" +
      "  'group:shell-safety,local-explorer'. Groups: " +
      ALL_GROUPS.join(", "),
  );
}

let selected: string[];
if (ids.length === 0) selected = ["SE-01", "SE-02", "SE-03", "SE-04", "SE-05"];
else if (ids.length === 1 && ids[0] === "all") selected = Object.keys(GOLD_QUESTIONS);
else if (ids.length === 1 && ids[0].startsWith("group:")) selected = idsForGroups(ids[0].slice("group:".length).split(","));
else selected = ids;

const root = resolve(repositoryRoot);
const verdicts: Verdict[] = [];
for (const id of selected) {
  const question = GOLD_QUESTIONS[id];
  if (!question) {
    process.stderr.write(`Unknown question id: ${id}\n`);
    continue;
  }
  process.stderr.write(`\n=== ${id} [${GOLD_GROUPS[id]}]: ${question}\n`);
  const started = Date.now();
  try {
    const result = await exploreRepository({ repository_root: root, question, model });
    process.stdout.write(`${JSON.stringify({ id, group: GOLD_GROUPS[id], latency_ms: Date.now() - started, result })}\n`);
    verdicts.push(verdictFor(id, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ id, group: GOLD_GROUPS[id], latency_ms: Date.now() - started, error: message })}\n`);
    verdicts.push(verdictFor(id, undefined, message));
  }
}

const passed = verdicts.filter((verdict) => verdict.passed);
process.stderr.write(`\n=== FINAL VERDICT: ${passed.length === verdicts.length ? "PASS" : "FAIL"} (${passed.length}/${verdicts.length} passed) ===\n`);
for (const verdict of verdicts) {
  process.stderr.write(`${verdict.passed ? "PASS" : "FAIL"} ${verdict.id} [${GOLD_GROUPS[verdict.id]}]${verdict.reasons.length ? ` — ${verdict.reasons.join("; ")}` : ""}\n`);
}
