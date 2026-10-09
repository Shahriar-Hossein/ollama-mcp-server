import { resolve } from "node:path";
import { FRESH_SPEC, validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";
import { parseLanguageEvalArgs, type EvalFixtureDescriptor } from "./run-language-eval.js";
import { runPythonDictionaryEval } from "./run-python-dictionary-eval.js";

const sourcePath = resolve("scripts/experimental/fixtures/python-dictionary-fresh/source");

export const PYTHON_DICTIONARY_FRESH_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-09-python-dictionary-fresh-eval.json"),
  sourcePath,
  sha256: "af09af0fffab1334c4256e815fb52349a0d4c1456cdd7bb5c93ac12e1da97ee1",
  validate: (fixture, root) => validatePythonDictionaryFixture(fixture, root, FRESH_SPEC),
  implementationFiles: [
    "scripts/experimental/run-python-dictionary-fresh-eval.ts",
    "scripts/experimental/python-dictionary-eval-fixture.ts",
    "src/experimental/tools/local-explore-python-dictionary.ts",
    ...Object.values(FRESH_SPEC.questions).map((file) => `scripts/experimental/fixtures/python-dictionary-fresh/source/${file}`),
  ],
};

if (process.argv[1]?.endsWith("run-python-dictionary-fresh-eval.ts")) {
  const options = parseLanguageEvalArgs(process.argv.slice(2));
  runPythonDictionaryEval(options, PYTHON_DICTIONARY_FRESH_FIXTURE)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
