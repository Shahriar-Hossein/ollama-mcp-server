import { resolve } from "node:path";
import { validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";
import { parseLanguageEvalArgs, runLanguageEval, type EvalFixtureDescriptor } from "./run-language-eval.js";

export const PYTHON_DICTIONARY_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-09-python-dictionary-eval.json"),
  sourcePath: resolve("scripts/experimental/fixtures/python-dictionary-eval/source"),
  sha256: "23d07f4887ce460e4cf0ae8a3e634b61680c4248a626ab47ebad70e8b0a203fd",
  validate: validatePythonDictionaryFixture,
  implementationFiles: [
    "scripts/experimental/run-python-dictionary-eval.ts",
    "scripts/experimental/python-dictionary-eval-fixture.ts",
    "src/experimental/tools/local-explore-python-dictionary.ts",
    "scripts/experimental/fixtures/python-dictionary-eval/source/python/module.py",
    "scripts/experimental/fixtures/python-dictionary-eval/source/python/local.py",
    "scripts/experimental/fixtures/python-dictionary-eval/source/python/async.py",
    "scripts/experimental/fixtures/python-dictionary-eval/source/python/parameter.py",
  ],
};

export function parsePythonDictionaryEvalArgs(args: string[]) {
  const options = parseLanguageEvalArgs(args);
  if (!args.includes("--output")) options.output = resolve("benchmark-data/language-eval/python-dictionary-development/baseline.json");
  return options;
}

export function runPythonDictionaryEval(
  options: Omit<Parameters<typeof runLanguageEval>[0], "fixture" | "answerContextMode">,
  descriptor = PYTHON_DICTIONARY_FIXTURE,
) {
  return runLanguageEval({ ...options, fixture: descriptor, answerContextMode: "selected_only" });
}

if (process.argv[1]?.endsWith("run-python-dictionary-eval.ts")) {
  const options = parsePythonDictionaryEvalArgs(process.argv.slice(2));
  runPythonDictionaryEval(options)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
