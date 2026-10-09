import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const STAGES = ["retrieved_range", "packed_initial", "packed_any", "selected"] as const;
const TIMINGS = [
  "index",
  "retrieval",
  "packing",
  "expansion",
  "budget_setup",
  "input_check",
  "scout_queue_request_wall",
  "answer_queue_request_wall",
  "scout_end_to_end",
  "answer_end_to_end",
  "end_to_end",
] as const;

type Stage = (typeof STAGES)[number];
type Timing = (typeof TIMINGS)[number];
type SummaryGroup = {
  questions: number;
  scored_questions: number;
  unscored_ids: string[];
  required: number;
  retrieved_range: number;
  packed_initial: number;
  packed_any: number;
  selected: number;
  scout_calls: number;
  scout_retries: number;
  answer_calls: number;
  total_calls: number;
  expansions: number;
  expansion_attempts: number;
  expansion_overflows: number;
  native_model_total_duration_ms: number;
  native_duration_calls: number;
  statuses: Record<string, number>;
  timings_ms: Record<Timing, number>;
  median_end_to_end_ms: number | null;
  misses: Record<Stage, Array<{ id: string; file: string; line: number }>>;
  missed_question_ids: Record<Stage, string[]>;
  end_to_end_samples: number[];
};

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${label} must be a nonnegative integer`);
  return value as number;
}

function time(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be null or a nonnegative finite number`);
  return value;
}

function emptyGroup(): SummaryGroup {
  return {
    questions: 0,
    scored_questions: 0,
    unscored_ids: [],
    required: 0,
    retrieved_range: 0,
    packed_initial: 0,
    packed_any: 0,
    selected: 0,
    scout_calls: 0,
    scout_retries: 0,
    answer_calls: 0,
    total_calls: 0,
    expansions: 0,
    expansion_attempts: 0,
    expansion_overflows: 0,
    native_model_total_duration_ms: 0,
    native_duration_calls: 0,
    statuses: {},
    timings_ms: Object.fromEntries(TIMINGS.map((stage) => [stage, 0])) as Record<Timing, number>,
    median_end_to_end_ms: null,
    misses: { retrieved_range: [], packed_initial: [], packed_any: [], selected: [] },
    missed_question_ids: { retrieved_range: [], packed_initial: [], packed_any: [], selected: [] },
    end_to_end_samples: [],
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeLanguageEval(input: unknown, artifactSha256: string) {
  const artifact = record(input, "artifact");
  if (artifact.complete !== true) throw new Error("Run artifact is not complete");
  const protocol = record(artifact.protocol, "protocol");
  const requestedIds = protocol.requested_ids;
  const rows = artifact.results;
  if (!Array.isArray(requestedIds) || !requestedIds.every((id) => typeof id === "string"))
    throw new Error("protocol.requested_ids must be a string array");
  if (!Array.isArray(rows) || rows.length !== requestedIds.length)
    throw new Error("Run results must match all requested question IDs");
  const ids = rows.map((value, index) => {
    const row = record(value, `results[${index}]`);
    if (typeof row.id !== "string" || row.id !== requestedIds[index])
      throw new Error("Result IDs must match requested_ids in order");
    if (typeof row.language !== "string" || typeof row.status !== "string")
      throw new Error(`${row.id} requires language and status strings`);
    return row.id;
  });
  if (new Set(ids).size !== ids.length) throw new Error("Question IDs must be unique");

  const groups = new Map<string, SummaryGroup>();
  const global = emptyGroup();
  const addRow = (group: SummaryGroup, row: Record<string, unknown>) => {
    const id = row.id as string;
    group.questions++;
    group.statuses[row.status as string] = (group.statuses[row.status as string] ?? 0) + 1;
    if (row.score === null) {
      group.unscored_ids.push(id);
    } else {
      const score = record(row.score, `${id}.score`);
      const lines = score.lines;
      if (!Array.isArray(lines)) throw new Error(`${id}.score.lines must be an array`);
      const required = count(score.required, `${id}.score.required`);
      if (required !== lines.length) throw new Error(`${id} required count does not match its lines`);
      group.required += required;
      group.scored_questions++;
      const unique = new Set<string>();
      const observed: Record<Stage, number> = {
        retrieved_range: 0,
        packed_initial: 0,
        packed_any: 0,
        selected: 0,
      };
      for (const value of lines) {
        const line = record(value, `${id}.score line`);
        if (typeof line.file !== "string" || !Number.isSafeInteger(line.line) || (line.line as number) < 1 || typeof line.text !== "string")
          throw new Error(`${id} has an invalid required source line`);
        const tuple = JSON.stringify([line.file, line.line, line.text.trim()]);
        if (unique.has(tuple)) throw new Error(`${id} repeats a required evidence tuple`);
        unique.add(tuple);
        for (const stage of STAGES) {
          if (typeof line[stage] !== "boolean") throw new Error(`${id}.${stage} must be boolean`);
          if (line[stage]) observed[stage]++;
          else group.misses[stage].push({ id, file: line.file, line: line.line as number });
        }
      }
      for (const stage of STAGES) {
        const stageCount = count(score[stage], `${id}.score.${stage}`);
        if (stageCount !== observed[stage] || stageCount > required)
          throw new Error(`${id} ${stage} count does not match its evidence rows`);
        group[stage] += stageCount;
      }
    }
    if (!Array.isArray(row.scout_calls)) throw new Error(`${id}.scout_calls must be an array`);
    const calls = row.scout_calls.length;
    group.scout_calls += calls;
    group.scout_retries += Math.max(0, calls - 1);
    const addNativeDuration = (call: unknown) => {
      const completion = record(call, `${id}.completion`).completion;
      if (completion === null || completion === undefined) return;
      const nativeNs = time(record(completion, `${id}.completion`).total_duration, `${id}.total_duration`);
      if (nativeNs !== null) {
        group.native_model_total_duration_ms += nativeNs / 1_000_000;
        group.native_duration_calls++;
      }
    };
    for (const call of row.scout_calls) addNativeDuration(call);
    const answerCall = row.answer_call === null ? null : record(row.answer_call, `${id}.answer_call`);
    if (
      answerCall &&
      (typeof answerCall.queue_request_wall_ms === "number" ||
        typeof answerCall.output === "string" ||
        (answerCall.completion !== null && typeof answerCall.completion === "object"))
    )
      group.answer_calls++;
    if (answerCall) addNativeDuration(answerCall);
    const events = row.events;
    if (!Array.isArray(events)) throw new Error(`${id}.events must be an array`);
    for (const eventValue of events) {
      const event = record(eventValue, `${id}.event`);
      if (event.type !== "expansion") continue;
      group.expansion_attempts++;
      if (event.outcome === "added") group.expansions++;
      else if (event.outcome === "overflow") group.expansion_overflows++;
      else throw new Error(`${id} expansion event has an invalid outcome`);
    }
    const timings = record(row.timings_ms, `${id}.timings_ms`);
    for (const stage of TIMINGS) {
      const elapsed = time(timings[stage], `${id}.timings_ms.${stage}`);
      if (elapsed !== null) {
        group.timings_ms[stage] += elapsed;
        if (stage === "end_to_end") group.end_to_end_samples.push(elapsed);
      }
    }
  };

  for (const value of rows) {
    const row = record(value, "result");
    const language = row.language as string;
    const group = groups.get(language) ?? emptyGroup();
    groups.set(language, group);
    addRow(group, row);
    addRow(global, row);
  }
  for (const group of [...groups.values(), global]) {
    group.total_calls = group.scout_calls + group.answer_calls;
    group.median_end_to_end_ms = median(group.end_to_end_samples);
    for (const stage of STAGES)
      group.missed_question_ids[stage] = [...new Set(group.misses[stage].map((miss) => miss.id))];
    delete (group as Partial<SummaryGroup>).end_to_end_samples;
  }
  return {
    version: 1,
    artifact_sha256: artifactSha256,
    fixture_sha256: protocol.fixture_sha256,
    model: protocol.model,
    requested_ids: requestedIds,
    by_language: Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b))),
    global,
    interpretation: {
      retrieved_range: "A retrieved symbol range contains a required line; this is not semantic proof.",
      misses: "Evidence-stage misses list IDs and source locations only; answer keys are excluded.",
      timing: "Generation wall time includes queue and API request time; end-to-end includes observer/checkpoint overhead.",
    },
  };
}

if (process.argv[1]?.endsWith("language-eval-summary.ts")) {
  const inputPath = process.argv[2] ?? "benchmark-data/language-eval/language-eval.json";
  const outputPath = process.argv[3];
  const raw = readFileSync(inputPath);
  const sha = createHash("sha256").update(raw).digest("hex");
  const result = `${JSON.stringify(summarizeLanguageEval(JSON.parse(raw.toString("utf8")), sha), null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, result);
  else process.stdout.write(result);
}
