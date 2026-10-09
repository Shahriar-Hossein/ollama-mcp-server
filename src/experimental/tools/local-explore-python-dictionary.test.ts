import assert from "node:assert/strict";
import test from "node:test";
import { pythonDictionaryRequest } from "./local-explore-python-dictionary.js";

test("Python dictionary request preserves identifiers and accepts surrounding prose", () => {
  for (const query of [
    "Which OPTIONS dictionary does process_background read, what mode does it return?",
    "Please explain: Which OPTIONS dictionary does process_background read?",
    "Which OPTIONS dictionary does process_background read",
    "Which OPTIONS dictionary does process_background read\nnext question",
  ]) {
    assert.deepEqual(pythonDictionaryRequest(query), { dictionary: "OPTIONS", reader: "process_background" }, query);
  }
  assert.deepEqual(pythonDictionaryRequest("which Queue_Config dictionary DOES do_work READ?"), {
    dictionary: "Queue_Config",
    reader: "do_work",
  });
  assert.deepEqual(pythonDictionaryRequest("WHICH\n_config2 DICTIONARY\tdoes _reader3 read?"), {
    dictionary: "_config2",
    reader: "_reader3",
  });
});

test("Python dictionary request rejects unsupported names and partial prose matches", () => {
  for (const query of [
    "Which pkg.OPTIONS dictionary does worker read?",
    "Which OPTIONS dictionary does pkg.worker read?",
    "Which OPTIONS-name dictionary does worker read?",
    "Which OPTIONS dictionary does do-work read?",
    "Which 2OPTIONS dictionary does worker read?",
    "Which OPTIONS dictionary does 2worker read?",
    "Which ÖPTIONS dictionary does worker read?",
    "Which OPTIONS dictionary does wörker read?",
    "Which 'OPTIONS' dictionary does worker read?",
    'Which OPTIONS dictionary does "worker" read?',
    "Which `OPTIONS` dictionary does worker read?",
    "Which OPTIONS dictionary does `worker` read?",
    'Which "noise" OPTIONS dictionary does worker read?',
    "Which OPTIONS dictionary does 'noise' worker read?",
    "Which OPTIONS dictionary does worker reading?",
    "Which OPTIONS dictionary does worker reader?",
    "Which OPTIONS dictionary does worker read.",
    "Which OPTIONS dictionary does worker read-more?",
    "SomeWhich OPTIONS dictionary does worker read?",
    "Which dictionary does worker read?",
    "Which OPTIONS dictionary does worker write?",
    "",
  ]) assert.equal(pythonDictionaryRequest(query), null, query);
});

test("Python dictionary request requires exactly one unquoted phrase", () => {
  const one = "Which OPTIONS dictionary does one read?";
  const two = "Which OPTIONS dictionary does two read?";
  assert.equal(pythonDictionaryRequest(`${one} and ${two}`), null);
  assert.equal(pythonDictionaryRequest(`${one} ${one}`), null);
  for (const quote of ['"', "'", "`"]) {
    assert.equal(pythonDictionaryRequest(`${quote}${one}${quote}`), null);
    assert.equal(pythonDictionaryRequest(`${quote} ${one} ${quote}`), null);
    assert.deepEqual(pythonDictionaryRequest(`${quote}${two}${quote} and ${one}`), {
      dictionary: "OPTIONS",
      reader: "one",
    });
  }
});
