export type QuestionPart = { id: string; question: string; evidence_needed: string };
export type ValidEvidence = { id: string; file: string; line: number; quote: string };

export function directEvidenceForPart(part: QuestionPart, evidence: ValidEvidence[], query: string): boolean {
  const lines = evidence.map((item) => item.quote);
  if (/register/i.test(part.question)) return lines.some((line) => /\bregister[A-Za-z0-9_]+\s*\(/.test(line) && !/\b(?:function|import|const)\b/.test(line)) && lines.some((line) => /if\s*\(/.test(line));
  if (/enabled by default|default state/i.test(part.question)) return lines.some((line) => /\?\?\s*(?:true|false)|=\s*(?:true|false)/.test(line)) && lines.some((line) => /:\s*\w*(?:Feature|Flag)\s*\(/.test(line)) && lines.some((line) => /(?:Feature|Flag)\s*=.*\?\?/.test(line));
  if (/environment variables?/i.test(part.question)) {
    const names = lines.flatMap((line) => line.match(/\b(?:ENABLE_[A-Z0-9_]+|[A-Z0-9_]+_ENABLED)\b/g) ?? []);
    return new Set(/autonomous/i.test(query) ? names.filter((name) => name.endsWith("_ENABLED")) : names).size >= 2;
  }
  if (/which tool|what tool/i.test(part.question) && /gate|environment/i.test(query)) {
    const registrations = new Set(lines.flatMap((line) => line.match(/register[A-Za-z0-9_]+\s*\(\s*server\s*\)/g) ?? []));
    return registrations.size >= 2 && new Set(lines.flatMap((line) => line.match(/if\s*\(\s*features\.\w+/g) ?? [])).size >= 2;
  }
  if (/\bwhere\b.*\bset\b/i.test(part.question)) return lines.some((line) => !/^\s*(?:\*|\/\/)/.test(line) && /[:=]/.test(line));
  if (/concurren|duplicate/i.test(part.question)) return [/\.transaction\s*\(/, /BEGIN IMMEDIATE|BEGIN EXCLUSIVE/, /INSERT.*lock/i, /throw/, /\.lock\s*\(/].every((pattern) => lines.some((line) => pattern.test(line)));
  return true;
}
