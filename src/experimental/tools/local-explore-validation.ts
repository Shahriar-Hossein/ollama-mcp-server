import { operationChecks } from "./local-explore-operations.js";

export type QuestionPart = {
  id: string;
  question: string;
  evidence_needed: string;
  operation?: string;
  completeness?: "unchecked";
};
export type ValidEvidence = { id: string; file: string; line: number; quote: string };

type Requirement = { name: string; pattern: RegExp; minimum: number };

export function selectableEvidenceText(text: string): boolean {
  const quote = text.trim();
  return (
    quote.length >= 6 ||
    /^(?:-?\d+(?:\.\d+)?|"[^"\n]*"|'[^'\n]*'|true|false|null|else\s*\{?)[,;]?$/.test(quote)
  );
}

export function configurationKeys(question: string): string[] {
  return [...new Set(question.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) ?? [])].filter(
    (key) => !key.startsWith("ENABLE_") && !key.endsWith("_ENABLED"),
  );
}

export function flagResolutionRequested(question: string): boolean {
  return (
    /environment variables?|\bflags?\b|\bENABLE_[A-Z0-9_]+\b|\b[A-Z0-9_]+_ENABLED\b/i.test(
      question,
    ) &&
    /\bresolv\w*\b|\bdefaults?\b|\bvalid\w*\b|\baccept\w*\b|\bindependent\w*\b|\bvalues?\b|\binvalid\b/i.test(
      question,
    )
  );
}

function requirements(part: QuestionPart, query: string): Requirement[] {
  if (part.operation)
    return operationChecks(part).map((item) => ({
      ...item,
      pattern: new RegExp(
        `^(?!\\s*(?://|\\*|/\\*|import\\b)).*?(?:${item.pattern.source})`,
        item.pattern.flags,
      ),
    }));
  const require = (name: string, pattern: RegExp, minimum = 1) => ({ name, pattern, minimum });
  const chain: Requirement[] = [];
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const match of part.question.matchAll(
    /\bcall(?:s)?\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g,
  )) {
    const name = match[1].split(".").at(-1)!;
    if (["the", "a", "each", "its", "to", "and", "or", "site"].includes(name)) continue;
    chain.push(
      require(`${match[1]} call`, new RegExp(
        `^(?!\\s*(?:\\*|//|import\\b|(?:export\\s+)?(?:async\\s+)?function\\b))(?!.*\\b${escaped(name)}\\([^)]*\\)\\s*(?::[^=]*)?\\{\\s*$).*\\b${escaped(name)}\\s*\\(`,
      )),
    );
  }
  for (const match of part.question.matchAll(
    /\b(?:return|issue)\s+([A-Za-z_$][\w$]*[A-Z][\w$]*)\b/g,
  )) {
    chain.push(require(`${match[1]} output`, new RegExp(`\\b${escaped(match[1])}\\s*:`)));
  }
  if (/\b(?:sign|signing)\b|issue\s+accessToken/i.test(part.question))
    chain.push(require("signing call", /\.(?:sign|signAsync)\s*\(/));
  if (/\bverif(?:y|ied|ication)\b/i.test(part.question))
    chain.push(require("verification call", /\.(?:verify|verifyAsync)\s*\(/));
  if (/\bBearer\b/.test(part.question))
    chain.push(
      require("Bearer extraction", /return.*['"]Bearer['"]|fromAuthHeaderAsBearerToken\s*\(/),
    );
  if (/assign.*request\.user/i.test(part.question))
    chain.push(require("request.user assignment", /request(?:\.user|\[['"]user['"]\])\s*=/));
  if (/\bextract\b/i.test(part.question) && /\bStrategy\b|\w+Strategy\b/.test(part.question))
    chain.push(require("extraction configuration", /jwtFromRequest\s*:/));
  if (/\bvalidate\b.*payload/i.test(part.question))
    chain.push(require("validated payload return", /return.*payload\./));
  if (/\bexpir(?:y|ation)\b/i.test(part.question))
    chain.push(require("expiry configuration", /\bexpiresIn\s*:/));
  if (/configur|setting/i.test(part.question)) {
    const settings = [
      ...part.question.matchAll(
        /\b([a-z][\w$]*[A-Z][\w$]*)\s+configured\b|\b(?:configure|configures|setting)\s+([a-z][\w$]*[A-Z][\w$]*)\b/g,
      ),
    ].map((match) => match[1] ?? match[2]);
    for (const name of new Set(settings)) {
      chain.push(require(`${name} configuration`, new RegExp(`\\b${escaped(name)}\\s*[:=]`)));
      if (/\bused\b/.test(part.question))
        chain.push(require(`${name} use`, new RegExp(`\\.\\s*${escaped(name)}\\b(?!\\s*[:=])`)));
    }
  }
  if (chain.length)
    return chain.map((item) => ({
      ...item,
      pattern: new RegExp(
        `^(?!\\s*(?://|\\*|/\\*)).*?(?:${item.pattern.source})`,
        item.pattern.flags,
      ),
    }));
  if (/register/i.test(part.question))
    return [
      require("registration call", /^(?!.*\b(?:function|import|const)\b).*\bregister[A-Za-z0-9_]+\s*\(/),
      require("registration guard", /if\s*\(/),
    ];
  if (/enabled by default|default state/i.test(part.question))
    return [
      require("master flag default", /\?\?\s*(?:true|false)|=\s*(?:true|false)/),
      require("named flag mapping", /:\s*\w*(?:Feature|Flag)\s*\(/),
      require("default-resolving helper", /(?:Feature|Flag)\s*=.*\?\?/),
    ];
  if (/environment variables?/i.test(part.question))
    return [
      require(/environment variables\b/i.test(part.question)
        ? "both environment variable mappings"
        : "environment variable mapping", /autonomous/i.test(query)
        ? /\b[A-Z0-9_]+_ENABLED\b/g
        : /\b(?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)\b/g, /environment variables\b/i.test(
        part.question,
      )
        ? 2
        : 1),
    ];
  if (/which tool|what tool/i.test(part.question) && /gate|environment/i.test(query))
    return [
      require("both tool registration calls", /register[A-Za-z0-9_]+\s*\(\s*server\s*\)/g, 2),
      require("both tool registration guards", /if\s*\(\s*features\.\w+/g, 2),
    ];
  if (/\bwhere\b.*\bset\b/i.test(part.question))
    return [require("executable assignment", /^(?!\s*(?:\*|\/\/)).*[:=]/)];
  if (/concurren|duplicate/i.test(part.question))
    return [
      require("transaction wrapper call", /\.transaction\s*\(/),
      require("exclusive BEGIN statement", /BEGIN IMMEDIATE|BEGIN EXCLUSIVE/),
      require("lock insertion", /INSERT.*lock/i),
      require("competing-worker rejection", /throw.*(?:lock|worker|queue|concurren|already|own)/i),
      require("caller invoking lock", /\.lock\s*\(/),
    ];
  const definition = part.question.match(/\b(?:is|are)\s+([A-Za-z_$][\w$]*)\s+defined\b/i)?.[1];
  if (definition)
    return [
      require(`${definition} declaration`, new RegExp(
        `\\b(?:function|class|const|let)\\s+${escaped(definition)}\\b`,
      )),
    ];
  return [];
}

export function packingPatterns(part: QuestionPart, query: string): RegExp[] {
  return requirements(part, query).map((item) => item.pattern);
}

export function evidenceChecklist(
  part: QuestionPart,
  lines: Array<{ ref: string; quote: string }>,
  query: string,
) {
  return requirements(part, query).map(({ name, pattern, minimum }) => ({
    requirement: name,
    minimum_distinct_matches: minimum,
    candidate_refs: lines.filter((line) => line.quote.match(pattern)).map((line) => line.ref),
  }));
}

export function missingEvidenceRequirements(
  part: QuestionPart,
  evidence: ValidEvidence[],
  query: string,
): string[] {
  const checks = requirements(part, query);
  return [
    ...checks
      .filter(
        ({ pattern, minimum }) =>
          new Set(evidence.flatMap((item) => item.quote.match(pattern) ?? [])).size < minimum,
      )
      .map(({ name }) => name),
    ...(!checks.length || part.completeness === "unchecked"
      ? ["semantic completeness unchecked; parent review required"]
      : []),
  ];
}

export function directEvidenceForPart(
  part: QuestionPart,
  evidence: ValidEvidence[],
  query: string,
): boolean {
  return missingEvidenceRequirements(part, evidence, query).length === 0;
}
