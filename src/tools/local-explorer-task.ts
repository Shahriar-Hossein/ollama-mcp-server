import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { OLLAMA_HOST } from "../ollama-client.js";

// Read-only repo-discovery worker: promoted from the throwaway harness used
// in docs/benchmarks/local-explorer-2026-09-16.md. That pilot found
// qwen3.5:4b is the only local model that reliably drives this tool loop
// (qwen2.5-coder:7b doesn't emit real tool_calls and fabricates confidently;
// granite4.2:3b works but wastes its budget guessing paths) - see that doc
// before changing the default model or the confidence-gate framing below.
//
// Unlike run_local_worker_task/run_cloud_claude_task, this tool only reads -
// no shell command ever runs unvalidated. Still capped hard on tool calls,
// files read, and output size so a confused model can't turn "explore the
// repo" into "read everything."

const DEFAULT_MODEL = "qwen3.5:4b";
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

const TOOLS = [
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files by name pattern (e.g. 'src/**/*.ts'). Returns matching relative paths.",
      parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents for a regex pattern. Returns matching file:line:text.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string", description: "Directory or file to search. Defaults to repo root." },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read",
      description: "Read a file's contents (optionally a line range).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          start_line: { type: "number" },
          end_line: { type: "number" },
        },
        required: ["path"],
      },
    },
  },
];

function systemPrompt(maxToolCalls: number, maxFilesRead: number): string {
  return `You are a fast, cheap repo-exploration worker. You have three read-only tools: glob, grep, read.
Your job: find the exact files/functions relevant to the user's question and report concise evidence.
Rules:
- You get at most ${maxToolCalls} tool calls total and may read at most ${maxFilesRead} files. Budget them.
- Never guess a file exists - use glob/grep to confirm before reading. Guessing paths instead of grepping for a real term wastes your budget and produces wrong answers.
- When done, reply with a FINAL ANSWER in this exact format and nothing else:
FINAL ANSWER:
Files: <comma-separated relative paths>
Functions/symbols: <comma-separated names>
Evidence: <2-4 short bullet lines, each citing file:line>
Confidence: <high|medium|low>
If you used most of your budget without confirming an answer via grep/read, say Confidence: low rather than guessing - a low-confidence answer here gets escalated to a stronger model instead of trusted as-is.`;
}

// Resolves a model-supplied relative path against the repo root and refuses
// anything that escapes it (../, absolute paths) - the model's path input is
// untrusted, same reasoning as shell-allowlist.ts's argv validation.
function resolveWithinRoot(root: string, relPath: string): string | null {
  const resolved = resolve(root, relPath);
  const rel = relative(root, resolved);
  if (rel === "") return resolved;
  if (rel.startsWith("..")) return null;
  return resolved;
}

function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i++;
      if (pattern[i + 1] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function walk(dir: string, root: string, out: string[]) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, root, out);
    } else {
      out.push(relative(root, full));
    }
  }
}

function runGlob(root: string, pattern: string): string {
  const regex = globToRegExp(pattern.replace(/^\.?\//, ""));
  const all: string[] = [];
  walk(root, root, all);
  const matches = all.filter((p) => regex.test(p)).slice(0, 100);
  return matches.length ? matches.join("\n") : "(no matches)";
}

function runGrep(root: string, pattern: string, path: string | undefined, maxOutputChars: number): string {
  const searchPath = resolveWithinRoot(root, path || ".");
  if (searchPath === null) return "(refused: path escapes repo root)";
  try {
    const out = execFileSync(
      "grep",
      ["-rn", "-E", "--include=*.*", pattern, searchPath],
      { encoding: "utf8", timeout: 5000 }
    );
    const lines = out.trim().split("\n").filter((l) => !l.includes("/node_modules/") && !l.includes("/.git/"));
    const text = lines.slice(0, 50).join("\n");
    return text ? (text.length > maxOutputChars ? text.slice(0, maxOutputChars) + "\n...(truncated)" : text) : "(no matches)";
  } catch {
    return "(no matches)";
  }
}

function runRead(
  root: string,
  path: string,
  startLine: number | undefined,
  endLine: number | undefined,
  filesRead: Set<string>,
  maxFilesRead: number,
  maxOutputChars: number
): string {
  const full = resolveWithinRoot(root, path);
  if (full === null) return "(refused: path escapes repo root)";
  if (filesRead.size >= maxFilesRead && !filesRead.has(path)) {
    return `(refused: file-read budget of ${maxFilesRead} exhausted)`;
  }
  filesRead.add(path);
  try {
    const content = readFileSync(full, "utf8");
    let lines = content.split("\n");
    if (startLine || endLine) {
      lines = lines.slice((startLine || 1) - 1, endLine || lines.length);
    }
    const text = lines.map((l, i) => `${(startLine || 1) + i}\t${l}`).join("\n");
    return text.length > maxOutputChars ? text.slice(0, maxOutputChars) + "\n...(truncated)" : text;
  } catch (e: any) {
    return `(read error: ${e.message})`;
  }
}

export function registerLocalExplorerTask(server: McpServer) {
  server.tool(
    "local_explorer_task",
    "Delegates read-only repo discovery (find files, grep symbols, read code, trace how something works) to a " +
      "local Ollama model with a Glob/Grep/Read tool loop, bounded on tool calls/files/output. Returns a FINAL " +
      "ANSWER with files, symbols, cited evidence, and a self-reported confidence. Per " +
      "docs/benchmarks/local-explorer-2026-09-16.md: treat 'low' confidence as a signal to redo the search " +
      "yourself or with a stronger model rather than trusting it - qwen3.5:4b's own hallucination in that pilot " +
      "was correctly self-flagged low confidence. Never trusted blindly for anything you'll act on directly.",
    {
      task: z.string().describe("The exploration question, e.g. 'find where X is validated and cite the function'."),
      cwd: z.string().optional().describe("Repo root to search in. Defaults to the MCP server's own cwd."),
      model: z.string().default(DEFAULT_MODEL).describe("Must be a model that emits real tool_calls (qwen3.5:4b confirmed; qwen2.5-coder:7b does not - see benchmark doc)."),
      max_tool_calls: z.number().default(8),
      max_files_read: z.number().default(5),
      max_output_chars: z.number().default(3000).describe("Per-tool-result truncation limit."),
    },
    async ({ task, cwd, model, max_tool_calls, max_files_read, max_output_chars }) => {
      const root = resolve(cwd || process.cwd());
      const filesRead = new Set<string>();
      const messages: any[] = [
        { role: "system", content: systemPrompt(max_tool_calls, max_files_read) },
        { role: "user", content: task },
      ];

      let toolCallCount = 0;
      const start = Date.now();

      for (let turn = 0; turn < max_tool_calls + 2; turn++) {
        const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
          method: "POST",
          body: JSON.stringify({ model, stream: false, think: false, messages, tools: TOOLS }),
        });
        const data: any = await res.json();
        const message = data.message;
        if (!message) {
          return {
            isError: true,
            content: [{ type: "text", text: `Ollama returned no message (${res.status}): ${data.error || JSON.stringify(data)}` }],
          };
        }
        messages.push(message);

        if (!message.tool_calls || message.tool_calls.length === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          return {
            content: [{ type: "text", text: `${message.content}\n\n[${toolCallCount} tool call(s), ${filesRead.size} file(s) read, ${elapsed}s]` }],
          };
        }

        for (const call of message.tool_calls) {
          toolCallCount++;
          const args = call.function.arguments || {};
          let result: string;
          if (toolCallCount > max_tool_calls) {
            result = "(refused: tool-call budget exhausted, give your FINAL ANSWER now)";
          } else if (call.function.name === "glob") {
            result = runGlob(root, args.pattern);
          } else if (call.function.name === "grep") {
            result = runGrep(root, args.pattern, args.path, max_output_chars);
          } else if (call.function.name === "read") {
            result = runRead(root, args.path, args.start_line, args.end_line, filesRead, max_files_read, max_output_chars);
          } else {
            result = `(unknown tool ${call.function.name})`;
          }
          messages.push({ role: "tool", content: result, tool_call_id: call.id });
        }
      }

      return { isError: true, content: [{ type: "text", text: `Gave up after ${max_tool_calls} tool calls without a final answer.` }] };
    }
  );
}
