export type QuestionPart = { id: string; question: string; evidence_needed: string };
export type ValidEvidence = { id: string; file: string; line: number; quote: string };

type Requirement = { name: string; pattern: RegExp; minimum: number };

function requirements(part: QuestionPart, query: string): Requirement[] {
  const require = (name: string, pattern: RegExp, minimum = 1) => ({ name, pattern, minimum });
  if (/register/i.test(part.question)) return [
    require("registration call", /^(?!.*\b(?:function|import|const)\b).*\bregister[A-Za-z0-9_]+\s*\(/),
    require("registration guard", /if\s*\(/),
  ];
  if (/enabled by default|default state/i.test(part.question)) return [
    require("master flag default", /\?\?\s*(?:true|false)|=\s*(?:true|false)/),
    require("named flag mapping", /:\s*\w*(?:Feature|Flag)\s*\(/),
    require("default-resolving helper", /(?:Feature|Flag)\s*=.*\?\?/),
  ];
  if (/environment variables?/i.test(part.question)) return [
    require("both environment variable mappings", /autonomous/i.test(query)
      ? /\b[A-Z0-9_]+_ENABLED\b/g : /\b(?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)\b/g, 2),
  ];
  if (/which tool|what tool/i.test(part.question) && /gate|environment/i.test(query)) return [
    require("both tool registration calls", /register[A-Za-z0-9_]+\s*\(\s*server\s*\)/g, 2),
    require("both tool registration guards", /if\s*\(\s*features\.\w+/g, 2),
  ];
  if (/\bwhere\b.*\bset\b/i.test(part.question)) return [
    require("executable assignment", /^(?!\s*(?:\*|\/\/)).*[:=]/),
  ];
  if (/concurren|duplicate/i.test(part.question)) return [
    require("transaction wrapper call", /\.transaction\s*\(/),
    require("exclusive BEGIN statement", /BEGIN IMMEDIATE|BEGIN EXCLUSIVE/),
    require("lock insertion", /INSERT.*lock/i),
    require("competing-worker rejection", /throw.*(?:lock|worker|queue|concurren|already|own)/i),
    require("caller invoking lock", /\.lock\s*\(/),
  ];
  return [];
}

export function evidenceChecklist(part: QuestionPart, lines: Array<{ ref: string; quote: string }>, query: string) {
  return requirements(part, query).map(({ name, pattern, minimum }) => ({
    requirement: name,
    minimum_distinct_matches: minimum,
    candidate_refs: lines.filter((line) => line.quote.match(pattern)).map((line) => line.ref),
  }));
}

export function missingEvidenceRequirements(part: QuestionPart, evidence: ValidEvidence[], query: string): string[] {
  return requirements(part, query).filter(({ pattern, minimum }) =>
    new Set(evidence.flatMap((item) => item.quote.match(pattern) ?? [])).size < minimum
  ).map(({ name }) => name);
}

export function directEvidenceForPart(part: QuestionPart, evidence: ValidEvidence[], query: string): boolean {
  return missingEvidenceRequirements(part, evidence, query).length === 0;
}
