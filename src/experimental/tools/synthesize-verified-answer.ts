import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { synthesizeFromVerification, type SynthesisInput } from "../explorer/synthesis.js";

const evidence = z.object({
  evidence_kind: z.enum(["symbol", "source_range", "git_commit"]), commit_hash: z.string().min(1), resolution_quality: z.enum(["exact", "static", "heuristic", "unresolved"]),
  symbol_id: z.string().optional(), file: z.string().optional(), start_byte: z.number().int().nonnegative().optional(), end_byte: z.number().int().positive().optional(), git_commit_hash: z.string().optional(), excerpt: z.string(),
});

export function registerSynthesizeVerifiedAnswer(server: McpServer) {
  server.tool("synthesize_verified_answer", "Produces a cited answer from verification results. Only SUPPORTED claims are emitted; contradicted and insufficient claims are omitted.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
    question: z.string().min(1),
    verification: z.object({ commit_hash: z.string().min(1), results: z.array(z.object({ id: z.string().min(1), claim: z.string().min(1), verification_status: z.enum(["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"]), rationale: z.string().min(1), resolution_quality: z.enum(["exact", "static", "heuristic", "unresolved"]), evidence: z.array(evidence) })).min(1) }),
  }, async ({ repository_root, question, verification }) => {
    try { return { content: [{ type: "text", text: JSON.stringify(synthesizeFromVerification(repository_root, { question, verification } as SynthesisInput)) }] }; }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed answer synthesis: ${error.message}` }] }; }
  });
}
