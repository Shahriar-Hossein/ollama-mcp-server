import assert from "node:assert/strict";
import test from "node:test";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import { pythonDictionaryEntryRows, pythonDictionaryRequest } from "./local-explore-python-dictionary.js";

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

function dictionary(source: string): Parser.SyntaxNode {
  const parser = new Parser();
  parser.setLanguage(Python);
  const node = parser.parse(`OPTIONS = ${source}`).rootNode.descendantsOfType("dictionary")[0];
  assert.ok(node, source);
  return node;
}

test("Python dictionary entry rows accept bounded literals and preserve source rows", () => {
  assert.deepEqual(pythonDictionaryEntryRows(dictionary("{'mode': 'fast'}")), [1]);
  assert.deepEqual(pythonDictionaryEntryRows(dictionary("{'a': .5, 'b': 1., 'c': 1e-2}")), [1]);
  assert.deepEqual(pythonDictionaryEntryRows(dictionary('{\n# note\n"mode": "fast",\n\'count\': 12, # trailing note\n"scale": 1.5E+2,\n}')), [3, 4, 5]);
  assert.deepEqual(pythonDictionaryEntryRows(dictionary("{'a': '', 'b': \"it's plain\", 'c': 'a\"b'}")), [1]);
});

test("Python dictionary entry rows reject the whole dictionary for unsupported entries", () => {
  for (const source of [
    "{}", "{# comment\n}", "{'a': 1, 'b': 2, 'c': 3, 'd': 4}",
    "{'mode': 1, \"mode\": 2}", "{'mode': 1, 'mode': 2}",
    "{key: 1}", "{'a': value}", "{**other}", "{'a': 1, **other}",
    "{'a': {'b': 2}}", "{'a': []}", "{'a': call()}",
    "{'a': True}", "{'a': None}", "{'a': -1}", "{'a': +1}",
    "{'a': 0xff}", "{'a': 1_000}", "{'a': 1j}",
    "{r'a': 1}", "{b'a': 1}", "{f'a': 1}", "{'''a''': 1}", "{\"\"\"a\"\"\": 1}",
    "{'a': r'raw'}", "{'a': b'bytes'}", "{'a': f'{value}'}",
    "{'a': '''triple'''}", "{'a': \"\"\"triple\"\"\"}",
    "{'a\\n': 1}", "{'a': 'escape\\n'}", "{'a' 'b': 1}", "{'a': 'b' 'c'}",
    "{'a':\n1}", "{'a': '''multi\nline'''}", "{'a': 1,, 'b': 2}", "{'a': 1, : 2}",
  ]) assert.equal(pythonDictionaryEntryRows(dictionary(source)), null, source);
  assert.equal(pythonDictionaryEntryRows(dictionary("{'a': 1}").namedChildren[0]), null);
});

test("Python dictionary entry rows reject missing or erroneous nodes and fields", () => {
  const valid = dictionary("{'a': 1}");
  const pair = valid.namedChildren[0];
  const key = pair.childForFieldName("key");
  const value = pair.childForFieldName("value");
  assert.ok(key && value);
  const overlay = (node: Parser.SyntaxNode, fields: Partial<Parser.SyntaxNode>) => new Proxy(node, {
    get(target, property) {
      if (Object.hasOwn(fields, property)) return Reflect.get(fields, property);
      const original = Reflect.get(target, property);
      return typeof original === "function" ? original.bind(target) : original;
    },
  });
  for (const flag of ["isMissing", "hasError"] as const) {
    assert.equal(pythonDictionaryEntryRows(overlay(valid, { [flag]: true })), null);
    assert.equal(pythonDictionaryEntryRows(overlay(valid, { namedChildren: [overlay(pair, { [flag]: true })] })), null);
    for (const field of ["key", "value"]) {
      const badPair = overlay(pair, {
        childForFieldName: (name: string) => name === field ? overlay(field === "key" ? key : value, { [flag]: true }) : pair.childForFieldName(name),
      });
      assert.equal(pythonDictionaryEntryRows(overlay(valid, { namedChildren: [badPair] })), null);
    }
  }
  for (const field of ["key", "value"]) {
    const badPair = overlay(pair, { childForFieldName: (name: string) => name === field ? null : pair.childForFieldName(name) });
    assert.equal(pythonDictionaryEntryRows(overlay(valid, { namedChildren: [badPair] })), null);
  }
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
