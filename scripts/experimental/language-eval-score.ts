import type { LocalExploreObserverEvent } from "../../src/experimental/tools/local-explore-repo.js";
import type { LanguageFixture } from "./language-eval-fixture.js";

type EvalQuestion = LanguageFixture["questions"][number];
type SelectedEvidence = Array<{ file: string; line: number; quote: string }>;

const key = (file: string, line: number, text: string) =>
  JSON.stringify([file, line, text.trim()]);

export function scoreLanguageEvidence(
  question: EvalQuestion,
  events: LocalExploreObserverEvent[],
  selected: SelectedEvidence,
) {
  const uniqueRequired = [
    ...new Map(question.required.map((line) => [key(line.file, line.line, line.text), line])).values(),
  ];
  const retrievals = events.filter((event) => event.type === "retrieval");
  const contexts = events.filter((event) => event.type === "generation_context");
  const initial = new Set<string>();
  const anyPacked = new Set<string>();
  for (const context of contexts) {
    for (const ref of context.refs) {
      const tuple = key(ref.file, ref.line, ref.text);
      anyPacked.add(tuple);
      if (context.attempt === 1) initial.add(tuple);
    }
  }
  const selectedKeys = new Set(selected.map((item) => key(item.file, item.line, item.quote)));
  const required = uniqueRequired.map((line) => {
    const retrievedRange = retrievals.some((event) =>
      event.results.some((record) => {
        const symbol = record.evidence.symbol;
        return (
          symbol?.file === line.file &&
          symbol.range.start.line <= line.line &&
          symbol.range.end.line >= line.line
        );
      }),
    );
    const tuple = key(line.file, line.line, line.text);
    return {
      file: line.file,
      line: line.line,
      text: line.text,
      retrieved_range: retrievedRange,
      packed_initial: initial.has(tuple),
      packed_any: anyPacked.has(tuple),
      selected: selectedKeys.has(tuple),
    };
  });
  const count = (field: "retrieved_range" | "packed_initial" | "packed_any" | "selected") =>
    required.filter((line) => line[field]).length;
  return {
    required: required.length,
    retrieved_range: count("retrieved_range"),
    packed_initial: count("packed_initial"),
    packed_any: count("packed_any"),
    selected: count("selected"),
    lines: required,
  };
}

export type ManualReview = {
  status: "pending" | "reviewed";
  answer_correct: boolean | null;
  incorrect_claims: string[] | null;
  claims: Array<{
    text: string;
    correctness: "pending" | "correct" | "incorrect" | "unsupported";
    citations: Array<{ file: string; line: number }>;
  }> | null;
  parent_review_ms: number | null;
  correction_ms: number | null;
  retries: number | null;
  corrections: number | null;
};

export function emptyManualReview(): ManualReview {
  return {
    status: "pending",
    answer_correct: null,
    incorrect_claims: null,
    claims: null,
    parent_review_ms: null,
    correction_ms: null,
    retries: null,
    corrections: null,
  };
}

export function validateManualReview(review: ManualReview): void {
  for (const [label, value] of [
    ["parent_review_ms", review.parent_review_ms],
    ["correction_ms", review.correction_ms],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0))
      throw new Error(`${label} must be null or a nonnegative finite number`);
  }
  for (const [label, value] of [
    ["retries", review.retries],
    ["corrections", review.corrections],
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error(`${label} must be a nonnegative integer`);
  }
  if (review.status === "pending" && (review.answer_correct !== null || review.claims !== null || review.incorrect_claims !== null))
    throw new Error("Pending manual review fields must remain null");
  if (review.status === "reviewed" && (review.answer_correct === null || review.claims === null || review.incorrect_claims === null))
    throw new Error("Reviewed manual claims and outcome are required");
}

export type AnswerRequest = {
  prompt: string;
  system: string;
  format: Record<string, unknown>;
};

export function evidenceAnswerRequest(
  query: string,
  selected: SelectedEvidence,
): AnswerRequest {
  const format = {
    type: "object",
    properties: {
      answer: { type: "string" },
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            citations: {
              type: "array",
              items: {
                type: "object",
                properties: { file: { type: "string" }, line: { type: "integer" } },
                required: ["file", "line"],
                additionalProperties: false,
              },
            },
          },
          required: ["text", "citations"],
          additionalProperties: false,
        },
      },
      uncertainty: { type: "array", items: { type: "string" } },
    },
    required: ["answer", "claims", "uncertainty"],
    additionalProperties: false,
  };
  return {
    system:
      "Answer using only the supplied checked evidence. Cite each factual claim with exact file and line values from that evidence. If evidence is insufficient, say so in uncertainty. State the exact value for every item the question asks for, not just the key. Write quoted source values with single quotes, never double quotes. Return only the requested JSON.",
    prompt: `Question: ${query}\nChecked evidence: ${JSON.stringify(
      selected.map(({ file, line, quote }) => ({ file, line, quote })),
    )}\nReturn an answer, factual claims with citations, and any uncertainty.`,
    format,
  };
}

// A normal stop and valid JSON do not prove the prose is finished.
export function unfinishedText(text: string): boolean {
  const body = text.trim();
  if (!body || /[,:;([{\-]$/.test(body)) return true;
  if ((body.match(/`/g) ?? []).length % 2) return true;
  let depth = 0;
  for (const char of body.replace(/`[^`]*`/g, "")) {
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth--;
  }
  return depth !== 0;
}

export function validateEvidenceAnswer(raw: string, selected: SelectedEvidence) {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Final answer is not a JSON object");
  const answer = parsed as Record<string, unknown>;
  if (Object.keys(answer).some((key) => !["answer", "claims", "uncertainty"].includes(key)))
    throw new Error("Final answer contains fields outside the requested schema");
  if (
    typeof answer.answer !== "string" ||
    !Array.isArray(answer.claims) ||
    !Array.isArray(answer.uncertainty) ||
    answer.uncertainty.some((item) => typeof item !== "string")
  )
    throw new Error("Final answer must contain answer, claims and uncertainty arrays");
  const allowed = new Set(selected.map((item) => `${item.file}:${item.line}`));
  const invalidCitations: Array<{ file?: string; line?: number }> = [];
  const claims = answer.claims.flatMap((value) => {
    if (!value || typeof value !== "object") throw new Error("Final answer claim is malformed");
    const claim = value as { text?: unknown; citations?: unknown };
    if (Object.keys(value).some((key) => !["text", "citations"].includes(key)))
      throw new Error("Final answer claim contains fields outside the requested schema");
    if (typeof claim.text !== "string" || !Array.isArray(claim.citations))
      throw new Error("Final answer claim must contain text and citations");
    const citations = claim.citations.flatMap((citation) => {
      if (!citation || typeof citation !== "object") {
        invalidCitations.push({});
        return [];
      }
      if (Object.keys(citation).some((key) => !["file", "line"].includes(key))) {
        invalidCitations.push({});
        return [];
      }
      const location = citation as { file?: unknown; line?: unknown };
      if (typeof location.file !== "string" || !Number.isSafeInteger(location.line)) {
        invalidCitations.push({
          ...(typeof location.file === "string" ? { file: location.file } : {}),
          ...(typeof location.line === "number" ? { line: location.line } : {}),
        });
        return [];
      }
      const checked = { file: location.file, line: location.line as number };
      if (!allowed.has(`${checked.file}:${checked.line}`)) invalidCitations.push(checked);
      return [checked];
    });
    return [{ text: claim.text, citations }];
  });
  const incompleteText = [answer.answer, ...claims.map((claim) => claim.text)].filter(unfinishedText);
  return {
    answer: answer.answer,
    claims,
    uncertainty: Array.isArray(answer.uncertainty)
      ? (answer.uncertainty as string[])
      : [],
    invalid_citations: invalidCitations,
    incomplete_text: incompleteText,
    audit_status: invalidCitations.length
      ? "invalid_citations"
      : incompleteText.length
        ? "incomplete_text"
        : "pending_manual_review",
  } as const;
}
