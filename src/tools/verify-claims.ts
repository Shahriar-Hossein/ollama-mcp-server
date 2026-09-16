import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { verifyClaims, type VerificationInputClaim } from "../super-explorer/verification.js";

const evidence = z.discriminatedUnion("evidence_kind", [
  z.object({ evidence_kind: z.literal("symbol"), symbol_id: z.string().min(1) }),
  z.object({ evidence_kind: z.literal("source_range"), file: z.string().min(1), start_byte: z.number().int().nonnegative(), end_byte: z.number().int().positive() }),
  z.object({ evidence_kind: z.literal("git_commit"), git_commit_hash: z.string().min(1) }),
]);

export function registerVerifyClaims(server: McpServer) {
  server.tool("verify_claims", "Classifies caller-supplied repository claims as SUPPORTED, CONTRADICTED, or INSUFFICIENT from materialized evidence. It does not retrieve evidence or synthesize a user-facing answer.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
    claims: z.array(z.object({ id: z.string().min(1), claim: z.string().min(1), evidence: z.array(evidence).min(1).max(10) })).min(1).max(20),
    model: z.string().optional().describe("Ollama model used for evidence classification; defaults to qwen3.5:4b."),
  }, async ({ repository_root, claims, model }) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await verifyClaims(repository_root, claims as VerificationInputClaim[], model)) }] }; }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed claim verification: ${error.message}` }] }; }
  });
}
