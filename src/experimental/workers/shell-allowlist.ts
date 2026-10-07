// Shared between run-local-worker-task and run-cloud-claude-task so the two
// agentic tools can't drift into different safety guarantees. Mirrors
// ~/.local/bin/local-worker and ~/.local/bin/local-claude's allowlists,
// validated in docs/experimental/planning/local-claude-worker-experiment.md.
export const ALLOWLIST_DESCRIPTION = "git status/diff/log/add/commit/show only";

const ALLOWED_SUBCOMMANDS = ["status", "diff", "log", "add", "commit", "show"];

// Bare regex prefix-matching a command string (e.g. /^git commit(\s|$)/) is not
// safe on its own: "git commit -m x && rm -rf /" still starts with "git commit".
// Reject shell metacharacters outright and tokenize so callers can exec the
// parsed argv directly (no shell), which is what actually closes the hole.
const SHELL_METACHARACTERS = /[;&|`\n<>]|\$\(/;

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

// Per-subcommand flag allowlist. A subcommand alone is not enough:
// `git diff --output=f` writes a file and `git commit --amend` rewrites history.
// Keep in sync by hand with scripts/validate-cloud-bash.cjs.
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
const FLAG_POLICY: Record<string, { flags: string[]; patterns: RegExp[]; valueFlags: string[] }> = {
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
const escapesRepo = (arg: string) => /^[/~]|(^|\/)\.\.(\/|$)|:\//.test(arg);

function allowedArguments(subcommand: string, args: string[]): boolean {
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

// Returns the parsed argv (["git", "commit", "-m", "msg"]) if `command` is
// exactly one allowed git invocation, or null if it isn't - including any
// attempt to chain, substitute, or wrap it (bash -c, git -c, absolute paths)
// or pass a flag outside the per-subcommand allowlist.
export function parseAllowedGitCommand(command: string): string[] | null {
  if (SHELL_METACHARACTERS.test(command)) return null;
  const tokens = tokenize(command.trim());
  if (tokens[0] !== "git") return null;
  if (!ALLOWED_SUBCOMMANDS.includes(tokens[1])) return null;
  if (!allowedArguments(tokens[1], tokens.slice(2))) return null;
  return tokens;
}

export function isAllowedCommand(command: string): boolean {
  return parseAllowedGitCommand(command) !== null;
}

// For local-claude's --allowedTools flag, which takes Bash(<pattern>:*) entries.
export const ALLOWED_TOOLS_FLAG =
  "Read,Glob,Grep,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(git show:*)";

export const WORKER_SYSTEM_PROMPT = `You are a small local coding worker with one tool: bash.

Rules:
- Work only in the current directory.
- Use the minimum number of tool calls to finish the task.
- Never push to a remote repository.
- Never use destructive git commands (reset --hard, clean -fd, etc).
- When the task is done, reply with plain text and no further tool calls.`;

export const CLAUDE_SYSTEM_PROMPT = `You are a small coding worker.

Perform only the task given to you.

Rules:
- Work only in the current working directory.
- Do not explore unrelated files.
- Prefer the minimum number of tool calls.
- Do not redesign or refactor unless explicitly requested.
- Do not ask follow-up questions for straightforward tasks.
- Never push to a remote repository.
- Never use destructive git commands such as reset --hard or clean -fd.
- When finished, briefly report what you did.`;
