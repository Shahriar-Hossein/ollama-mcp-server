import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { z } from "zod";
import { generate } from "../ollama-client.js";
import { indexRepository, type RepositoryIndex, type ResolutionQuality } from "./indexer.js";
import { readSymbol } from "./read-symbol.js";

const DEFAULT_MODEL = "qwen3.5:4b";
const quality: ResolutionQuality = "exact";
const evidenceInputSchema = z.discriminatedUnion("evidence_kind", [
  z.object({ evidence_kind: z.literal("symbol"), symbol_id: z.string().min(1) }),
  z.object({ evidence_kind: z.literal("source_range"), file: z.string().min(1), start_byte: z.number().int().nonnegative(), end_byte: z.number().int().positive() }),
  z.object({ evidence_kind: z.literal("git_commit"), git_commit_hash: z.string().min(1) }),
]);
const claimInputSchema = z.object({ id: z.string().trim().min(1).max(200), claim: z.string().trim().min(1).max(2_000), evidence: z.array(evidenceInputSchema).min(1).max(10) });
const modelResultSchema = z.object({ id: z.string(), verification_status: z.enum(["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"]), rationale: z.string().trim().min(1).max(1_000), evidence_indexes: z.array(z.number().int().nonnegative()).max(10) });
const modelResponseSchema = z.object({ results: z.array(modelResultSchema).max(20) }).strict();

export type VerificationInputClaim = z.infer<typeof claimInputSchema>;
export interface VerificationEvidence {
  evidence_kind: "symbol" | "source_range" | "git_commit";
  commit_hash: string;
  resolution_quality: ResolutionQuality;
  symbol_id?: string;
  file?: string;
  start_byte?: number;
  end_byte?: number;
  git_commit_hash?: string;
  excerpt: string;
}
export interface VerificationResult {
  id: string;
  claim: string;
  verification_status: "SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT";
  rationale: string;
  resolution_quality: ResolutionQuality;
  evidence: VerificationEvidence[];
}

function withinRoot(root: string, file: string): string {
  const path = resolve(root, file);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Evidence file must be repository-relative: ${file}`);
  return path;
}

function materializeEvidence(root: string, commitHash: string, index: RepositoryIndex, input: z.infer<typeof evidenceInputSchema>): VerificationEvidence {
  if (input.evidence_kind === "symbol") {
    const read = readSymbol(root, input.symbol_id, index);
    const symbol = read.symbol;
    const guards = [...new Set(
      index.calls
        .filter((call) => call.callee_symbol_id === symbol.id && call.guard_condition)
        .map((call) => call.guard_condition!)
    )];
    const guardNote = guards.length ? `\n\n// Reached only when: ${guards.join(" | ")}` : "";
    return { evidence_kind: "symbol", commit_hash: commitHash, resolution_quality: quality, symbol_id: symbol.id, file: symbol.file, start_byte: symbol.range.start.byte, end_byte: symbol.range.end.byte, excerpt: (read.source.text + guardNote).slice(0, 8_000) };
  }
  if (input.evidence_kind === "source_range") {
    if (input.end_byte <= input.start_byte) throw new Error(`Evidence range must have a positive length: ${input.file}`);
    const file = withinRoot(root, input.file);
    const source = readFileSync(file);
    if (input.end_byte > source.length) throw new Error(`Evidence range exceeds file length: ${input.file}`);
    return { evidence_kind: "source_range", commit_hash: commitHash, resolution_quality: quality, file: input.file, start_byte: input.start_byte, end_byte: input.end_byte, excerpt: source.subarray(input.start_byte, input.end_byte).toString("utf8").slice(0, 8_000) };
  }
  try { execFileSync("git", ["cat-file", "-e", `${input.git_commit_hash}^{commit}`], { cwd: root, stdio: "ignore" }); }
  catch { throw new Error(`Evidence refers to an unknown Git commit: ${input.git_commit_hash}`); }
  const excerpt = execFileSync("git", ["show", "--no-patch", "--format=%H%n%s%n%b", input.git_commit_hash], { cwd: root, encoding: "utf8" }).slice(0, 8_000);
  return { evidence_kind: "git_commit", commit_hash: commitHash, resolution_quality: quality, git_commit_hash: input.git_commit_hash, excerpt };
}

function parseModelResponse(text: string, claims: VerificationInputClaim[], evidenceCounts: number[]): z.infer<typeof modelResponseSchema> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error("Verification model must return one JSON object with results."); }
  const response = modelResponseSchema.parse(parsed);
  if (response.results.length !== claims.length || response.results.some((result, index) => result.id !== claims[index].id)) throw new Error("Verification model must return exactly one result per claim in input order.");
  for (const [index, result] of response.results.entries()) {
    if (result.evidence_indexes.some((evidenceIndex) => evidenceIndex >= evidenceCounts[index])) throw new Error(`Verification result ${result.id} cites unavailable evidence.`);
    if (result.verification_status === "SUPPORTED" && result.evidence_indexes.length === 0) throw new Error(`SUPPORTED result ${result.id} must cite supplied evidence.`);
  }
  return response;
}

/** Classifies claims from caller-supplied, materialized evidence; it never produces a user-facing synthesis. */
export async function verifyClaims(repositoryRoot: string, claimsInput: VerificationInputClaim[], model = DEFAULT_MODEL, think = false): Promise<{ commit_hash: string; results: VerificationResult[] }> {
  const root = resolve(repositoryRoot);
  const claims = z.array(claimInputSchema).min(1).max(20).parse(claimsInput);
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) throw new Error("Verification claim IDs must be unique.");
  const index = indexRepository(root);
  const materialized = claims.map((claim) => claim.evidence.map((evidence) => materializeEvidence(root, index.commit_hash, index, evidence)));
  const prompt = `Classify each repository claim using only its numbered evidence. Return JSON only: {"results":[{"id":"input id","verification_status":"SUPPORTED|CONTRADICTED|INSUFFICIENT","rationale":"brief evidence-bound assessment","evidence_indexes":[0]}]}.\n\nSUPPORTED requires direct supplied evidence that establishes the claim. CONTRADICTED requires supplied evidence that directly conflicts with it. Otherwise choose INSUFFICIENT. Do not infer from names, omit results, answer the broader question, or write a final synthesis.\n\n${claims.map((claim, index) => `Claim ${index + 1} (id ${claim.id}): ${claim.claim}\nEvidence:\n${materialized[index].map((evidence, evidenceIndex) => `[${evidenceIndex}] ${evidence.evidence_kind} ${evidence.file ?? evidence.symbol_id ?? evidence.git_commit_hash}\n${evidence.excerpt}`).join("\n")}`).join("\n\n")}`;
  const assessed = parseModelResponse(await generate(model, prompt, "You are a strict evidence verifier. Classify only what the supplied repository evidence establishes.", undefined, think), claims, materialized.map((evidence) => evidence.length));
  return {
    commit_hash: index.commit_hash,
    results: assessed.results.map((result, index) => {
      const evidence = result.evidence_indexes.map((evidenceIndex) => materialized[index][evidenceIndex]);
      return { id: result.id, claim: claims[index].claim, verification_status: result.verification_status, rationale: result.rationale, resolution_quality: evidence.reduce<ResolutionQuality>((weakest, item) => weakest === "exact" ? item.resolution_quality : weakest, "exact"), evidence };
    }),
  };
}
