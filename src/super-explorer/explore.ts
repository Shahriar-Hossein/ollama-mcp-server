import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { discoverEvidence } from "./discovery.js";
import { findSymbol } from "./structural-tools.js";
import { synthesizeVerifiedClaims, type SynthesisResult } from "./synthesis.js";
import { verifyClaims, type VerificationInputClaim } from "./verification.js";

const inputSchema = z.object({
  repository_root: z.string().min(1),
  question: z.string().trim().min(1).max(2_000),
  model: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  mode: z.enum(["lexical", "hybrid"]).optional(),
});

export interface ExploreResult extends SynthesisResult {
  tool_calls: number;
  discovery: Awaited<ReturnType<typeof discoverEvidence>>["discovery"];
  verification: Awaited<ReturnType<typeof verifyClaims>>;
}

function evidenceForDiscovery(
  root: string,
  discovery: Awaited<ReturnType<typeof discoverEvidence>>,
  target: string
): VerificationInputClaim["evidence"] {
  const index = discovery.retrieval;
  const evidence: VerificationInputClaim["evidence"] = [];
  const addSymbol = (symbolId: string) => {
    if (!evidence.some((item) => item.evidence_kind === "symbol" && item.symbol_id === symbolId)) evidence.push({ evidence_kind: "symbol", symbol_id: symbolId });
  };

  // Prefer the discovery request itself, then use only the already retrieved leads.
  for (const match of findSymbol(root, target).symbols.slice(0, 2)) addSymbol(match.symbol.id);
  for (const candidate of index.results) {
    if (candidate.evidence.kind === "symbol" && candidate.evidence.symbol) addSymbol(candidate.evidence.symbol.id);
    if (candidate.evidence.kind === "git_commit" && candidate.evidence.commit_hash && !evidence.some((item) => item.evidence_kind === "git_commit" && item.git_commit_hash === candidate.evidence.commit_hash)) {
      evidence.push({ evidence_kind: "git_commit", git_commit_hash: candidate.evidence.commit_hash });
    }
    if ((candidate.evidence.kind === "documentation" || candidate.evidence.kind === "json") && candidate.evidence.file) {
      const source = readFileSync(resolve(root, candidate.evidence.file));
      if (source.length && !evidence.some((item) => item.evidence_kind === "source_range" && item.file === candidate.evidence.file)) {
        evidence.push({ evidence_kind: "source_range", file: candidate.evidence.file, start_byte: 0, end_byte: source.length });
      }
    }
    if (evidence.length >= 10) break;
  }
  return evidence.slice(0, 10);
}

/** Runs the bounded evidence pipeline and returns only verifier-approved claims. */
export async function exploreRepository(input: z.input<typeof inputSchema>): Promise<ExploreResult> {
  const options = inputSchema.parse(input);
  const root = resolve(options.repository_root);
  const discovery = await discoverEvidence(root, options.question, { model: options.model, limit: options.limit, mode: options.mode });
  const claims: VerificationInputClaim[] = discovery.discovery.hypotheses.flatMap((hypothesis, hypothesisIndex) => {
    const evidence = [...new Map(hypothesis.required_evidence.flatMap((request) => evidenceForDiscovery(root, discovery, request.target)).map((item) => [JSON.stringify(item), item])).values()].slice(0, 10);
    return evidence.length ? [{ id: `hypothesis-${hypothesisIndex + 1}`, claim: hypothesis.hypothesis, evidence }] : [];
  });
  if (!claims.length) {
    return {
      commit_hash: discovery.commit_hash,
      question: options.question,
      answer_to_user: "I could not materialize evidence for a supported answer.",
      cited_claims: [],
      omitted_claim_ids: [],
      tool_calls: 1,
      discovery: discovery.discovery,
      verification: { commit_hash: discovery.commit_hash, results: [] },
    };
  }
  const verification = await verifyClaims(root, claims, options.model);
  return {
    ...synthesizeVerifiedClaims({ question: options.question, verification }),
    tool_calls: 2,
    discovery: discovery.discovery,
    verification,
  };
}
