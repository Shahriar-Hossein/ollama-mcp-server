import { resolve } from "node:path";
import { HELDOUT_SPEC, validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";
import { parseLanguageEvalArgs, type EvalFixtureDescriptor } from "./run-language-eval.js";
import { runPythonDictionaryEval } from "./run-python-dictionary-eval.js";

const sourcePath = resolve("scripts/experimental/fixtures/python-dictionary-heldout/source");

export const PYTHON_DICTIONARY_HELDOUT_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-10-python-dictionary-heldout-eval.json"),
  sourcePath,
  sha256: "bfb47e24ab181707aeedbbba573d51e1ce7e79ba9ce675fa9481607ba4487a15",
  validate: (fixture, root) => validatePythonDictionaryFixture(fixture, root, HELDOUT_SPEC),
  implementationFiles: [
    "scripts/experimental/run-python-dictionary-heldout-eval.ts",
    "scripts/experimental/python-dictionary-eval-fixture.ts",
    "src/experimental/tools/local-explore-python-dictionary.ts",
    ...Object.values(HELDOUT_SPEC.questions).map((file) => `scripts/experimental/fixtures/python-dictionary-heldout/source/${file}`),
  ],
};

if (process.argv[1]?.endsWith("run-python-dictionary-heldout-eval.ts")) {
  const options = parseLanguageEvalArgs(process.argv.slice(2));
  runPythonDictionaryEval(options, PYTHON_DICTIONARY_HELDOUT_FIXTURE)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
