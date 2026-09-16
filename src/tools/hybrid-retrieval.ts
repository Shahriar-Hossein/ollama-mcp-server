import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hybridRetrieve } from "../super-explorer/hybrid-retrieval.js";

export function registerHybridRetrieval(server: McpServer) {
  server.tool(
    "hybrid_retrieve",
    "Ranks source-symbol candidates with lexical, local semantic, and source-derived structural retrieval. Use lexical mode for a lexical-only benchmark baseline, then read_symbol to verify claims.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      query: z.string().describe("Question, identifier, path, or behavior to retrieve."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum candidates; defaults to 10."),
      mode: z.enum(["lexical", "hybrid"]).optional().describe("lexical is the benchmark baseline; hybrid fuses lexical, semantic, and structural rankings."),
      model: z.string().optional().describe("Local Ollama embedding model for hybrid mode."),
    },
    async ({ repository_root, query, limit, mode, model }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await hybridRetrieve(repository_root, query, limit, mode, model)) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed hybrid retrieval: ${error.message}` }] };
      }
    }
  );
}
