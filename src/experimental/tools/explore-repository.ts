import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exploreRepository } from "../explorer/explore.js";

export function registerExploreRepository(server: McpServer, advancedRetrievalEnabled = false) {
  server.tool("explore_repository", "Runs bounded retrieval, discovery, evidence materialization, verification, and cited synthesis. It emits only claims verified from materialized repository evidence.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
    question: z.string().min(1).describe("A bounded repository question."),
    model: z.string().optional().describe("Ollama model for discovery and verification; defaults to qwen3.5:4b."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum retrieval candidates; defaults to 10."),
    mode: z.enum(["lexical", "basic", "hybrid"]).optional().describe("Retrieval mode; defaults to deterministic basic retrieval."),
    think: z.boolean().optional().describe("Enable the model's thinking mode for discovery and verification calls; defaults to false."),
  }, async (input) => {
    try {
      const mode = input.mode ?? "basic";
      if (mode === "hybrid" && !advancedRetrievalEnabled) throw new Error("Hybrid mode is disabled; set ENABLE_SEMANTIC_SEARCH=1 and ENABLE_GIT_HISTORY=1, or use basic mode.");
      return { content: [{ type: "text", text: JSON.stringify(await exploreRepository({ ...input, mode })) }] };
    }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed repository exploration: ${error.message}` }] }; }
  });
}
