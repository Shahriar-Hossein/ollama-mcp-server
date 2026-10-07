#!/usr/bin/env node
// PreToolUse hook for run_cloud_claude_task's `ollama launch claude` subprocess.
//
// --allowedTools splits compound commands (&&/;/|) and checks each part, but
// per Claude Code's own docs that's not a security boundary: it doesn't catch
// wrapping (bash -c '...'), git flag injection (git -c core.editor=...), or
// absolute-path invocation. This hook re-validates the raw command text
// independently of --allowedTools. Keep the allowed-subcommand list in sync
// with src/experimental/workers/shell-allowlist.ts.
const ALLOWED_SUBCOMMANDS = ["status", "diff", "log", "add", "commit", "show"];
const SHELL_METACHARACTERS = /[;&|`\n<>]|\$\(/;

// Per-subcommand flag allowlist. A subcommand alone is not enough:
// `git diff --output=f` writes a file and `git commit --amend` rewrites history.
// Mirrors FLAG_POLICY in src/experimental/workers/shell-allowlist.ts; keep in sync by hand.
const DIFFISH = [
  "--stat",
  "--shortstat",
  "--name-only",
  "--name-status",
  "--no-color",
  "--patch",
  "-p",
  "-w",
  "--cached",
  "--staged",
  "--oneline",
  "--graph",
  "--decorate",
  "--no-decorate",
  "--",
];
const FLAG_POLICY = {
  status: {
    flags: ["-s", "--short", "-b", "--branch", "--porcelain", "--long", "--"],
    patterns: [/^--porcelain=v[12]$/],
    valueFlags: [],
  },
  diff: { flags: DIFFISH, patterns: [/^-U\d+$/, /^--unified=\d+$/], valueFlags: [] },
  log: {
    flags: DIFFISH,
    patterns: [/^-n?\d+$/, /^--max-count=\d+$/, /^--pretty=(oneline|short|medium|full)$/],
    valueFlags: ["-n", "--max-count"],
  },
  show: {
    flags: DIFFISH,
    patterns: [/^-U\d+$/, /^--pretty=(oneline|short|medium|full)$/],
    valueFlags: [],
  },
  add: { flags: ["-A", "--all", "-u", "--update", "--"], patterns: [], valueFlags: [] },
  commit: {
    flags: ["-a", "--all", "--allow-empty", "-q", "--quiet", "--"],
    patterns: [/^-am$/, /^--message=/],
    valueFlags: ["-m", "--message"],
  },
};

// Paths/revisions must stay inside the repo: no absolute, home or parent-dir paths.
const escapesRepo = (arg) => /^[/~]|(^|\/)\.\.(\/|$)|:\//.test(arg);

function allowedArguments(subcommand, args) {
  const policy = FLAG_POLICY[subcommand];
  let afterDashes = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!afterDashes && arg === "--") afterDashes = true;
    if (escapesRepo(arg) && !arg.startsWith("--message=")) return false;
    if (afterDashes || !arg.startsWith("-")) continue;
    if (policy.valueFlags.includes(arg)) {
      if (i + 1 >= args.length) return false;
      i++;
      continue;
    }
    if (!policy.flags.includes(arg) && !policy.patterns.some((re) => re.test(arg))) return false;
    if (arg === "-am") {
      if (i + 1 >= args.length) return false;
      i++;
    }
  }
  return true;
}

function tokenize(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

function block(reason) {
  console.error(reason);
  process.exit(2); // exit 2 = block; stderr is surfaced to the model as the reason
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    block("Blocked: hook input was not valid JSON.");
  }

  if (data.tool_name !== "Bash") process.exit(0);

  const command = String(data.tool_input?.command || "");
  const tokens = tokenize(command.trim());
  const ok =
    !SHELL_METACHARACTERS.test(command) &&
    tokens[0] === "git" &&
    ALLOWED_SUBCOMMANDS.includes(tokens[1]) &&
    allowedArguments(tokens[1], tokens.slice(2));

  if (!ok)
    block(`Blocked: "${command}" is not an allowed git command, or uses shell chaining/wrapping or a disallowed flag.`);
  process.exit(0);
});
