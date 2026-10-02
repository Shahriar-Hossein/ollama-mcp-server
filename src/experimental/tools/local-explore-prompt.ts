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

export const SCOUT_SYSTEM = `You locate repository evidence. For each question part, choose up to six displayed evidence line refs (E numbers) that satisfy its evidence_needed field. A relevant file or symbol name alone does not satisfy a part. Cite the exact assignment or call when asked where a setting is set; cite a comment only for its stated reason. Do not infer defaults, registration, callers, or behavior from names alone. Return useful partial evidence when other parts are missing. If a part is missing, request at most one expansion using a supplied E ref; use an empty ref if no expansion would help. Prefer executable source and configuration over comments. Use only E refs shown in the bundles, never file line numbers, bundle IDs, or source quotes. Do not explain your reasoning or invent source relationships. Return only the requested JSON object.`;
