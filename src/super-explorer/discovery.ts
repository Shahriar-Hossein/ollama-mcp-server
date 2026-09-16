import { resolve } from "node:path";
import { z } from "zod";
import { generate } from "../ollama-client.js";
import { hybridRetrieve, type HybridRetrievalResult, type RetrievalMode } from "./hybrid-retrieval.js";

const DEFAULT_MODEL = "qwen3.5:4b";
const evidenceRequestSchema = z.object({
  kind: z.enum(["source_range", "symbol", "relationship", "adapter_fact", "git_history"]),
  target: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
});
const hypothesisSchema = z.object({
  hypothesis: z.string().trim().min(1).max(1_000),
  required_evidence: z.array(evidenceRequestSchema).min(1).max(5),
});
const modelResponseSchema = z.object({
  hypotheses: z.array(hypothesisSchema).max(5),
  retrieval_gaps: z.array(z.string().trim().min(1).max(500)).max(5),
}).strict();

export type DiscoveryPlan = z.infer<typeof modelResponseSchema>;

export interface DiscoveryResult {
  commit_hash: string;
  question: string;
  retrieval: HybridRetrievalResult;
  discovery: DiscoveryPlan;
}

function evidenceSummary(result: HybridRetrievalResult): string {
  return result.results.map((candidate, offset) => {
    const evidence = candidate.evidence;
    if (evidence.kind === "symbol") {
      return `${offset + 1}. symbol ${evidence.symbol!.id} (${evidence.symbol!.kind} ${evidence.symbol!.qualified_name} in ${evidence.symbol!.file})`;
    }
    if (evidence.kind === "git_commit") return `${offset + 1}. git commit ${evidence.commit_hash}: ${evidence.subject}`;
    if (evidence.kind === "json") return `${offset + 1}. config ${evidence.file}${evidence.json_pointer}: ${evidence.value}`;
    return `${offset + 1}. documentation ${evidence.file}: ${evidence.excerpt}`;
  }).join("\n") || "(no candidates retrieved)";
}

function parseModelResponse(text: string): DiscoveryPlan {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error("Discovery model must return one JSON object with hypotheses and retrieval_gaps."); }
  return modelResponseSchema.parse(parsed);
}

/**
 * Produces an unverified investigation plan. This deliberately never returns
 * an answer or a verification status: later stages must obtain and assess the
 * requested evidence before any claim is shown to a user or saved as knowledge.
 */
export async function discoverEvidence(
  repositoryRoot: string,
  question: string,
  options: { model?: string; limit?: number; mode?: RetrievalMode } = {}
): Promise<DiscoveryResult> {
  const root = resolve(repositoryRoot);
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) throw new Error("Discovery question must not be empty.");
  const retrieval = await hybridRetrieve(root, trimmedQuestion, options.limit ?? 10, options.mode ?? "hybrid");
  const prompt = `Question:\n${trimmedQuestion}\n\nRetrieved candidates (leads, not proof):\n${evidenceSummary(retrieval)}\n\nReturn JSON only, exactly this shape:\n{"hypotheses":[{"hypothesis":"tentative, falsifiable lead","required_evidence":[{"kind":"source_range|symbol|relationship|adapter_fact|git_history","target":"specific file, symbol ID, relationship, fact, or history query","reason":"what this would establish or disprove"}]}],"retrieval_gaps":["specific missing lead"]}\n\nThis is discovery, not verification or synthesis. Do not answer the question, state conclusions, assign verification statuses, cite proof, or include any keys other than hypotheses and retrieval_gaps. Every hypothesis needs at least one concrete required_evidence item. If the candidates are insufficient, return an empty hypotheses array and explain the missing retrieval in retrieval_gaps.`;
  const response = await generate(options.model ?? DEFAULT_MODEL, prompt, "You plan bounded repository evidence collection. Treat retrieved candidates as unverified leads.");
  return { commit_hash: retrieval.commit_hash, question: trimmedQuestion, retrieval, discovery: parseModelResponse(response) };
}
