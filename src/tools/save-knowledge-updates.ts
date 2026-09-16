import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { refreshKnowledgeFreshness, saveKnowledgeUpdates } from "../super-explorer/knowledge-store.js";

const quality = z.enum(["exact", "static", "heuristic", "unresolved"]);
const evidence = z.object({
  evidence_kind: z.enum(["source_range", "symbol", "relationship", "adapter_fact", "git_commit"]),
  commit_hash: z.string().optional(), file: z.string().optional(), start_byte: z.number().int().nonnegative().optional(), end_byte: z.number().int().positive().optional(),
  symbol_id: z.string().optional(), relationship_id: z.string().optional(), adapter: z.string().optional(), adapter_fact_id: z.string().optional(), git_commit_hash: z.string().optional(), excerpt: z.string().optional(), resolution_quality: quality,
});

export function registerSaveKnowledgeUpdates(server: McpServer) {
  server.tool("save_knowledge_updates", "Atomically saves source-backed verification outcomes as repository knowledge. SUPPORTED claims require non-unresolved evidence and are the only claims eligible for later retrieval.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
    updates: z.array(z.object({ claim: z.string().min(1), subject_symbol_id: z.string().optional(), verification_status: z.enum(["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"]), resolution_quality: quality, evidence: z.array(evidence).min(1), source_files: z.array(z.string()).optional(), symbol_dependencies: z.array(z.string()).optional() })).min(1),
  }, async ({ repository_root, updates }) => {
    try { return { content: [{ type: "text", text: JSON.stringify(saveKnowledgeUpdates(repository_root, updates)) }] }; }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed to save knowledge updates: ${error.message}` }] }; }
  });
  server.tool("refresh_knowledge_freshness", "Snapshots the current Git commit and marks knowledge stale when a directly sourced file changed since the prior snapshot.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
  }, async ({ repository_root }) => {
    try { return { content: [{ type: "text", text: JSON.stringify(refreshKnowledgeFreshness(repository_root)) }] }; }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed to refresh knowledge freshness: ${error.message}` }] }; }
  });
}
