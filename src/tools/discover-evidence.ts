import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { discoverEvidence } from "../super-explorer/discovery.js";

export function registerDiscoverEvidence(server: McpServer, advancedRetrievalEnabled = false) {
  server.tool(
    "discover_evidence",
    "Creates an unverified evidence-discovery plan from hybrid retrieval. It returns only tentative hypotheses, required evidence, and retrieval gaps; it never answers the question or verifies claims.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      question: z.string().describe("Bounded repository question to investigate."),
      model: z.string().optional().describe("Ollama model used only to plan discovery; defaults to qwen3.5:4b."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum hybrid retrieval candidates; defaults to 10."),
      mode: z.enum(["lexical", "basic", "hybrid"]).optional().describe("Retrieval mode; defaults to deterministic basic retrieval."),
    },
    async ({ repository_root, question, model, limit, mode }) => {
      try {
        const selectedMode = mode ?? "basic";
        if (selectedMode === "hybrid" && !advancedRetrievalEnabled) throw new Error("Hybrid mode is disabled; set ENABLE_SEMANTIC_SEARCH=1 and ENABLE_GIT_HISTORY=1, or use basic mode.");
        return { content: [{ type: "text", text: JSON.stringify(await discoverEvidence(repository_root, question, { model, limit, mode: selectedMode })) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed evidence discovery: ${error.message}` }] };
      }
    }
  );
}
