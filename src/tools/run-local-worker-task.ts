import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { OLLAMA_HOST } from "../ollama-client.js";
import { ALLOWLIST_DESCRIPTION, parseAllowedGitCommand, WORKER_SYSTEM_PROMPT } from "../shell-allowlist.js";

// Tier 2 from docs/planning/local-claude-worker-experiment.md: a hand-rolled
// tool loop against Ollama's /api/chat, no Claude Code harness. ~10s for a
// real git commit vs. minutes for a full-harness cloud run via run_cloud_claude_task.
//
// qwen2.5-coder:3b does not emit proper tool_calls (dumps them as text) so it
// cannot drive this loop - qwen3.5:4b is the only model confirmed to work.

const TOOLS = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run a shell command in the working directory and return its output.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "The shell command to run." } },
        required: ["command"],
      },
    },
  },
];

function runShellTool(command: string, cwd: string): string {
  const argv = parseAllowedGitCommand(command);
  if (!argv) {
    return `Refused: "${command}" is not on the allowlist (${ALLOWLIST_DESCRIPTION}).`;
  }
  // No shell: argv is exec'd directly, so chaining/substitution in the
  // model's command string can't do anything - there's no shell to interpret it.
  const result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 30_000, cwd });
  if (result.error) return `Command failed to start: ${result.error.message}`;
  if (result.status !== 0) return `Command failed (exit ${result.status}): ${result.stdout || ""}${result.stderr || ""}`;
  return result.stdout.trim() || "(no output)";
}

export function registerRunLocalWorkerTask(server: McpServer) {
  server.tool(
    "run_local_worker_task",
    "Runs a small, mechanical git task (status/diff/log/add/commit/show only) end-to-end using a local Ollama " +
      "model with its own bash tool loop - no confirmation prompts, verify the result yourself afterward. " +
      "Fast (seconds) but has no safety net beyond the command allowlist. Requires LOCAL_WORKER_ENABLED=1.",
    {
      task: z.string().describe("The task to perform, e.g. 'stage and commit src/foo.ts with message X'."),
      cwd: z.string().optional().describe("Working directory to run in. Defaults to the MCP server's own cwd."),
      model: z.string().default("qwen3.5:4b").describe("Must be a model that emits real tool_calls (qwen3.5:4b confirmed; qwen2.5-coder:3b does not)."),
      max_turns: z.number().default(6),
    },
    async ({ task, cwd, model, max_turns }) => {
      const workDir = cwd || process.cwd();
      const messages: any[] = [
        { role: "system", content: WORKER_SYSTEM_PROMPT },
        { role: "user", content: task },
      ];

      const start = Date.now();
      for (let turn = 0; turn < max_turns; turn++) {
        const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
          method: "POST",
          body: JSON.stringify({ model, stream: false, think: false, messages, tools: TOOLS }),
        });
        const data: any = await res.json();
        const message = data.message;
        messages.push(message);

        if (!message.tool_calls || message.tool_calls.length === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          return { content: [{ type: "text", text: `${message.content}\n\n[done in ${elapsed}s, ${turn + 1} turn(s)]` }] };
        }

        for (const call of message.tool_calls) {
          const result = runShellTool(call.function.arguments?.command || "", workDir);
          messages.push({ role: "tool", content: result, tool_call_id: call.id });
        }
      }

      return { isError: true, content: [{ type: "text", text: `Gave up after ${max_turns} turns without a final answer.` }] };
    }
  );
}
