import type { QuestionPart } from "./local-explore-validation.js";

type OperationCheck = { name: string; pattern: RegExp; minimum: number };
type Operation = { id: string; requested: RegExp; checks: OperationCheck[] };
const check = (name: string, pattern: RegExp, minimum = 1): OperationCheck => ({ name, pattern, minimum });

// These are search/selection checklists, not proofs of branch or provider completeness.
const operations: Operation[] = [
  { id: "acceptance", requested: /\baccept\w*\b|\b(?:POST|PATCH)\s+\//i, checks: [
    check("image interception", /\bFileInterceptor\s*\(/),
    check("uploaded file input", /@UploadedFile\s*\(/),
    check("image request dispatch", /return\s+(?:await\s+)?this\.\w+\.(?:create|update)\s*\(/),
  ] },
  { id: "validation", requested: /\bvalidat\w*\b/i, checks: [
    check("image type validation", /(?:mime|type).*(?:has\(|test\(|includes\()|(?:has\(|test\(|includes\().*(?:mime|type)/i),
    check("image size limit", /\b(?:fileSize|maxSize|maxFileSize)\s*:/),
    check("validation rejection", /\b(?:throw|cb\(|callback\().*(?:Error|Exception)/),
  ] },
  { id: "upload", requested: /\bupload\w*\b|\breplace\w*\b.*\bimage\b/i, checks: [
    check("upload invocation", /\.(?:upload\w*)\s*\(/i),
    check("upload input", /\b(?:file|image)\.(?:path|buffer)|\bupload\w*\s*\(\s*(?:file|image)\b/i),
  ] },
  { id: "storage", requested: /\b(?:save|store|persist)\w*\b|\b(?:creat|updat)\w*\b.*\b(?:record|member)\b/i, checks: [
    check("record persistence", /\.(?:create|update|save|insert)\s*\(/),
    check("stored image URL", /\b(?:image|imageUrl|url)\s*:\s*\w+\.(?:secureUrl|secure_url|url)/),
    check("stored image ID", /\b(?:imageId|publicId|id)\s*:\s*\w+\.(?:publicId|public_id|id)/),
  ] },
  { id: "replacement", requested: /\breplac\w*\b/i, checks: [
    check("existing record lookup", /\.(?:findUnique|findOne|findById)\s*\(/),
    check("optional image guard", /\bif\s*\(\s*(?:file|image)\s*\)/),
    check("previous image condition", /\bif\s*\(.*(?:existing|previous|old).*\b(?:imageId|publicId|id)\b/i),
    check("previous image deletion", /\.(?:deleteImage|destroy|removeImage)\s*\(.*(?:existing|previous|old)/i),
  ] },
  { id: "failure", requested: /\bfail\w*\b|\b(?:rollback|clean\w*|reject\w*)\b/i, checks: [
    check("failure branch", /\bcatch\b/),
    check("failure cleanup", /\.(?:deleteImage|destroy|removeImage)\s*\(.*(?:uploaded|newImage|result).*\b(?:publicId|public_id|id)\b/i),
    check("failure reported", /\bthrow\b.*(?:Error|Exception)|\bthrow\s+error\b/),
  ] },
  { id: "temporary-file", requested: /\btemp\w*\b|\blocal file\b/i, checks: [
    check("unconditional cleanup branch", /\bfinally\b/),
    check("temporary file cleanup call", /\b(?:removeLocalTempFile|unlink|rm)\s*\(/),
    check("filesystem deletion", /\b(?:unlink|rm)\s*\(/),
  ] },
  { id: "transformation", requested: /\b(?:transform\w*|convert\w*)\b|\bturn\b.*\bquery\b/i, checks: [
    check("numeric query transformation", /\bNumber\s*\(\s*value\s*\)/),
    check("true query transformation", /['"]true['"].*return\s+true/),
    check("false query transformation", /['"]false['"].*return\s+false/),
  ] },
  { id: "filter", requested: /\bfilter\w*\b/i, checks: [
    check("optional active filter", /typeof\s+query\.\w+\s*===\s*['"]boolean['"].*\?/),
    check("filter passed to query", /\bwhere\s*[,}:]/),
  ] },
  { id: "pagination", requested: /\bpaginat\w*\b|\bpage\b|\blimit\b/i, checks: [
    check("pagination condition", /typeof\s+query\.page.*typeof\s+query\.limit/),
    check("pagination offset", /\bskip\s*=.*page.*limit/),
    check("pagination take", /\btake\s*:\s*limit/),
    check("total count", /\.count\s*\(/),
    check("page count", /\btotalPages\s*:/),
  ] },
  { id: "response", requested: /\bresponse\b|\bunpaginated\b|\bwithout\b.*\bpaginat/i, checks: [
    check("response data", /\bdata\s*:/),
    check("response metadata", /\bmeta\s*:/),
  ] },
];

export function operationChecks(part: QuestionPart): OperationCheck[] {
  const checks = operations.find((operation) => operation.id === part.operation)?.checks ?? [];
  const additional: OperationCheck[] = [];
  if (part.operation === "upload" && /\b(?:POST|PATCH|team\w*|endpoint)\b/i.test(part.question)) {
    additional.push(check("service upload invocation", /\.uploadImage\s*\(/));
  }
  if (part.operation === "filter" && /\blist\b/i.test(part.question)) {
    additional.push(check("list request dispatch", /return\s+(?:await\s+)?this\.\w+\.(?:findAll|list)\s*\(/));
  }
  if (part.operation === "upload" && /\b(?:without|missing|absent|no)\b.*\b(?:image|file)\b/i.test(part.question)) {
    additional.push(check("missing image guard", /\bif\s*\(\s*!(?:file|image)(?:\?\.(?:path|buffer))?\s*\)/));
    additional.push(check("missing image rejection", /\bthrow\b.*(?:required|Invalid.*(?:image|file))/i));
  }
  if (part.operation === "upload" && /\b(?:fail\w*|reject\w*|invalid|missing)\b/i.test(part.question)) {
    additional.push(check("upload result validity guard", /\bif\s*\(.*!\w+\?\.(?:secure_url|public_id|secureUrl|publicId)/));
    additional.push(check("upload failure reported", /\bthrow\b.*(?:upload.*fail|fail.*upload)/i));
  }
  if (part.operation === "storage" && /\b(?:updat\w*|replac\w*)\b/i.test(part.question)) {
    additional.push(check("existing record lookup", /\.(?:findUnique|findOne|findById)\s*\(/));
    additional.push(check("missing record guard", /\bif\s*\(\s*!(?:existing\w*|record|team|member)\s*\)/i));
    additional.push(check("missing record rejection", /\bthrow\b.*(?:NotFound|not found)/i));
    additional.push(check("optional image guard", /\bif\s*\(\s*(?:file|image)\s*\)/));
    additional.push(check("conditional image fields", /^\s*\.\.\.\s*\(\s*(?:uploaded|newImage|result)\s*$/));
  }
  return [...checks.filter((item) => item.name !== "failure cleanup"
    || /\b(?:creat\w*|updat\w*|replac\w*|record|persist\w*|stor\w*|sav\w*)\b/i.test(part.question)), ...additional];
}

export function operationParts(question: string): QuestionPart[] | null {
  // Preserve the separately checked named-call/configuration route.
  if (/\bcall(?:s)?\s+[A-Za-z_$]|\bconfigured\b|\bsetting\b|\bpayload\b|\bBearer\b|request\.user/i.test(question)) return null;
  const selected = operations.filter((operation) => operation.requested.test(question));
  if (!selected.length) return null;
  return selected.map((operation) => {
    const part: QuestionPart = { id: "", question, operation: operation.id, evidence_needed: "", completeness: "unchecked" };
    part.evidence_needed = `Direct executable lines for ${operation.id}: ${operationChecks(part).map((item) => item.name).join(", ")}.`;
    return part;
  });
}
