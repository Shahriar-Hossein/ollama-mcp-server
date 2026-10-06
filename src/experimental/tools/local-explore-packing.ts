import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { readSymbol } from "../../explorer/read-symbol.js";
import type { RepositoryIndex } from "../../explorer/indexer.js";
import type { HybridRetrievalResult } from "../../explorer/retrieval.js";
import { packingPatterns, type QuestionPart } from "./local-explore-validation.js";

const MAX_FILES = 6;
const MAX_LINES = 20;
export const MAX_LINE_CHARS = 180;
const MAX_CANDIDATE_CHARS = 1_400;
const MAX_BUNDLES = 6;
export const MAX_CONTEXT_CHARS = 24_000;

type RetrievalResult = HybridRetrievalResult["results"][number];
type EvidenceLine = { line: number; text: string };
export type Candidate = {
  id: string;
  kind: "symbol" | "documentation" | "json" | "callsite" | "configuration" | "dependency" | "text_match";
  file: string;
  symbol?: string;
  lines: EvidenceLine[];
};

export type EvidenceBundle = { id: string; part_id: string; why_retrieved: string; relationship: string; candidates: Candidate[] };

export function checkedFile(root: string, file: string): string {
  const absoluteRoot = realpathSync(root);
  const absoluteFile = realpathSync(resolve(root, file));
  const rel = relative(absoluteRoot, absoluteFile);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Indexed file is outside repository: ${file}`);
  return absoluteFile;
}

function selectedLines(source: string, startLine: number, query: string, patterns: RegExp[] = []): EvidenceLine[] {
  const all = source.split("\n");
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []).filter((term) => !["where", "which", "what", "when", "does", "from", "with"].includes(term)))];
  const scores = all.map((line) => terms.reduce((sum, term) => sum + (line.toLowerCase().includes(term) ? term.length : 0), 0));
  const best = scores.indexOf(scores.reduce((maximum, score) => Math.max(maximum, score), 0));
  const anchors = [...new Set(patterns.flatMap((pattern) => all.flatMap((line, offset) => line.match(pattern) ? [offset] : [])))];
  const lines = new Map<number, EvidenceLine>();
  const centers = [...anchors, best];
  let windows = 0;
  for (const center of centers) {
    if (lines.has(startLine + center)) continue;
    if (windows++ >= 6) break;
    const start = Math.max(0, Math.min(center - (patterns.length ? 3 : 5), all.length - MAX_LINES));
    let chars = 0;
    for (let offset = start; offset < Math.min(all.length, start + MAX_LINES); offset++) {
      const text = all[offset].slice(0, MAX_LINE_CHARS).trimEnd();
      if (chars + text.length > MAX_CANDIDATE_CHARS) break;
      lines.set(startLine + offset, { line: startLine + offset, text });
      chars += text.length;
    }
  }
  return [...lines.values()].sort((a, b) => a.line - b.line);
}

function candidateFor(root: string, result: RetrievalResult, index: RepositoryIndex, query: string, id: string, patterns: RegExp[]): Candidate | null {
  const evidence = result.evidence;
  if (!evidence.file || !["symbol", "documentation", "json"].includes(evidence.kind)) return null;
  const file = evidence.file;
  checkedFile(root, file);
  if (evidence.kind === "symbol" && evidence.symbol) {
    const read = readSymbol(root, evidence.symbol.id, index);
    return { id, kind: "symbol", file, symbol: evidence.symbol.qualified_name, lines: selectedLines(read.source.text, read.source.range.start.line, query, patterns) };
  }
  const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
  if (evidence.kind === "documentation" && evidence.excerpt) {
    const line = lines.findIndex((value) => value.includes(evidence.excerpt!));
    if (line >= 0) return { id, kind: "documentation", file, lines: [{ line: line + 1, text: lines[line].slice(0, MAX_LINE_CHARS).trimEnd() }] };
  }
  if (evidence.kind === "json" && evidence.json_pointer) {
    const key = evidence.json_pointer.split("/").at(-1) ?? "";
    const line = lines.findIndex((value) => value.includes(JSON.stringify(key)));
    if (line >= 0) return { id, kind: "json", file, lines: [{ line: line + 1, text: lines[line].slice(0, MAX_LINE_CHARS).trimEnd() }] };
  }
  return null;
}

export function buildCandidates(root: string, results: RetrievalResult[], index: RepositoryIndex, query: string, part?: QuestionPart): Candidate[] {
  const patterns = part?.operation ? packingPatterns(part, query) : [];
  const candidates: Candidate[] = [];
  const files = new Set<string>();
  const add = (candidate: Candidate | null) => {
    if (!candidate?.lines.length || (!files.has(candidate.file) && files.size >= MAX_FILES)) return;
    files.add(candidate.file);
    candidate.id = `C${candidates.length + 1}`;
    candidates.push(candidate);
  };
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []).filter((term) => !["repository", "registered", "variables", "where", "which", "what", "does", "with", "from", "that", "each", "tools", "tool", "quality", "review"].includes(term)))];
  const sourceFiles = [...new Set(index.symbols.map((symbol) => symbol.file))].filter((file) => !/(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
  const matches = terms.length ? sourceFiles.flatMap((file) => {
    const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
    const hits = lines.flatMap((line, offset) => terms.some((term) => line.toLowerCase().includes(term)) ? [offset] : []);
    if (!hits.length) return [];
    const matchedTerms = terms.filter((term) => hits.some((offset) => lines[offset].toLowerCase().includes(term)));
    return [{ file, lines, hits, matchedTerms }];
  }) : [];
  const registrationLines = new Map<string, number[]>();
  for (const call of index.calls) {
    if (!call.callee_name.startsWith("register")) continue;
    const lines = registrationLines.get(call.file) ?? [];
    lines.push(call.range.start.line);
    registrationLines.set(call.file, lines);
  }
  const frequency = new Map(terms.map((term) => [term, matches.filter((match) => match.matchedTerms.includes(term)).length]));
  matches.sort((a, b) => {
    const score = (value: typeof a) => value.matchedTerms.reduce((sum, term) => sum + term.length / (frequency.get(term) ?? 1), 0)
      + (/register|gate|enabled/i.test(query) && registrationLines.get(value.file)?.some((line) => value.hits.some((hit) => Math.abs(line - hit - 1) <= 10)) ? 10 : 0)
      + terms.reduce((sum, term) => sum + (value.file.toLowerCase().includes(term.replace(/_/g, "-")) ? 8 : 0), 0)
      + (/quality.review/i.test(query) && value.file.includes("quality-review/") ? 40 : 0);
    return score(b) - score(a) || a.file.localeCompare(b.file);
  });
  for (const match of matches.slice(0, 2)) {
    if (part?.operation) {
      add({ id: "", kind: "text_match", file: match.file, lines: selectedLines(match.lines.join("\n"), 1, query, patterns) });
      continue;
    }
    const weighted = match.hits.map((hit) => ({ hit, score: match.matchedTerms.reduce((sum, term) => sum + (match.lines[hit].toLowerCase().includes(term) ? term.length / (frequency.get(term) ?? 1) : 0), 0)
      + (/\b(?:function|lock\s*\(|INSERT|SELECT|CREATE TABLE)\b/.test(match.lines[hit]) ? 3 : 0) }));
    weighted.sort((a, b) => b.score - a.score || a.hit - b.hit);
    const covered = new Set<number>();
    let windows = 0;
    for (const { hit } of weighted) {
      if (covered.has(hit)) continue;
      if (windows >= 3) break;
      const start = Math.max(0, hit - 4);
      const end = Math.min(match.lines.length, start + MAX_LINES);
      let chars = 0;
      const lines: EvidenceLine[] = [];
      for (let offset = start; offset < end; offset++) {
        const source = match.lines[offset].slice(0, MAX_LINE_CHARS).trimEnd();
        if (chars + source.length > MAX_CANDIDATE_CHARS) break;
        lines.push({ line: offset + 1, text: source });
        chars += source.length;
        covered.add(offset);
      }
      add({ id: "", kind: "text_match", file: match.file, lines });
      windows++;
    }
  }
  if (/environment|\benv\b|gate|enabled by default/i.test(query)) {
    const configured = sourceFiles.flatMap((file) => {
      const lines = readFileSync(checkedFile(root, file), "utf8").split("\n");
      const hits = lines.flatMap((line, offset) => /["'](?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)["']/.test(line) ? [offset] : []);
      return hits.length ? [{ file, lines, hits }] : [];
    }).sort((a, b) => b.hits.length - a.hits.length || a.file.localeCompare(b.file))[0];
    if (configured && (files.has(configured.file) || files.size < MAX_FILES)) {
      const start = Math.max(0, configured.hits[0] - 3);
      const excerpt = configured.lines.slice(start, start + MAX_LINES).join("\n");
      add({ id: "", kind: "configuration", file: configured.file, lines: selectedLines(excerpt, start + 1, query) });
    }
  }
  const namedSymbols = index.symbols.filter((symbol) => terms.includes(symbol.name.toLowerCase())
    && (!/quality.review/i.test(query) || symbol.file.includes("quality-review/")));
  for (const symbol of namedSymbols.slice(0, 2)) {
    if (!files.has(symbol.file) && files.size >= MAX_FILES) break;
    const read = readSymbol(root, symbol.id, index);
    add({ id: "", kind: "symbol", file: symbol.file, symbol: symbol.qualified_name, lines: selectedLines(read.source.text, read.source.range.start.line, query, patterns) });
  }
  for (const result of results.slice(0, 2)) add(candidateFor(root, result, index, query, "", patterns));
  if (part?.operation) {
    // A retrieved local variable does not represent all operations in its file.
    for (const file of [...files]) {
      const source = readFileSync(checkedFile(root, file), "utf8");
      add({ id: "", kind: "text_match", file, lines: selectedLines(source, 1, query, patterns) });
    }
  }
  expandCrossFileCandidates(root, index, candidates, query, patterns, Boolean(part?.operation)).forEach(add);
  for (const result of results) {
    if (candidates.length >= results.length) break;
    const file = result.evidence.file;
    if (!file || (!files.has(file) && files.size >= MAX_FILES)) continue;
    add(candidateFor(root, result, index, query, "", patterns));
    const symbol = result.evidence.symbol;
    if (!symbol || candidates.length >= results.length) continue;
    const call = index.calls.find((edge) => edge.callee_symbol_id === symbol.id && edge.file !== symbol.file);
    if (!call || (!files.has(call.file) && files.size >= MAX_FILES)) continue;
    const source = readFileSync(checkedFile(root, call.file), "utf8").split("\n");
    const start = Math.max(1, call.range.start.line - 10);
    const excerpt = source.slice(start - 1, call.range.start.line + 4).join("\n");
    const callsite: Candidate = { id: "", kind: "callsite", file: call.file, symbol: symbol.qualified_name, lines: selectedLines(excerpt, start, query) };
    add(callsite);
    const guard = source.slice(start - 1, call.range.start.line).reverse().find((line) => /if\s*\(\s*features\./.test(line));
    const featureKey = guard?.match(/if\s*\(\s*features\.([A-Za-z][A-Za-z0-9_]*)/)?.[1];
    for (const key of featureKey ? [featureKey] : []) {
      if (candidates.length >= results.length) break;
      const property = index.symbols.find((record) => record.kind === "property" && record.name === key);
      if (!property || (!files.has(property.file) && files.size >= MAX_FILES)) continue;
      const config = readFileSync(checkedFile(root, property.file), "utf8").split("\n");
      const selected = new Set<number>();
      for (let i = 0; i < config.length; i++) {
        if (config[i].includes(`const experimental =`) || config[i].includes(`${key}: experimentalFeature(`)) {
          for (let j = Math.max(0, i - 1); j <= Math.min(config.length - 1, i + 1); j++) selected.add(j);
        }
      }
      const lines = [...selected].sort((a, b) => a - b).slice(0, MAX_LINES).map((offset) => ({ line: offset + 1, text: config[offset].slice(0, MAX_LINE_CHARS).trimEnd() }));
      add({ id: "", kind: "configuration", file: property.file, symbol: key, lines });
    }
  }
  return candidates;
}

function expandCrossFileCandidates(root: string, index: RepositoryIndex, seeds: Candidate[], query: string, patterns: RegExp[], discoverProviders = false): Candidate[] {
  const expanded: Candidate[] = [];
  const visited = new Set(seeds.map((candidate) => candidate.file));
  let frontier = [...visited];
  const terms = query.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? [];
  const indexedFiles = new Set(index.symbols.map((symbol) => symbol.file));
  const sources = new Map<string, string>();
  const sourceFor = (file: string) => {
    if (!sources.has(file)) sources.set(file, readFileSync(checkedFile(root, file), "utf8"));
    return sources.get(file)!;
  };
  for (let depth = 0; depth < 2 && visited.size < MAX_FILES; depth++) {
    const neighbors = new Map<string, number>();
    const offer = (file: string | null, score: number) => {
      if (!file || visited.has(file) || /(?:^|\/)(?:benchmarks|__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return;
      neighbors.set(file, Math.max(neighbors.get(file) ?? 0, score));
    };
    for (const dependency of index.dependencies) {
      if (frontier.includes(dependency.file)) offer(dependency.target_file, 2);
      if (dependency.target_file && frontier.includes(dependency.target_file)) offer(dependency.file, 1);
      if (discoverProviders && !dependency.target_file && frontier.includes(dependency.file)) {
        // An indexed path hint supplies context; it does not resolve an alias or provider.
        const hint = dependency.module_specifier.replace(/\.[cm]?[jt]sx?$/, "");
        if (hint.startsWith("src/") && !hint.split("/").includes("..")) {
          for (const file of indexedFiles) {
            if (file.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "") === hint) offer(file, 4);
          }
        }
      }
    }
    for (const call of index.calls) {
      if (discoverProviders && frontier.includes(call.file) && !call.callee_symbol_id) {
        const line = sourceFor(call.file).split("\n")[call.range.start.line - 1];
        if (patterns.some((pattern) => line?.match(pattern))) {
          const name = call.callee_name.split(".").at(-1);
          for (const symbol of index.symbols) {
            if (["method", "function"].includes(symbol.kind) && symbol.name === name) offer(symbol.file, 3);
          }
        }
      }
      if (!call.callee_symbol_id || !["exact", "static"].includes(call.resolution)) continue;
      const callee = index.symbols.find((symbol) => symbol.id === call.callee_symbol_id);
      if (!callee) continue;
      if (frontier.includes(call.file)) offer(callee.file, 3);
      if (frontier.includes(callee.file)) offer(call.file, 3);
    }
    const ranked = [...neighbors].map(([file, edgeScore]) => {
      const source = sourceFor(file);
      const score = edgeScore + new Set(terms.filter((term) => source.toLowerCase().includes(term))).size;
      return { file, source, score };
    }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    frontier = [];
    for (const { file, source } of ranked.slice(0, MAX_FILES - visited.size)) {
      visited.add(file);
      frontier.push(file);
      expanded.push({ id: "", kind: "dependency", file, lines: selectedLines(source, 1, query, patterns) });
    }
  }
  return expanded;
}

export function compileEvidenceBundles(parts: QuestionPart[], byPart: Map<string, Candidate[]>): { bundles: EvidenceBundle[]; candidates: Candidate[]; overflow: boolean } {
  const bundles: EvidenceBundle[] = [];
  const candidates: Candidate[] = [];
  const byFile = new Map<string, Candidate>();
  let usedChars = 0;
  let overflow = parts.length > MAX_BUNDLES;
  // Reserve every retrieved chain file before bundling parts; merge shared lines once.
  for (const part of parts) {
    const pool = byPart.get(part.id) ?? [];
    const packed: Candidate[] = [];
    for (const file of new Set(pool.map((item) => item.file))) {
      const sources = pool.filter((item) => item.file === file);
      let candidate = byFile.get(file);
      if (!candidate) {
        candidate = { ...sources[0], id: `C${candidates.length + 1}`, lines: [] };
        byFile.set(file, candidate);
        candidates.push(candidate);
      }
      const lines = new Map(candidate.lines.map((line) => [line.line, line]));
      for (const line of sources.flatMap((item) => item.lines)) {
        if (lines.has(line.line)) continue;
        usedChars += line.text.length;
        lines.set(line.line, line);
      }
      candidate.lines = [...lines.values()].sort((a, b) => a.line - b.line);
      packed.push(candidate);
    }
    if (packed.length) bundles.push({
      id: `B${bundles.length + 1}`, part_id: part.id,
      why_retrieved: "ranked source with bounded caller/callee/import expansion",
      relationship: "candidate context; import adjacency does not prove a runtime call; unresolved import paths and method-name matches are provider hints only",
      candidates: packed,
    });
  }
  overflow ||= usedChars > MAX_CONTEXT_CHARS;
  return { bundles, candidates, overflow };
}
