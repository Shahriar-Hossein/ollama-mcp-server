import { resolve } from "node:path";
import { z } from "zod";
import { generate } from "../../ollama-client.js";
import { hybridRetrieve, type HybridRetrievalResult, type RetrievalMode } from "../../explorer/retrieval.js";

const DEFAULT_MODEL = "qwen3.5:4b";
const evidenceRequestSchema = z.object({
  kind: z.enum(["source_range", "symbol", "relationship", "adapter_fact", "git_history"]),
  target: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
}).strict();
const hypothesisSchema = z.object({
  hypothesis: z.string().trim().min(1).max(1_000),
  required_evidence: z.array(evidenceRequestSchema).min(1).max(5),
}).strict();
const modelResponseSchema = z.object({
  hypotheses: z.array(hypothesisSchema).max(5),
  retrieval_gaps: z.array(z.string().trim().min(1).max(500)).max(5),
}).strict().refine(
  (plan) => plan.hypotheses.length > 0 || plan.retrieval_gaps.length > 0,
  "Discovery must provide a hypothesis or a retrieval gap."
);

const discoveryResponseFormat = {
  type: "object",
  additionalProperties: false,
  required: ["hypotheses", "retrieval_gaps"],
  properties: {
    hypotheses: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hypothesis", "required_evidence"],
        properties: {
          hypothesis: { type: "string", minLength: 1, maxLength: 1_000 },
          required_evidence: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "target", "reason"],
              properties: {
                kind: { type: "string", enum: ["source_range", "symbol", "relationship", "adapter_fact", "git_history"] },
                target: { type: "string", minLength: 1, maxLength: 500 },
                reason: { type: "string", minLength: 1, maxLength: 500 },
              },
            },
          },
        },
      },
    },
    retrieval_gaps: { type: "array", maxItems: 5, items: { type: "string", minLength: 1, maxLength: 500 } },
  },
} as const;

export type DiscoveryPlan = z.infer<typeof modelResponseSchema>;

export interface DiscoveryResult {
  commit_hash: string;
  question: string;
  retrieval: HybridRetrievalResult;
  discovery: DiscoveryPlan;
  model_calls: number;
}

function evidenceSummary(result: HybridRetrievalResult): string {
  return result.results.map((candidate, offset) => {
    const evidence = candidate.evidence;
    if (evidence.kind === "symbol") {
      const guard = evidence.guarded_by?.length ? ` [guarded by: ${evidence.guarded_by.join(" | ")}]` : "";
      return `${offset + 1}. symbol ${evidence.symbol!.id} (${evidence.symbol!.kind} ${evidence.symbol!.qualified_name} in ${evidence.symbol!.file})${guard}`;
    }
    if (evidence.kind === "git_commit") return `${offset + 1}. git commit ${evidence.commit_hash}: ${evidence.subject}`;
    if (evidence.kind === "json") return `${offset + 1}. config ${evidence.file}${evidence.json_pointer}: ${evidence.value}`;
    return `${offset + 1}. documentation ${evidence.file}: ${evidence.excerpt}`;
  }).join("\n") || "(no candidates retrieved)";
}

/** Merges retrieval results by evidence identity, keeping the earlier (higher-ranked) occurrence. */
function mergeRetrievalResults(base: HybridRetrievalResult, extra: HybridRetrievalResult, limit: number): HybridRetrievalResult {
  const seen = new Set<string>();
  const merged: HybridRetrievalResult["results"] = [];
  for (const candidate of [...base.results, ...extra.results]) {
    const key = JSON.stringify(candidate.evidence);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
    if (merged.length >= limit) break;
  }
  return { ...base, results: merged };
}

export function parseDiscoveryModelResponse(text: string): DiscoveryPlan {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error("Discovery model must return one JSON object with hypotheses and retrieval_gaps."); }
  return modelResponseSchema.parse(normalizeModelResponse(parsed));
}

/** Translates documented equivalent field names, then leaves canonical validation strict. */
function normalizeModelResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.hypotheses)) return value;
  return {
    ...plan,
    hypotheses: plan.hypotheses.map((item) => normalizeHypothesis(item)),
  };
}

function normalizeHypothesis(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const hypothesis = value as Record<string, unknown>;
  const {
    hypothesis_id: _ignoredId,
    hypothesis: canonicalHypothesis,
    description,
    claim,
    statement,
    required_evidence: canonicalEvidence,
    evidence_requests,
    evidence,
    ...rest
  } = hypothesis;
  const requestedEvidence = canonicalEvidence ?? evidence_requests ?? evidence;
  return {
    ...rest,
    hypothesis: canonicalHypothesis ?? description ?? claim ?? statement,
    required_evidence: Array.isArray(requestedEvidence)
      ? requestedEvidence.map((request) => normalizeEvidenceRequest(request))
      : requestedEvidence,
  };
}

function normalizeEvidenceRequest(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const request = value as Record<string, unknown>;
  const {
    kind: canonicalKind,
    target: canonicalTarget,
    reason: canonicalReason,
    type,
    id,
    symbol,
    relationship,
    value: targetValue,
    description,
    rationale,
    ...rest
  } = request;
  const target = canonicalTarget ?? symbol ?? relationship ?? id ?? targetValue;
  const kind = canonicalKind
    ?? (typeof symbol === "string" ? "symbol" : undefined)
    ?? (typeof relationship === "string" ? "relationship" : undefined)
    // An unknown model-specific type is only an identifier lookup request,
    // never evidence or a claimed semantic classification.
    ?? (typeof target === "string" ? "symbol" : undefined)
    ?? type;
  return {
    ...rest,
    kind,
    target,
    reason: canonicalReason ?? rationale ?? description ?? (typeof target === "string" ? `Locate ${target} in indexed source.` : undefined),
  };
}

const DISCOVERY_SYSTEM = "You plan bounded repository evidence collection. Treat retrieved candidates as unverified leads. Your entire response must be the schema-valid JSON object and nothing else.";

// Ollama's runtime default num_ctx (4096) doesn't fit a full evidence list at
// higher `limit` values, silently truncating candidates before the model sees
// them. Matches the fix already applied to local_explorer_task.
const MODEL_OPTIONS = { num_ctx: 16384, num_predict: 8192 };

function buildDiscoveryPrompt(question: string, retrieval: HybridRetrievalResult): string {
  return `Question:\n${question}\n\nRetrieved candidates (leads, not proof):\n${evidenceSummary(retrieval)}\n\nReturn one JSON object matching the supplied schema. Do not use Markdown fences or prose. This is discovery, not verification or synthesis: do not answer the question, state conclusions, assign verification statuses, or cite proof. Use only the retrieved candidates to name concrete evidence targets. A hypothesis must be a narrow, falsifiable repository claim that the requested evidence could directly support or disprove; do not add evaluative language. Use one kind value per evidence request: source_range, symbol, relationship, adapter_fact, or git_history. Targets must be exact: a symbol ID or exact qualified name for symbol; \`caller-symbol-id -> callee-symbol-id\` for relationship; \`relative/path:start_byte:end_byte\` for source_range; or a full commit hash for git_history. adapter_fact is unavailable unless a matching adapter candidate is listed. If the candidates cannot support a concrete hypothesis, return [] for hypotheses and put each missing, specific lead in retrieval_gaps. Do not return both arrays empty.`;
}

/** Issues the discovery prompt and, on schema failure, one repair attempt. Returns null if both fail. */
async function runDiscoveryPass(
  model: string,
  prompt: string,
  think = false
): Promise<{ plan: DiscoveryPlan; calls: number } | { error: unknown; calls: number }> {
  const response = await generate(model, prompt, DISCOVERY_SYSTEM, discoveryResponseFormat, think, MODEL_OPTIONS);
  try {
    return { plan: parseDiscoveryModelResponse(response), calls: 1 };
  } catch (firstError) {
    const repairPrompt = `Convert the prior discovery response below into the supplied canonical JSON schema. Preserve its intended hypotheses and evidence targets; do not add claims, conclusions, citations, or prose. Return only the repaired JSON object.\n\nPrior response:\n${response}`;
    const repaired = await generate(model, repairPrompt, DISCOVERY_SYSTEM, discoveryResponseFormat, think, MODEL_OPTIONS);
    try {
      return { plan: parseDiscoveryModelResponse(repaired), calls: 2 };
    } catch {
      return { error: firstError, calls: 2 };
    }
  }
}

/**
 * Produces an unverified investigation plan. This deliberately never returns
 * an answer or a verification status: later stages must obtain and assess the
 * requested evidence before any claim is shown to a user or saved as knowledge.
 */
export async function discoverEvidence(
  repositoryRoot: string,
  question: string,
  options: { model?: string; limit?: number; mode?: RetrievalMode; think?: boolean } = {}
): Promise<DiscoveryResult> {
  const root = resolve(repositoryRoot);
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) throw new Error("Discovery question must not be empty.");
  const limit = options.limit ?? 10;
  const mode = options.mode ?? "hybrid";
  const model = options.model ?? DEFAULT_MODEL;
  const think = options.think ?? false;

  const retrieval = await hybridRetrieve(root, trimmedQuestion, limit, mode);
  const first = await runDiscoveryPass(model, buildDiscoveryPrompt(trimmedQuestion, retrieval), think);
  if ("error" in first) {
    throw new Error(`Discovery model response failed schema validation after one repair attempt: ${first.error instanceof Error ? first.error.message : String(first.error)}`);
  }
  if (first.plan.hypotheses.length > 0 || first.plan.retrieval_gaps.length === 0) {
    return { commit_hash: retrieval.commit_hash, question: trimmedQuestion, retrieval, discovery: first.plan, model_calls: first.calls };
  }

  // Empty hypotheses but named gaps: one bounded retry, re-retrieving with the gap
  // descriptions as extra search terms rather than giving up immediately.
  const gapQuery = `${trimmedQuestion} ${first.plan.retrieval_gaps.join(" ")}`;
  const gapRetrieval = await hybridRetrieve(root, gapQuery, limit, mode);
  const mergedRetrieval = mergeRetrievalResults(retrieval, gapRetrieval, limit * 2);
  const second = await runDiscoveryPass(model, buildDiscoveryPrompt(trimmedQuestion, mergedRetrieval), think);
  const totalCalls = first.calls + second.calls;
  if ("error" in second) {
    return { commit_hash: retrieval.commit_hash, question: trimmedQuestion, retrieval, discovery: first.plan, model_calls: totalCalls };
  }
  return { commit_hash: retrieval.commit_hash, question: trimmedQuestion, retrieval: mergedRetrieval, discovery: second.plan, model_calls: totalCalls };
}
