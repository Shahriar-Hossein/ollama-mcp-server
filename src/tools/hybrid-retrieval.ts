import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hybridRetrieve } from "../super-explorer/hybrid-retrieval.js";

export function registerHybridRetrieval(server: McpServer, advancedRetrievalEnabled = false) {
  server.tool(
    "hybrid_retrieve",
    "Ranks source symbols plus structural, documentation, package-script, and Git-commit evidence without embeddings by default. Returned evidence is source-backed context, not a verified answer.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      query: z.string().describe("Question, identifier, path, or behavior to retrieve."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum candidates; defaults to 10."),
      mode: z.enum(["lexical", "basic", "hybrid"]).optional().describe("basic (default) fuses deterministic rankings; lexical is symbol-only; hybrid also uses embeddings when enabled."),
      model: z.string().optional().describe("Local Ollama embedding model for enabled hybrid mode."),
    },
    async ({ repository_root, query, limit, mode, model }) => {
      try {
        const selectedMode = mode ?? "basic";
        if (selectedMode === "hybrid" && !advancedRetrievalEnabled) throw new Error("Hybrid mode is disabled; set ENABLE_SEMANTIC_SEARCH=1 and ENABLE_GIT_HISTORY=1, or use basic mode.");
        return { content: [{ type: "text", text: JSON.stringify(await hybridRetrieve(repository_root, query, limit, selectedMode, model)) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed hybrid retrieval: ${error.message}` }] };
      }
    }
  );
}
