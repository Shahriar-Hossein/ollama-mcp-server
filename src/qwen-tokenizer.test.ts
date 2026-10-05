import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadQwenTokenizer, matchingQwenPath } from "./qwen-tokenizer.js";

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const string = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);

test("reads bounded GGUF vocabulary and applies byte BPE, Unicode and special tokens", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qwen-tokenizer-"));
  try {
    const printable = [...Array.from({ length: 94 }, (_, i) => i + 33), ...Array.from({ length: 12 }, (_, i) => i + 161), ...Array.from({ length: 82 }, (_, i) => i + 174)];
    const encoded = printable.map((n) => String.fromCodePoint(n));
    let extra = 256;
    for (let n = 0; n < 256; n++) if (!printable.includes(n)) encoded.push(String.fromCodePoint(extra++));
    const tokens = [...encoded, "hi", "hihi", "<|im_start|>"];
    const kv = [
      ["tokenizer.ggml.model", 8, string("gpt2")], ["tokenizer.ggml.pre", 8, string("qwen35")],
      ["tokenizer.ggml.tokens", 9, Buffer.concat([u32(8), u64(tokens.length), ...tokens.map(string)])],
      ["tokenizer.ggml.merges", 9, Buffer.concat([u32(8), u64(2), string("h i"), string("hi hi")])],
      ["tokenizer.ggml.token_type", 9, Buffer.concat([u32(5), u64(tokens.length), ...tokens.map((_, i) => u32(i === tokens.length - 1 ? 3 : 1))])],
    ] as const;
    const path = join(dir, "fixture.gguf");
    await writeFile(path, Buffer.concat([Buffer.from("GGUF"), u32(3), u64(0), u64(kv.length), ...kv.flatMap(([key, type, raw]) => [string(key), u32(type), raw])]));
    const count = await loadQwenTokenizer(path);
    assert.equal(count("hihi"), 1);
    assert.equal(count("hi hi"), 3);
    assert.equal(count("é🚧"), Buffer.byteLength("é🚧"));
    assert.equal(count("hi<|im_start|>hi"), 3);
    assert.throws(() => count("x".repeat(4097)), /merge limit/);
    await writeFile(path, Buffer.from("GGUF"));
    await assert.rejects(loadQwenTokenizer(path), /incomplete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("only enables accounting for the installed H weights and named renderer", () => {
  const path = "/models/sha256-81fb60c7daa80fc1123380b98970b320ae233409f0f71a72ed7b9b0d62f40490";
  const settings = { modelfile: `FROM ${path}\nRENDERER qwen3.5\n`, template: "{{ .Prompt }}" };
  assert.equal(matchingQwenPath(settings), path);
  assert.equal(matchingQwenPath({ ...settings, template: "custom" }), undefined);
  assert.equal(matchingQwenPath({ ...settings, modelfile: "FROM /models/other\nRENDERER qwen3.5" }), undefined);
  assert.equal(matchingQwenPath({ ...settings, modelfile: `FROM ${path}` }), undefined);
});
