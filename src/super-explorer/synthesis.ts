import { resolve } from "node:path";
import { z } from "zod";
import type { VerificationEvidence, VerificationResult } from "./verification.js";

const evidenceSchema = z.object({
  evidence_kind: z.enum(["symbol", "source_range", "git_commit"]),
  commit_hash: z.string().min(1),
  resolution_quality: z.enum(["exact", "static", "heuristic", "unresolved"]),
  symbol_id: z.string().optional(),
  file: z.string().optional(),
  start_byte: z.number().int().nonnegative().optional(),
  end_byte: z.number().int().positive().optional(),
  git_commit_hash: z.string().optional(),
  excerpt: z.string(),
});
const verificationResultSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  verification_status: z.enum(["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"]),
  rationale: z.string().min(1),
  resolution_quality: z.enum(["exact", "static", "heuristic", "unresolved"]),
  evidence: z.array(evidenceSchema),
});
const inputSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  verification: z.object({
    commit_hash: z.string().min(1),
    results: z.array(verificationResultSchema).min(1).max(20),
  }),
});

export type SynthesisInput = z.infer<typeof inputSchema>;

export interface CitedClaim {
  id: string;
  claim: string;
  citations: string[];
}

export interface SynthesisResult {
  commit_hash: string;
  question: string;
  answer_to_user: string;
  cited_claims: CitedClaim[];
  omitted_claim_ids: string[];
}

function citation(evidence: VerificationEvidence): string | null {
  if (evidence.evidence_kind === "git_commit") return evidence.git_commit_hash ? `git:${evidence.git_commit_hash}` : null;
  if (!evidence.file) return null;
  if (evidence.start_byte === undefined || evidence.end_byte === undefined) return evidence.file;
  return `${evidence.file}:${evidence.start_byte}-${evidence.end_byte}`;
}

/**
 * Converts already verified claims into a compact cited answer. This is kept
 * deterministic: it never asks a model to paraphrase evidence, so only claims
 * classified as SUPPORTED can reach the user-facing answer.
 */
export function synthesizeVerifiedClaims(input: SynthesisInput): SynthesisResult {
  const parsed = inputSchema.parse(input);
  const supported = parsed.verification.results.filter((result) => result.verification_status === "SUPPORTED");
  const citedClaims = supported.map((result) => {
    const citations = [...new Set(result.evidence.map(citation).filter((value): value is string => Boolean(value)))];
    if (!citations.length) throw new Error(`SUPPORTED claim ${result.id} has no citable evidence.`);
    return { id: result.id, claim: result.claim, citations };
  });
  const answerToUser = citedClaims.length
    ? citedClaims.map(({ claim, citations }) => `- ${claim} (${citations.join(", ")})`).join("\n")
    : "I could not verify a supported answer from the supplied evidence.";
  return {
    commit_hash: parsed.verification.commit_hash,
    question: parsed.question,
    answer_to_user: answerToUser,
    cited_claims: citedClaims,
    omitted_claim_ids: parsed.verification.results.filter((result) => result.verification_status !== "SUPPORTED").map((result) => result.id),
  };
}

export function synthesizeFromVerification(repositoryRoot: string, input: SynthesisInput): SynthesisResult {
  // Resolve early so the CLI and MCP entry points apply the same repository-root contract.
  resolve(repositoryRoot);
  return synthesizeVerifiedClaims(input);
}
