import { resolve } from "node:path";
import { z } from "zod";
import { discoverEvidence } from "./discovery.js";
import { indexRepository, type RepositoryIndex } from "../../explorer/indexer.js";
import { synthesizeVerifiedClaims, type SynthesisResult } from "./synthesis.js";
import { verifyClaims, type VerificationInputClaim } from "./verification.js";

const inputSchema = z.object({
  repository_root: z.string().min(1),
  question: z.string().trim().min(1).max(2_000),
  model: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  mode: z.enum(["lexical", "basic", "hybrid"]).optional(),
  think: z.boolean().optional(),
});

export interface ExploreResult extends SynthesisResult {
  tool_calls: number;
  discovery: Awaited<ReturnType<typeof discoverEvidence>>["discovery"];
  verification: Awaited<ReturnType<typeof verifyClaims>>;
  mode: "verified" | "raw";
  warnings: string[];
}

function evidenceForDiscovery(
  index: RepositoryIndex,
  request: Awaited<ReturnType<typeof discoverEvidence>>["discovery"]["hypotheses"][number]["required_evidence"][number]
): VerificationInputClaim["evidence"] {
  const evidence: VerificationInputClaim["evidence"] = [];
  const addSymbol = (symbolId: string) => {
    if (!evidence.some((item) => item.evidence_kind === "symbol" && item.symbol_id === symbolId)) evidence.push({ evidence_kind: "symbol", symbol_id: symbolId });
  };
  const exactSymbol = (target: string) => index.symbols.find((symbol) => symbol.id === target)
    // Models sometimes copy a symbol ID from the retrieved-candidates list but drop its "symbol:" scheme prefix.
    ?? (!target.startsWith("symbol:") ? index.symbols.find((symbol) => symbol.id === `symbol:${target}`) : undefined)
    // Or retain only the SHA-256 digest from a `symbol:sha256:` ID.
    ?? (/^[0-9a-f]{64}$/i.test(target) ? index.symbols.find((symbol) => symbol.id === `symbol:sha256:${target}`) : undefined)
    ?? index.symbols.find((symbol) => symbol.name === target || symbol.qualified_name === target);
  // A model shouldn't have to name every symbol needed to prove a claim about one of them:
  // pull in its direct structural neighbors (callers/callees, and symbols that reference or
  // are referenced by it, e.g. the functions in the same module that use a config constant).
  const expandSymbol = (symbolId: string) => {
    for (const call of index.calls) {
      if (call.callee_symbol_id === symbolId && call.caller_symbol_id) addSymbol(call.caller_symbol_id);
      if (call.caller_symbol_id === symbolId && call.callee_symbol_id) addSymbol(call.callee_symbol_id);
    }
    for (const reference of index.references) {
      if (reference.target_symbol_id === symbolId && reference.source_symbol_id) addSymbol(reference.source_symbol_id);
      if (reference.source_symbol_id === symbolId && reference.target_symbol_id) addSymbol(reference.target_symbol_id);
    }
  };

  if (request.kind === "symbol") {
    const symbol = exactSymbol(request.target);
    if (symbol) {
      addSymbol(symbol.id);
      expandSymbol(symbol.id);
    } else {
      // The model may cite the guard's own condition text (surfaced via "[guarded by: ...]")
      // as its evidence target instead of naming the gated symbol — resolve it the same way.
      const strip = (value: string) => value.trim().replace(/^\(+|\)+$/g, "");
      const target = strip(request.target);
      for (const call of index.calls) {
        if (!call.guard_condition || strip(call.guard_condition) !== target) continue;
        evidence.push({ evidence_kind: "source_range", file: call.file, start_byte: call.range.start.byte, end_byte: call.range.end.byte });
        if (call.callee_symbol_id) addSymbol(call.callee_symbol_id);
      }
    }
  } else if (request.kind === "source_range") {
    const match = /^([^:]+):(\d+):(\d+)$/.exec(request.target);
    if (match) {
      const [, file, start, end] = match;
      const start_byte = Number(start);
      const end_byte = Number(end);
      if (end_byte > start_byte) evidence.push({ evidence_kind: "source_range", file, start_byte, end_byte });
    }
  } else if (request.kind === "git_history") {
    if (/^[0-9a-f]{40,64}$/i.test(request.target)) evidence.push({ evidence_kind: "git_commit", git_commit_hash: request.target });
  } else if (request.kind === "relationship") {
    const match = /^(.+?)\s*->\s*(.+)$/.exec(request.target);
    const caller = match && exactSymbol(match[1].trim());
    const callee = match && exactSymbol(match[2].trim());
    if (caller && callee) {
      for (const call of index.calls) {
        if (call.caller_symbol_id === caller.id && call.callee_symbol_id === callee.id) {
          evidence.push({ evidence_kind: "source_range", file: call.file, start_byte: call.range.start.byte, end_byte: call.range.end.byte });
        }
      }
      for (const reference of index.references) {
        if (reference.source_symbol_id === caller.id && reference.target_symbol_id === callee.id) {
          evidence.push({ evidence_kind: "source_range", file: reference.file, start_byte: reference.range.start.byte, end_byte: reference.range.end.byte });
        }
      }
    }
  }
  return evidence.slice(0, 10);
}

/** Runs the bounded evidence pipeline and returns only verifier-approved claims. */
export async function exploreRepository(input: z.input<typeof inputSchema>): Promise<ExploreResult> {
  const options = inputSchema.parse(input);
  const root = resolve(options.repository_root);
  const discovery = await discoverEvidence(root, options.question, { model: options.model, limit: options.limit, mode: options.mode, think: options.think });
  const index = indexRepository(root);
  if (index.commit_hash !== discovery.commit_hash) throw new Error("Repository changed between discovery and evidence materialization.");
  const claims: VerificationInputClaim[] = discovery.discovery.hypotheses.flatMap((hypothesis, hypothesisIndex) => {
    const evidence = [...new Map(hypothesis.required_evidence.flatMap((request) => evidenceForDiscovery(index, request)).map((item) => [JSON.stringify(item), item])).values()].slice(0, 10);
    return evidence.length ? [{ id: `hypothesis-${hypothesisIndex + 1}`, claim: hypothesis.hypothesis, evidence }] : [];
  });
  
  const warnings: string[] = [];
  if (!claims.length) {
    warnings.push("No materializable evidence found for the hypotheses.");
  }

  if (!claims.length) {
    return {
      commit_hash: discovery.commit_hash,
      question: options.question,
      answer_to_user: "I could not materialize evidence for a supported answer.",
      cited_claims: [],
      omitted_claim_ids: [],
      tool_calls: discovery.model_calls,
      discovery: discovery.discovery,
      verification: { commit_hash: discovery.commit_hash, results: [], model_calls: 0 },
      mode: "raw",
      warnings,
    };
  }
  const verification = await verifyClaims(root, claims, options.model, options.think);
  const synthesis = synthesizeVerifiedClaims({ question: options.question, verification });
  
  if (synthesis.answer_to_user === "I could not verify a supported answer from the supplied evidence.") {
    warnings.push("No claims were fully verified; falling back to raw discovery hypotheses.");
    const rawAnswer = discovery.discovery.hypotheses.map((h, i) => `${i + 1}. ${h.hypothesis}`).join("\n");
    return {
      ...synthesis,
      answer_to_user: rawAnswer || "I could not formulate a usable answer.",
      mode: "raw",
      warnings,
      tool_calls: discovery.model_calls + verification.model_calls,
      discovery: discovery.discovery,
      verification,
    };
  }

  return {
    ...synthesis,
    tool_calls: discovery.model_calls + verification.model_calls,
    discovery: discovery.discovery,
    verification,
    mode: "verified",
    warnings,
  };
}
