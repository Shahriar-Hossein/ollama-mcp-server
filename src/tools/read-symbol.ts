import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSymbol } from "../explorer/read-symbol.js";

export function registerReadSymbol(server: McpServer) {
  server.tool(
    "read_symbol",
    "Returns one indexed symbol's source range, body, and one line of surrounding context. Obtain the stable symbol ID from outline_file.",
    {
      repository_root: z.string().describe("Absolute path to the Git repository root to explore."),
      symbol_id: z.string().describe("Stable indexed symbol ID returned by outline_file."),
    },
    async ({ repository_root, symbol_id }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(readSymbol(repository_root, symbol_id)) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Failed to read symbol ${symbol_id}: ${error.message}` }] };
      }
    }
  );
}
