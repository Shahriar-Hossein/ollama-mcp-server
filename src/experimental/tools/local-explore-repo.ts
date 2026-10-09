import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { configurationContextRequests } from "./local-explore-config-context.js";
import {
  evidenceChecklist,
  missingEvidenceRequirements,
  directEvidenceForPart,
  flagResolutionRequested,
  configurationKeys,
  selectableEvidenceText,
  type QuestionPart,
  type ValidEvidence,
} from "./local-explore-validation.js";
import { answerSchemaForRefs, SCOUT_SYSTEM } from "./local-explore-prompt.js";
import {
  DEFAULT_LOCAL_MODEL,
  TOOL_OUTPUT_RESERVES,
  checkGenerationInputBudget,
  generate,
  resolveModelBudget,
} from "../../ollama-client.js";
import { indexRepository } from "../../explorer/indexer.js";
import { hybridRetrieve } from "../../explorer/retrieval.js";
import { createRelationshipChecks } from "./local-explore-relationships.js";
import { operationParts } from "./local-explore-operations.js";

import {
  buildCandidates,
  compileEvidenceBundles,
  checkedFile,
  MAX_LINE_CHARS,
  MAX_CONTEXT_CHARS,
  type Candidate,
  type EvidenceBundle,
} from "./local-explore-packing.js";
import { structuralSupport } from "./local-explore-structure.js";
export { buildCandidates, compileEvidenceBundles } from "./local-explore-packing.js";
export type { Candidate, EvidenceBundle } from "./local-explore-packing.js";
export { directEvidenceForPart } from "./local-explore-validation.js";
export type { QuestionPart } from "./local-explore-validation.js";

const UNINDEXED_LANGUAGES: [string, RegExp, string][] = [
  ["Ruby", /\bruby\b|\brails\b|\.rb\b/i, ".rb"],
  ["Java", /\bjava\b|\.java\b/i, ".java"],
  ["C#", /\bc#|\.cs\b/i, ".cs"],
];

// Flag questions about tracked sources the index cannot search.
export function unindexedLanguages(root: string, query: string): string[] {
  const named = UNINDEXED_LANGUAGES.filter(([, pattern]) => pattern.test(query));
  if (!named.length) return [];
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split(
    "\0",
  );
  return named
    .filter(([, , ext]) => files.some((file) => file.toLowerCase().endsWith(ext)))
    .map(([name]) => name);
}

type EvidenceLine = Candidate["lines"][number];
type ModelEvidence = Omit<ValidEvidence, "file">;
type CandidateSnapshot = Readonly<
  Omit<Candidate, "lines"> & { lines: ReadonlyArray<Readonly<EvidenceLine>> }
>;
type BundleSnapshot = Readonly<
  Omit<EvidenceBundle, "candidates"> & { candidates: ReadonlyArray<CandidateSnapshot> }
>;

function frozenClone<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

export interface LocalExploreRepoParams {
  query: string;
  repository_root: string;
  model?: string;
  limit?: number;
  num_ctx?: number;
  num_predict?: number;
}

export type LocalExploreObserverEvent =
  | { type: "budget_setup"; elapsed_ms: number }
  | { type: "index"; elapsed_ms: number }
  | { type: "input_check"; attempt: number; elapsed_ms: number; fits: boolean }
  | {
      type: "retrieval";
      part_id: string;
      query: string;
      elapsed_ms: number;
      results: Awaited<ReturnType<typeof hybridRetrieve>>["results"];
    }
  | {
      type: "packing";
      elapsed_ms: number;
      candidates: ReadonlyArray<CandidateSnapshot>;
      bundles: ReadonlyArray<BundleSnapshot>;
    }
  | {
      type: "generation_context";
      attempt: number;
      refs: ReadonlyArray<
        Readonly<{ ref: string; candidate_id: string; file: string; line: number; text: string }>
      >;
    }
  | {
      type: "expansion";
      elapsed_ms: number;
      outcome: "added" | "overflow";
      candidate_id: string;
      line: number;
      added_lines: number;
    };

export function decomposeQuestion(query: string): QuestionPart[] {
  const clauses = operationParts(query)
    ? [query.trim()]
    : query
        .trim()
        .replace(/[?!.]+$/, "")
        .split(/,?\s+and\s+(?=(?:is|are|does|do|why|where|which|what|how)\b)/i);
  const planned: QuestionPart[] = (clauses.length > 1 ? clauses : [query.trim()]).flatMap(
    (question) => {
      const operations = operationParts(question);
      if (operations) return operations;
      let evidence_needed = "Direct implementation lines that establish the requested behavior.";
      if (/register/i.test(question))
        evidence_needed =
          "The direct registration call and its inputs; include the guard when a tool or conditional registration is requested.";
      else if (/enabled by default|default state/i.test(question))
        evidence_needed =
          "The named flag mapping, the helper resolving that mapping, and the expression establishing the master flag default.";
      else if (/environment variables?/i.test(question))
        evidence_needed = "Each distinct environment variable controlling the requested tools.";
      else if (/which tool|what tool/i.test(question) && /gate|environment/i.test(query))
        evidence_needed =
          "The guarded registration call for each tool, showing which feature controls it.";
      else if (/\bwhere\b.*\bset\b/i.test(question))
        evidence_needed = "The executable assignment or request field that sets the value.";
      else if (/\bwhy\b/i.test(question))
        evidence_needed = "Source text that explains the reason for the setting.";
      else if (/concurren|duplicate/i.test(question))
        evidence_needed =
          "The transaction wrapper call, its exclusive BEGIN statement, the lock insertion, rejection condition, and a caller using the lock.";
      const part: QuestionPart = { id: "", question, evidence_needed };
      if (flagResolutionRequested(question)) {
        part.completeness = "unchecked";
        part.evidence_needed +=
          " Include the mapped resolver's input, branch conditions, returns and validation errors; parent review is required for flag semantics.";
      }
      if (configurationKeys(question).length) {
        part.completeness = "unchecked";
        part.evidence_needed +=
          " Include named configuration reads, defaults, enclosing conditions and direct outcomes; parent review is required for configuration semantics.";
      }
      const contextRequests = configurationContextRequests(question);
      if (
        contextRequests.initialization ||
        contextRequests.provider ||
        contextRequests.constant ||
        contextRequests.instance ||
        contextRequests.order
      ) {
        part.completeness = "unchecked";
        part.evidence_needed +=
          " Include configuration initialization options and the reader's factory token/inject/parameters or constructor injection when requested. These are source context; parent review must establish provider provenance and initialization semantics.";
        if (contextRequests.constant || contextRequests.order || contextRequests.instance)
          part.evidence_needed +=
            " Bind actual configuration-value imports to their import, initializer and named reader declarations, including the reader method. For direct default-import instances include the reader call, construction and constructor arguments; distinguish an environment object reference from a scalar read or copy. Module and provider tokens alone are not configuration values. Include direct registration and setup calls; source order does not prove environment preload or runtime evaluation order.";
      }
      const uncheckedTail = question.replace(
        /\band\s+(?:return|issue)\s+[a-z][\w$]*[A-Z][\w$]*|\band\s+call(?:s)?\s+[A-Za-z_$][\w$.]*|\band\s+its\s+implementation\b/g,
        "",
      );
      if (
        /\bcall(?:s)?\s+[A-Za-z_$]/.test(question) &&
        /\band\b|\b(?:before|after|while|then|to)\b/.test(uncheckedTail)
      ) {
        part.completeness = "unchecked";
      }
      if (
        evidence_needed === "Direct implementation lines that establish the requested behavior."
      ) {
        const required = missingEvidenceRequirements(part, [], query);
        if (required.length)
          part.evidence_needed = `Direct executable lines for each element: ${required.join(", ")}.`;
      }
      return [part];
    },
  );
  const seenOperations = new Set<string>();
  return planned
    .filter((part) => {
      if (!part.operation) return true;
      if (seenOperations.has(part.operation)) return false;
      seenOperations.add(part.operation);
      return true;
    })
    .map((part, index) => {
      if (part.operation) {
        part.question = query.trim();
        part.evidence_needed = `Direct executable lines for ${part.operation}: ${evidenceChecklist(
          part,
          [],
          query,
        )
          .map((item) => item.requirement)
          .join(", ")}.`;
      }
      return { ...part, id: `P${index + 1}` };
    });
}

function searchQuery(question: string): string {
  const related: string[] = [];
  if (/concurren|duplicate|exclusive|mutual|worker/i.test(question))
    related.push("lock", "worker_lock", "mutex");
  if (/enabled by default|default state/i.test(question))
    related.push("default", "ENABLE_EXPERIMENTAL");
  if (/environment variables?|\benv\b/i.test(question)) related.push("process.env", "ENABLED");
  if (/expir/i.test(question)) related.push("expiresIn");
  for (const identifier of question.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) ?? [])
    related.push(identifier.replace(/_/g, ""));
  return `${question} ${related.join(" ")}`.trim();
}

function expandCandidate(
  root: string,
  candidate: Candidate,
  line: number,
  nextId: string,
): Candidate {
  const source = readFileSync(checkedFile(root, candidate.file), "utf8").split("\n");
  const center = Math.min(Math.max(line, 1), source.length);
  const start = Math.max(1, center - 9);
  const end = Math.min(source.length, center + 9);
  return {
    id: nextId,
    kind: "text_match",
    file: candidate.file,
    symbol: candidate.symbol,
    lines: source.slice(start - 1, end).map((text, offset) => ({
      line: start + offset,
      text: text.slice(0, MAX_LINE_CHARS).trimEnd(),
    })),
  };
}

type LineReference = { candidate: Candidate; line: EvidenceLine };

function promptContext(bundles: EvidenceBundle[], candidates: Candidate[]) {
  const refs = new Map<string, LineReference>();
  const byLocation = new Map<string, string>();
  for (const candidate of candidates)
    for (const line of candidate.lines) {
      const ref = `E${refs.size + 1}`;
      refs.set(ref, { candidate, line });
      byLocation.set(`${candidate.id}:${line.line}`, ref);
    }
  const grouped = new Map<
    string,
    {
      part_ids: string[];
      why_retrieved: string;
      relationship: string;
      sources: Array<{
        file: string;
        symbol?: string;
        lines: Array<{ ref: string; text: string }>;
      }>;
    }
  >();
  for (const bundle of bundles) {
    const key = bundle.candidates.map((candidate) => candidate.id).join(",");
    const prior = grouped.get(key);
    if (prior) {
      if (!prior.part_ids.includes(bundle.part_id)) prior.part_ids.push(bundle.part_id);
      continue;
    }
    grouped.set(key, {
      part_ids: [bundle.part_id],
      why_retrieved: bundle.why_retrieved,
      relationship: bundle.relationship,
      sources: bundle.candidates.map((candidate) => ({
        file: candidate.file,
        symbol: candidate.symbol,
        lines: candidate.lines.map((line) => ({
          ref: byLocation.get(`${candidate.id}:${line.line}`)!,
          text: line.text,
        })),
      })),
    });
  }
  return { refs, promptBundles: [...grouped.values()] };
}

export function validateModelAnswer(
  raw: string,
  candidates: Candidate[],
  parts: QuestionPart[] = [],
  bundles: EvidenceBundle[] = [],
  refs = new Map<string, LineReference>(),
) {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Model did not return a JSON object.");
  const answer = parsed as Record<string, unknown>;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  let selected_ids = Array.isArray(answer.selected_ids)
    ? answer.selected_ids
        .filter((id): id is string => typeof id === "string" && byId.has(id))
        .slice(0, 6)
    : [];
  const evidence: ValidEvidence[] = [];
  let rejected_evidence = 0;
  const partRefs = Array.isArray(answer.part_evidence)
    ? answer.part_evidence.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const refs = (part as { evidence_refs?: unknown }).evidence_refs;
        return Array.isArray(refs) ? refs : [];
      })
    : [];
  const evidenceRefs = Array.isArray(answer.evidence_refs)
    ? answer.evidence_refs
    : partRefs.length
      ? [...new Set(partRefs)]
      : null;
  if (evidenceRefs) {
    for (const ref of evidenceRefs.slice(0, 96)) {
      const located = typeof ref === "string" ? refs.get(ref) : undefined;
      if (!located || !selectableEvidenceText(located.line.text)) {
        rejected_evidence++;
        continue;
      }
      evidence.push({
        id: located.candidate.id,
        file: located.candidate.file,
        line: located.line.line,
        quote: located.line.text.trim(),
      });
    }
  }
  for (const rawReference of !evidenceRefs && Array.isArray(answer.evidence)
    ? answer.evidence.slice(0, 96)
    : []) {
    if (!rawReference || typeof rawReference !== "object") {
      rejected_evidence++;
      continue;
    }
    const reference = rawReference as Partial<ModelEvidence>;
    if (typeof reference.id !== "string" || !Number.isInteger(reference.line)) {
      rejected_evidence++;
      continue;
    }
    const candidate = byId.get(reference.id);
    const sourceLine = candidate?.lines.find((line) => line.line === reference.line);
    if (
      !sourceLine ||
      (reference.quote !== undefined &&
        (typeof reference.quote !== "string" ||
          !selectableEvidenceText(reference.quote) ||
          (reference.quote.trim().length < 6 &&
            reference.quote.trim() !== sourceLine.text.trim()) ||
          !sourceLine.text.includes(reference.quote)))
    ) {
      rejected_evidence++;
      continue;
    }
    const quote = reference.quote ?? sourceLine.text.trim();
    if (!selectableEvidenceText(quote)) {
      rejected_evidence++;
      continue;
    }
    evidence.push({ id: reference.id, file: candidate!.file, line: reference.line!, quote });
  }
  const seenLines = new Set<string>();
  for (let i = 0; i < evidence.length; i++) {
    const key = `${evidence[i].file}:${evidence[i].line}`;
    if (seenLines.has(key)) evidence.splice(i--, 1);
    else seenLines.add(key);
  }
  if (!selected_ids.length)
    selected_ids = [...new Set(evidence.map((item) => item.id))].slice(0, 6);
  const rawCoverage = Array.isArray(answer.part_evidence) ? answer.part_evidence : [];
  const coverage = parts.map((part) => {
    const entry = rawCoverage.find(
      (value) =>
        value && typeof value === "object" && (value as { part_id?: unknown }).part_id === part.id,
    ) as { evidence_ids?: unknown; evidence_refs?: unknown } | undefined;
    const allowed = new Set(
      bundles
        .filter((bundle) => bundle.part_id === part.id)
        .flatMap((bundle) => bundle.candidates.map((candidate) => candidate.id)),
    );
    const cited = Array.isArray(entry?.evidence_refs)
      ? entry.evidence_refs.map((ref) =>
          typeof ref === "string" ? refs.get(ref)?.candidate.id : undefined,
        )
      : entry?.evidence_ids;
    const evidence_ids = Array.isArray(cited)
      ? [
          ...new Set(
            cited.filter(
              (id): id is string =>
                typeof id === "string" &&
                evidence.some((item) => item.id === id) &&
                (!bundles.length || allowed.has(id)),
            ),
          ),
        ]
      : [];
    const evidence_locations = Array.isArray(entry?.evidence_refs)
      ? entry.evidence_refs.flatMap((ref) => {
          const located = typeof ref === "string" ? refs.get(ref) : undefined;
          return located && evidence_ids.includes(located.candidate.id)
            ? [`${located.candidate.file}:${located.line.line}`]
            : [];
        })
      : evidence
          .filter((item) => evidence_ids.includes(item.id))
          .map((item) => `${item.file}:${item.line}`);
    return {
      part_id: part.id,
      question: part.question,
      status: evidence_ids.length ? ("supported" as const) : ("missing" as const),
      evidence_ids,
      evidence_locations,
    };
  });
  const action =
    answer.next_action && typeof answer.next_action === "object"
      ? (answer.next_action as { candidate_id?: unknown; line?: unknown })
      : null;
  const requested =
    typeof (action as { ref?: unknown } | null)?.ref === "string"
      ? refs.get((action as { ref: string }).ref)
      : undefined;
  const next_action = requested
    ? { candidate_id: requested.candidate.id, line: requested.line.line }
    : typeof action?.candidate_id === "string" &&
        Number.isInteger(action.line) &&
        byId.get(action.candidate_id)?.lines.some((line) => line.line === action.line)
      ? { candidate_id: action.candidate_id, line: action.line as number }
      : null;
  const model_confidence = ["high", "medium", "low"].includes(String(answer.confidence))
    ? (answer.confidence as "high" | "medium" | "low")
    : "low";
  const unresolved = Array.isArray(answer.unresolved)
    ? answer.unresolved
        .filter((value): value is string => typeof value === "string")
        .slice(0, 20)
        .map((value) => value.slice(0, 300))
    : [];
  return {
    evidence,
    selected_ids,
    coverage,
    next_action,
    model_confidence,
    unresolved,
    rejected_evidence,
  };
}

export async function runLocalExploreRepo(
  {
    query,
    repository_root,
    model = DEFAULT_LOCAL_MODEL,
    limit = 10,
    num_ctx,
    num_predict,
  }: LocalExploreRepoParams,
  generateAnswer: typeof generate = generate,
  resolveBudget: typeof resolveModelBudget = resolveModelBudget,
  observe?: (event: LocalExploreObserverEvent) => void,
) {
  if (!query.trim()) throw new Error("Exploration query must not be empty.");
  if (!Number.isInteger(limit) || limit < 8 || limit > 12)
    throw new Error("Candidate limit must be an integer from 8 through 12.");
  const budgetStarted = performance.now();
  const budget = await resolveBudget(
    model,
    { num_ctx, num_predict },
    undefined,
    TOOL_OUTPUT_RESERVES.scout,
  );
  observe?.({ type: "budget_setup", elapsed_ms: Math.round(performance.now() - budgetStarted) });
  const input_checks: Awaited<ReturnType<typeof checkGenerationInputBudget>>[] = [];
  let model_calls = 0;
  const root = resolve(repository_root);
  const indexStarted = performance.now();
  const index = indexRepository(root);
  observe?.({ type: "index", elapsed_ms: Math.round(performance.now() - indexStarted) });
  const parts = decomposeQuestion(query);
  const relationships = createRelationshipChecks(root, index, query);
  const missingRequirementsFor = (part: QuestionPart, evidence: ValidEvidence[]) => [
    ...missingEvidenceRequirements(part, evidence, query).filter(
      (name) => !relationships.replacedRequirements(part).includes(name),
    ),
    ...relationships.missing(part, evidence),
  ];
  const byPart = new Map<string, Candidate[]>();
  let retrieved_count = 0;
  let packingElapsed = 0;
  for (const part of parts) {
    const retrievalQuery = searchQuery(`${part.question} ${query}`);
    const retrievalStarted = performance.now();
    const retrieved = await hybridRetrieve(root, retrievalQuery, limit, "basic", undefined, index);
    const retrievalElapsed = Math.round(performance.now() - retrievalStarted);
    retrieved_count += retrieved.results.length;
    if (observe)
      observe({
        type: "retrieval",
        part_id: part.id,
        query: retrievalQuery,
        elapsed_ms: retrievalElapsed,
        results: frozenClone(retrieved.results),
      });
    const partPackingStarted = performance.now();
    byPart.set(part.id, buildCandidates(root, retrieved.results, index, retrievalQuery, part));
    packingElapsed += performance.now() - partPackingStarted;
  }
  const bundlePackingStarted = performance.now();
  const compiled = compileEvidenceBundles(parts, byPart);
  packingElapsed += performance.now() - bundlePackingStarted;
  const { bundles, candidates } = compiled;
  if (observe) {
    const candidateSnapshots = new Map(
      candidates.map((candidate) => [
        candidate.id,
        Object.freeze({
          ...candidate,
          lines: Object.freeze(candidate.lines.map((line) => Object.freeze({ ...line }))),
        }),
      ]),
    );
    observe({
      type: "packing",
      elapsed_ms: Math.round(packingElapsed),
      candidates: Object.freeze([...candidateSnapshots.values()]),
      bundles: Object.freeze(
        bundles.map((bundle) =>
          Object.freeze({
            ...bundle,
            candidates: Object.freeze(
              bundle.candidates.map((candidate) => candidateSnapshots.get(candidate.id)!),
            ),
          }),
        ),
      ),
    });
  }
  const base = () => ({
    query,
    model,
    commit_hash: index.commit_hash,
    retrieval_mode: "basic" as const,
    parts,
    bundles,
    candidates,
    retrieved_count,
    input_checks,
    packing_overflow: compiled.overflow,
  });
  const emptyResult = <Status extends "input_overflow" | "no_evidence" | "needs_review">(
    status: Status,
    unresolved: string[],
    warning?: string,
    drop_retrieval = false,
  ) => ({
    ...base(),
    ...(drop_retrieval ? { bundles: [], candidates: [], retrieved_count: 0 } : {}),
    status,
    evidence: [],
    selected_ids: [],
    coverage: parts.map((part) => ({ ...part, status: "missing" as const, evidence_ids: [] })),
    model_confidence: "low" as const,
    unresolved,
    model_calls,
    ...(warning === undefined ? {} : { warning }),
  });
  if (compiled.overflow)
    return emptyResult("input_overflow", [
      "Evidence packing exceeded its character cap; source was omitted. Narrow the query before generation.",
    ]);
  const unindexed = unindexedLanguages(root, query);
  if (unindexed.length)
    return emptyResult(
      "no_evidence",
      [
        `Unsupported language: ${unindexed.join(", ")}. The index covers TypeScript/JavaScript/PHP/Python/Go/Rust only; read those files directly.`,
      ],
      undefined,
      true,
    );
  if (!candidates.length)
    return emptyResult("no_evidence", ["Deterministic retrieval supplied no readable candidates."]);

  let lastError = "";
  let retained: ReturnType<typeof validateModelAnswer> | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { refs, promptBundles } = promptContext(bundles, candidates);
    const repoMap = [
      ...new Map(
        candidates.map((candidate) => [candidate.file, candidate.symbol ?? candidate.kind]),
      ).entries(),
    ].map(([file, role]) => ({ file, role }));
    const checklistParts = parts.map((part) => {
      const allowed = new Set(
        bundles
          .filter((bundle) => bundle.part_id === part.id)
          .flatMap((bundle) => bundle.candidates.map((candidate) => candidate.id)),
      );
      const lines = [...refs]
        .filter(([, { candidate }]) => allowed.has(candidate.id))
        .map(([ref, { candidate, line }]) => ({
          ref,
          id: candidate.id,
          file: candidate.file,
          line: line.line,
          quote: line.text,
        }))
        .filter(
          (line) =>
            !part.operation ||
            !index.symbols.some(
              (symbol) =>
                symbol.file === line.file &&
                ["interface", "type"].includes(symbol.kind) &&
                symbol.range.start.line <= line.line &&
                symbol.range.end.line >= line.line,
            ),
        );
      return {
        ...part,
        checklist: evidenceChecklist(part, lines, query).filter(
          (item) => !relationships.replacedRequirements(part).includes(item.requirement),
        ),
        relationships: relationships.checklist(part, lines),
      };
    });
    const format = answerSchemaForRefs(
      parts.map((part) => part.id),
      [...refs.keys()],
    );
    const prompt =
      `Question: ${query}\nQuestion parts: ${JSON.stringify(checklistParts)}\n` +
      `Relevant repo map: ${JSON.stringify(repoMap)}\nEvidence bundles: ${JSON.stringify(promptBundles)}\n` +
      `Return JSON with part_evidence [{part_id,evidence_refs:["E1"]}], confidence, unresolved, next_action {ref}. ` +
      (lastError ? `Previous output failed: ${lastError}.` : "");
    const inputCheckStarted = performance.now();
    const inputCheck = await checkGenerationInputBudget(budget, {
      prompt,
      system: SCOUT_SYSTEM,
      format,
    });
    input_checks.push(inputCheck);
    observe?.({
      type: "input_check",
      attempt,
      elapsed_ms: Math.round(performance.now() - inputCheckStarted),
      fits: inputCheck.fits,
    });
    if (!inputCheck.fits)
      return emptyResult("input_overflow", [
        "Input exceeds the conservative budget. Reduce the source/query or explicitly lower num_predict.",
      ]);
    try {
      model_calls++;
      observe?.({
        type: "generation_context",
        attempt,
        refs: Object.freeze(
          [...refs].map(([ref, { candidate, line }]) =>
            Object.freeze({
              ref,
              candidate_id: candidate.id,
              file: candidate.file,
              line: line.line,
              text: line.text,
            }),
          ),
        ),
      });
      const raw = await generateAnswer(model, prompt, SCOUT_SYSTEM, format, false, {
        num_ctx: budget.num_ctx,
        num_predict: budget.num_predict,
      });
      const answer = validateModelAnswer(raw, candidates, parts, bundles, refs);
      // Keep checked partial citations: retries can supply different links in one chain.
      for (const prior of retained?.coverage ?? []) {
        const current = answer.coverage.find((part) => part.part_id === prior.part_id)!;
        current.evidence_ids = [...new Set([...current.evidence_ids, ...prior.evidence_ids])];
        current.evidence_locations = [
          ...new Set([...current.evidence_locations, ...prior.evidence_locations]),
        ];
        for (const item of retained!.evidence.filter((item) =>
          prior.evidence_locations.includes(`${item.file}:${item.line}`),
        )) {
          if (
            !answer.evidence.some((other) => other.file === item.file && other.line === item.line)
          )
            answer.evidence.push(item);
        }
      }
      const excluded = new Set(parts.flatMap((part) => relationships.excluded(part)).map((item) => `${item.file}:${item.line}`));
      if (excluded.size) {
        answer.evidence = answer.evidence.filter((item) => !excluded.has(`${item.file}:${item.line}`));
        for (const coverage of answer.coverage)
          coverage.evidence_locations = coverage.evidence_locations.filter((location) => !excluded.has(location));
      }
      for (const part of parts) {
        const coverage = answer.coverage.find((item) => item.part_id === part.id);
        if (!coverage) continue;
        for (const location of relationships.fill(part)) {
          const key = `${location.file}:${location.line}`;
          const found = [...refs.values()].find(({ candidate, line }) => candidate.file === location.file && line.line === location.line);
          if (!found || excluded.has(key)) continue;
          if (!answer.evidence.some((item) => item.file === location.file && item.line === location.line))
            answer.evidence.push({ id: found.candidate.id, file: location.file, line: location.line, quote: found.line.text.trim() });
          if (!coverage.evidence_locations.includes(key)) coverage.evidence_locations.push(key);
        }
      }
      answer.coverage = answer.coverage.map((coverage) => {
        const part = parts.find((item) => item.id === coverage.part_id)!;
        const cited = answer.evidence.filter((item) =>
          coverage.evidence_locations.includes(`${item.file}:${item.line}`),
        );
        const missing_requirements = missingRequirementsFor(part, cited);
        return {
          ...coverage,
          missing_requirements,
          status:
            cited.length && !missing_requirements.length
              ? ("supported" as const)
              : ("missing" as const),
        };
      });
      answer.selected_ids = [...new Set(answer.evidence.map((item) => item.id))];
      retained = answer;
      const missing = answer.coverage.some((part) => part.status === "missing");
      if (
        answer.evidence.length &&
        !answer.rejected_evidence &&
        !missing &&
        !answer.unresolved.length
      ) {
        return {
          ...base(),
          ...answer,
          supporting_context: structuralSupport(root, answer.evidence),
          status: "evidence_selected" as const,
          model_calls: attempt,
          verification:
            "Quotes copied from checked source lines. Recognized bounded checklists, named callers and supported direct object configuration bindings checked; not runtime verification.",
        };
      }
      const missingRequirements = answer.coverage
        .filter((part) => part.status === "missing")
        .map((coverage) => {
          const part = parts.find((item) => item.id === coverage.part_id)!;
          const cited = answer.evidence.filter((item) =>
            coverage.evidence_locations.includes(`${item.file}:${item.line}`),
          );
          return `${part.id}: ${missingRequirementsFor(part, cited).join(", ") || part.evidence_needed}`;
        });
      answer.unresolved = [...new Set([...answer.unresolved, ...missingRequirements])];
      lastError = [
        ...(answer.rejected_evidence
          ? [
              `${answer.rejected_evidence} evidence reference(s) did not match supplied source lines.`,
            ]
          : []),
        ...(answer.unresolved.length
          ? [`Unresolved evidence requirements: ${answer.unresolved.join("; ")}`]
          : []),
      ].join(" ");
      if (attempt === 1 && missing && answer.next_action) {
        const expansionStarted = performance.now();
        const candidate = candidates.find((item) => item.id === answer.next_action!.candidate_id)!;
        const expanded = expandCandidate(
          root,
          candidate,
          answer.next_action.line,
          `C${candidates.length + 1}`,
        );
        const contextChars = candidates.reduce(
          (sum, item) => sum + item.lines.reduce((n, line) => n + line.text.length, 0),
          0,
        );
        if (
          contextChars + expanded.lines.reduce((sum, line) => sum + line.text.length, 0) >
          MAX_CONTEXT_CHARS
        ) {
          compiled.overflow = true;
          observe?.({
            type: "expansion",
            elapsed_ms: Math.round(performance.now() - expansionStarted),
            outcome: "overflow",
            candidate_id: candidate.id,
            line: answer.next_action.line,
            added_lines: expanded.lines.length,
          });
          return emptyResult("input_overflow", [
            "Bounded follow-up exceeded the evidence character cap. Narrow the query.",
          ]);
        }
        candidates.push(expanded);
        const partId = answer.coverage.find((part) => part.status === "missing")!.part_id;
        const bundle = bundles.find((item) => item.part_id === partId)!;
        Object.assign(bundle, {
          why_retrieved: "bounded follow-up read",
          relationship: `expanded source around ${candidate.id}:${answer.next_action.line}`,
          candidates: [...bundle.candidates, expanded],
        });
        observe?.({
          type: "expansion",
          elapsed_ms: Math.round(performance.now() - expansionStarted),
          outcome: "added",
          candidate_id: candidate.id,
          line: answer.next_action.line,
          added_lines: expanded.lines.length,
        });
        continue;
      }
      if (attempt === 2) {
        const abstained = answer.coverage.every((part) => !part.evidence_locations.length);
        return {
          ...base(),
          ...answer,
          ...(abstained ? { evidence: [], selected_ids: [] } : {}),
          supporting_context: abstained ? [] : structuralSupport(root, answer.evidence),
          status: "needs_review" as const,
          model_confidence: "low" as const,
          model_calls: attempt,
          warning: lastError,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 2) return emptyResult("needs_review", [], lastError);
    }
  }
  throw new Error("Unreachable explorer state.");
}

export function registerLocalExploreRepo(server: McpServer) {
  server.tool(
    "local_explore_repo",
    "Compiles source and caller evidence bundles, asks a local model to select cited evidence for each question part, and checks exact quotes. Read-only; the parent agent interprets the evidence.",
    {
      repository_root: z.string().describe("Absolute Git repository root."),
      query: z.string().describe("Repository exploration question."),
      model: z
        .string()
        .default(DEFAULT_LOCAL_MODEL)
        .describe("Local model for evidence interpretation."),
      num_ctx: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Context override; otherwise inherits the selected model's saved num_ctx."),
      num_predict: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Output ceiling override; defaults to the smaller of the saved model ceiling and 2048 tokens.",
        ),
      limit: z
        .number()
        .int()
        .min(8)
        .max(12)
        .default(10)
        .describe(
          "Deterministic candidates to retrieve per question part before model interpretation (8–12, default 10).",
        ),
    },
    async (params) => {
      try {
        return {
          content: [{ type: "text", text: JSON.stringify(await runLocalExploreRepo(params)) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Local exploration failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
