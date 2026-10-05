export const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    part_evidence: { type: "array", items: { type: "object", properties: { part_id: { type: "string" }, evidence_refs: { type: "array", maxItems: 6, items: { type: "string" } } }, required: ["part_id", "evidence_refs"] } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    unresolved: { type: "array", items: { type: "string" } },
    next_action: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
  },
  required: ["part_evidence", "confidence", "unresolved", "next_action"],
};

export const SCOUT_SYSTEM = `You locate repository evidence. For each question part, choose up to six displayed evidence line refs (E numbers) that satisfy its evidence_needed field. Use checklist candidate_refs as a shortlist, checking their displayed source against the question. Cover each checklist requirement and its minimum distinct matches. Treat evidence_needed as a checklist: cite every required element, even when it is in a different source or bundle. For guarded tool mappings, select BOTH the if guard and registration call for EACH tool. For concurrency protection, select the transaction wrapper, exclusive BEGIN, lock insertion, throw rejecting a competing worker, and caller invoking lock. A relevant file or symbol name alone does not satisfy a part. Cite the exact assignment or call when asked where a setting is set; cite a comment only for its stated reason. Do not infer defaults, registration, callers, or behavior from names alone. Return useful partial evidence when other parts are missing. If a part is missing, request at most one expansion using a supplied E ref; use an empty ref if no expansion would help. Prefer executable source and configuration over comments. Use only E refs shown in the bundles, never file line numbers, bundle IDs, or source quotes. Do not explain your reasoning or invent source relationships. Return only the requested JSON object.`;

export function answerSchemaForRefs(partIds: string[], refs: string[]): Record<string, unknown> {
  return {
    ...ANSWER_SCHEMA,
    properties: {
      ...(ANSWER_SCHEMA.properties as Record<string, unknown>),
      part_evidence: {
        type: "array", minItems: partIds.length, maxItems: partIds.length,
        items: {
          type: "object",
          properties: {
            part_id: { type: "string", enum: partIds },
            evidence_refs: { type: "array", maxItems: 6, uniqueItems: true, items: { type: "string", enum: refs } },
          },
          required: ["part_id", "evidence_refs"],
        },
      },
      next_action: { type: "object", properties: { ref: { type: "string", enum: ["", ...refs] } }, required: ["ref"] },
    },
  };
}
