import { resolve } from "node:path";
import { validateScopeFixture } from "./scope-eval-fixture.js";
import { parseLanguageEvalArgs, runLanguageEval, type EvalFixtureDescriptor } from "./run-language-eval.js";

export const SCOPE_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-09-scope-eval.json"),
  sourcePath: resolve("scripts/experimental/fixtures/scope-eval/source"),
  sha256: "f413e08dbc6ac75ee324ddcfd3f59a54085a7f229d4d1bb5aa811ea4a6adcd0f",
  validate: validateScopeFixture,
  implementationFiles: [
    "scripts/experimental/run-scope-eval.ts",
    "scripts/experimental/scope-eval-fixture.ts",
    "scripts/experimental/fixtures/scope-eval/source/php/scopes.php",
    "scripts/experimental/fixtures/scope-eval/source/python/scopes.py",
  ],
};

export function parseScopeEvalArgs(args: string[]) {
  const options = parseLanguageEvalArgs(args);
  if (!args.includes("--output"))
    options.output = resolve("benchmark-data/language-eval/scope-development/baseline.json");
  return options;
}

export function runScopeEval(options: Omit<Parameters<typeof runLanguageEval>[0], "fixture">) {
  return runLanguageEval({ ...options, fixture: SCOPE_FIXTURE });
}

if (process.argv[1]?.endsWith("run-scope-eval.ts")) {
  const options = parseScopeEvalArgs(process.argv.slice(2));
  runScopeEval(options)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
