import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { outlineFile } from "../super-explorer/outline-file.js";

export function registerOutlineFile(server: McpServer) {
  server.tool(
    "outline_file",
    "Returns the indexed declaration outline for one supported source file. Use this before read_symbol to choose focused source ranges.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      path: z.string().describe("Repository-relative path to the source file."),
    },
    async ({ repository_root, path }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(outlineFile(repository_root, path)) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed to outline ${path}: ${error.message}` }] };
      }
    }
  );
}
