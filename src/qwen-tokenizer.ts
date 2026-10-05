import { open } from "node:fs/promises";

const H_WEIGHTS = "81fb60c7daa80fc1123380b98970b320ae233409f0f71a72ed7b9b0d62f40490";
const METADATA_LIMIT = 16 * 1024 * 1024;
// Qwen35's pre-tokenizer, from llama.cpp/src/llama-vocab.cpp.
// White_Space avoids JavaScript's different treatment of NEL and BOM.
const pieces = /(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])|[^\r\n\p{L}\p{N}]?[\p{L}\p{M}]+|\p{N}| ?[^\p{White_Space}\p{L}\p{M}\p{N}]+[\r\n]*|\p{White_Space}*[\r\n]+|\p{White_Space}+(?![^\p{White_Space}])|\p{White_Space}+/gu;

export function matchingQwenPath(settings: { modelfile?: string; template?: string }) {
  if (settings.template !== "{{ .Prompt }}" || !/^RENDERER qwen3\.5$/m.test(settings.modelfile ?? "")) return undefined;
  const path = /^FROM (\/[^\r\n]+)$/m.exec(settings.modelfile ?? "")?.[1];
  return path?.endsWith(`/sha256-${H_WEIGHTS}`) ? path : undefined;
}

async function vocabulary(path: string) {
  const file = await open(path, "r");
  const data = Buffer.alloc(METADATA_LIMIT);
  let size: number;
  try { size = (await file.read(data, 0, data.length, 0)).bytesRead; } finally { await file.close(); }
  let offset = 0;
  const take = (bytes: number) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || offset + bytes > size) throw new Error("GGUF metadata exceeds limit or is incomplete.");
    const value = data.subarray(offset, offset + bytes); offset += bytes; return value;
  };
  const u32 = () => take(4).readUInt32LE();
  const u64 = () => Number(take(8).readBigUInt64LE());
  const string = () => take(u64()).toString("utf8");
  function value(type: number, retain: boolean): unknown {
    if (type === 8) return string();
    if (type === 9) {
      const element = u32(), count = u64();
      if (element === 9 || count > 1_000_000) throw new Error("Unsupported GGUF array.");
      const result: unknown[] = [];
      for (let i = 0; i < count; i++) { const item = value(element, retain); if (retain) result.push(item); }
      return result;
    }
    const bytes = ({ 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 } as Record<number, number>)[type];
    if (!bytes) throw new Error("Unsupported GGUF value.");
    const raw = take(bytes);
    return type === 4 ? raw.readUInt32LE() : type === 5 ? raw.readInt32LE() : type === 7 ? raw[0] !== 0 : undefined;
  }
  if (take(4).toString() !== "GGUF" || u32() !== 3) throw new Error("Unsupported GGUF header.");
  u64();
  const count = u64(), metadata: Record<string, unknown> = {};
  if (count > 10000) throw new Error("GGUF metadata count exceeds limit.");
  const wanted = new Set(["tokenizer.ggml.model", "tokenizer.ggml.pre", "tokenizer.ggml.tokens", "tokenizer.ggml.merges", "tokenizer.ggml.token_type", "tokenizer.ggml.add_bos_token"]);
  for (let i = 0; i < count; i++) {
    const key = string(), keep = wanted.has(key), item = value(u32(), keep);
    if (keep) metadata[key] = item;
  }
  if (metadata["tokenizer.ggml.model"] !== "gpt2" || metadata["tokenizer.ggml.pre"] !== "qwen35" || metadata["tokenizer.ggml.add_bos_token"] === true) throw new Error("Unsupported tokenizer settings.");
  return metadata;
}

export async function loadQwenTokenizer(path: string) {
  const metadata = await vocabulary(path);
  const tokens = metadata["tokenizer.ggml.tokens"] as string[];
  const merges = metadata["tokenizer.ggml.merges"] as string[];
  const types = metadata["tokenizer.ggml.token_type"] as number[];
  if (!tokens?.length || !merges?.length || types?.length !== tokens.length) throw new Error("Incomplete vocabulary.");
  const ranks = new Map(merges.map((pair, index) => [pair, index]));
  const vocab = new Set(tokens);
  const specials = tokens.filter((_, index) => types[index] === 3 || types[index] === 4);
  const escaped = specials.sort((a, b) => b.length - a.length).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const specialPattern = new RegExp(`(${escaped.join("|")})`, "gu");
  const specialSet = new Set(specials);
  const printable = [...Array.from({ length: 94 }, (_, i) => i + 33), ...Array.from({ length: 12 }, (_, i) => i + 161), ...Array.from({ length: 82 }, (_, i) => i + 174)];
  const byteChars = new Map(printable.map((byte) => [byte, String.fromCodePoint(byte)]));
  let extra = 256;
  for (let byte = 0; byte < 256; byte++) if (!byteChars.has(byte)) byteChars.set(byte, String.fromCodePoint(extra++));
  const cache = new Map<string, number>();
  function countPiece(piece: string, work: { comparisons: number }) {
    const cached = cache.get(piece); if (cached !== undefined) return cached;
    const symbols = [...Buffer.from(piece)].map((byte) => byteChars.get(byte)!);
    // Bound the quadratic merge search; unsupported inputs keep byte accounting.
    if (symbols.length > 4096) throw new Error("Pre-token exceeds merge limit.");
    while (symbols.length > 1) {
      work.comparisons += symbols.length - 1;
      if (work.comparisons > 2_000_000) throw new Error("Tokenization work exceeds limit.");
      let best = Infinity, position = -1;
      for (let i = 0; i < symbols.length - 1; i++) {
        const rank = ranks.get(`${symbols[i]} ${symbols[i + 1]}`);
        if (rank !== undefined && rank < best) { best = rank; position = i; }
      }
      if (position === -1) break;
      symbols.splice(position, 2, symbols[position] + symbols[position + 1]);
    }
    if (symbols.some((symbol) => !vocab.has(symbol))) throw new Error("Unknown BPE token.");
    if (cache.size >= 4096) cache.clear();
    cache.set(piece, symbols.length);
    return symbols.length;
  }
  return (text: string) => {
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error("Tokenization input exceeds limit.");
    let count = 0;
    const work = { comparisons: 0 };
    for (const part of text.split(specialPattern)) {
      if (specialSet.has(part)) { count++; continue; }
      let covered = 0;
      for (const match of part.matchAll(pieces)) { covered += match[0].length; count += countPiece(match[0], work); }
      if (covered !== part.length) throw new Error("Incomplete pre-tokenization.");
    }
    return count;
  };
}

let cached: { path: string; tokenizer: Promise<Awaited<ReturnType<typeof loadQwenTokenizer>>> } | undefined;
export async function countQwenInput(path: string, prompt: string, system: string) {
  if (cached?.path !== path) {
    const entry = { path, tokenizer: loadQwenTokenizer(path) };
    cached = entry;
    entry.tokenizer.catch(() => { if (cached === entry) cached = undefined; });
  }
  const trim = (text: string) => text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
  const rendered = (system ? `<|im_start|>system\n${trim(system)}<|im_end|>\n` : "")
    + `<|im_start|>user\n${trim(prompt)}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
  return (await cached.tokenizer)(rendered);
}
