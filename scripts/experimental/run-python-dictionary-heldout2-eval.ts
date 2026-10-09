import { resolve } from "node:path";
import { HELDOUT2_SPEC, validatePythonDictionaryFixture } from "./python-dictionary-eval-fixture.js";
import { parseLanguageEvalArgs, type EvalFixtureDescriptor } from "./run-language-eval.js";
import { runPythonDictionaryEval } from "./run-python-dictionary-eval.js";

const sourcePath = resolve("scripts/experimental/fixtures/python-dictionary-heldout2/source");

export const PYTHON_DICTIONARY_HELDOUT2_FIXTURE: EvalFixtureDescriptor = {
  manifestPath: resolve("docs/experimental/benchmarks/runs/2026-10-10-python-dictionary-heldout2-eval.json"),
  sourcePath,
  sha256: "f9d4380efc7bbd8ec39626a9164632d3d24d91c61928d22fb01ae65e3817b3d2",
  validate: (fixture, root) => validatePythonDictionaryFixture(fixture, root, HELDOUT2_SPEC),
  implementationFiles: [
    "scripts/experimental/run-python-dictionary-heldout2-eval.ts",
    "scripts/experimental/python-dictionary-eval-fixture.ts",
    "src/experimental/tools/local-explore-python-dictionary.ts",
    ...Object.values(HELDOUT2_SPEC.questions).map((file) => `scripts/experimental/fixtures/python-dictionary-heldout2/source/${file}`),
  ],
};

if (process.argv[1]?.endsWith("run-python-dictionary-heldout2-eval.ts")) {
  const options = parseLanguageEvalArgs(process.argv.slice(2));
  runPythonDictionaryEval(options, PYTHON_DICTIONARY_HELDOUT2_FIXTURE)
    .then(({ results }) => process.stdout.write(`Completed ${results.length} question(s): ${options.output}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
