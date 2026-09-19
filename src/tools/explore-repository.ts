import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exploreRepository } from "../super-explorer/explore.js";

export function registerExploreRepository(server: McpServer) {
  server.tool("explore_repository", "Runs bounded retrieval, discovery, evidence materialization, verification, and cited synthesis. It emits only claims verified from materialized repository evidence.", {
    repository_root: z.string().describe("Absolute path to the Git repository root."),
    question: z.string().min(1).describe("A bounded repository question."),
    model: z.string().optional().describe("Ollama model for discovery and verification; defaults to qwen3.5:4b."),
    limit: z.number().int().min(1).max(40).optional().describe("Maximum retrieval candidates; defaults to 10."),
    mode: z.enum(["lexical", "hybrid"]).optional().describe("Retrieval mode; defaults to hybrid."),
    think: z.boolean().optional().describe("Enable the model's thinking mode for discovery and verification calls; defaults to false."),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await exploreRepository(input)) }] }; }
    catch (error: any) { return { isError: true, content: [{ type: "text", text: `Failed repository exploration: ${error.message}` }] }; }
  });
}
