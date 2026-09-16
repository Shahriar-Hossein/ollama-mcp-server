import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { indexRepository, type ResolutionQuality, type RepositoryIndex } from "./indexer.js";

export type VerificationStatus = "SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT";
export type EvidenceKind = "source_range" | "symbol" | "relationship" | "adapter_fact" | "git_commit";

export interface KnowledgeEvidence {
  evidence_kind: EvidenceKind;
  commit_hash?: string;
  file?: string;
  start_byte?: number;
  end_byte?: number;
  symbol_id?: string;
  relationship_id?: string;
  adapter?: string;
  adapter_fact_id?: string;
  git_commit_hash?: string;
  excerpt?: string;
  resolution_quality: ResolutionQuality;
}

export interface KnowledgeUpdate {
  claim: string;
  subject_symbol_id?: string;
  verification_status: VerificationStatus;
  resolution_quality: ResolutionQuality;
  evidence: KnowledgeEvidence[];
  source_files?: string[];
}

export interface KnowledgeWriteResult {
  commit_hash: string;
  claims_saved: number;
  evidence_saved: number;
  claim_ids: string[];
}

export interface KnowledgeFreshnessResult {
  commit_hash: string;
  previous_commit_hash: string | null;
  changed_files: string[];
  claims_marked_stale: number;
}

const MIGRATION_1 = `
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE repository_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), repository_root TEXT NOT NULL, indexed_commit TEXT NOT NULL, indexed_at TEXT NOT NULL);
CREATE TABLE indexed_commits (commit_hash TEXT PRIMARY KEY, indexed_at TEXT NOT NULL);
CREATE TABLE source_files (commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash), file TEXT NOT NULL, content_hash TEXT NOT NULL, PRIMARY KEY (commit_hash, file));
CREATE TABLE claims (id TEXT PRIMARY KEY, claim TEXT NOT NULL, subject_symbol_id TEXT, verification_status TEXT NOT NULL CHECK (verification_status IN ('SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT')), resolution_quality TEXT NOT NULL CHECK (resolution_quality IN ('exact', 'static', 'heuristic', 'unresolved')), verified_commit TEXT NOT NULL REFERENCES indexed_commits(commit_hash), verified_at TEXT NOT NULL, stale_at TEXT, stale_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK ((stale_at IS NULL AND stale_reason IS NULL) OR (stale_at IS NOT NULL AND stale_reason IS NOT NULL)));
CREATE TABLE claim_evidence (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE, evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('source_range', 'symbol', 'relationship', 'adapter_fact', 'git_commit')), commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash), file TEXT, start_byte INTEGER, end_byte INTEGER, symbol_id TEXT, relationship_id TEXT, adapter TEXT, adapter_fact_id TEXT, git_commit_hash TEXT, excerpt TEXT, resolution_quality TEXT NOT NULL CHECK (resolution_quality IN ('exact', 'static', 'heuristic', 'unresolved')), CHECK (start_byte IS NULL OR (file IS NOT NULL AND end_byte IS NOT NULL AND start_byte >= 0 AND end_byte > start_byte)), CHECK (evidence_kind != 'source_range' OR (file IS NOT NULL AND start_byte IS NOT NULL AND end_byte IS NOT NULL)), CHECK (evidence_kind != 'symbol' OR symbol_id IS NOT NULL), CHECK (evidence_kind != 'relationship' OR relationship_id IS NOT NULL), CHECK (evidence_kind != 'adapter_fact' OR (adapter IS NOT NULL AND adapter_fact_id IS NOT NULL)), CHECK (evidence_kind != 'git_commit' OR git_commit_hash IS NOT NULL));
CREATE TABLE claim_source_files (claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE, file TEXT NOT NULL, PRIMARY KEY (claim_id, file));
CREATE INDEX claims_current_supported ON claims (verified_commit, updated_at) WHERE verification_status = 'SUPPORTED' AND stale_at IS NULL;
CREATE INDEX claim_evidence_claim ON claim_evidence (claim_id);
CREATE INDEX claim_source_files_file ON claim_source_files (file, claim_id);
`;

function now(): string { return new Date().toISOString(); }

function normalizedFile(root: string, file: string): string {
  const path = resolve(root, file);
  const result = relative(root, path);
  if (!result || result === ".." || result.startsWith(`..${sep}`)) throw new Error(`File must be repository-relative: ${file}`);
  return result.split(sep).join("/");
}

function databasePath(root: string): string {
  const directory = resolve(root, ".super-explorer");
  mkdirSync(directory, { recursive: true });
  return resolve(directory, "explorer.sqlite");
}

function migrate(db: DatabaseSync, fresh: boolean): void {
  if (fresh) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATION_1);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(now());
      db.exec("COMMIT");
      return;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const version = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null };
  if (version.version !== null && version.version > 1) throw new Error(`Knowledge database schema version ${version.version} is newer than supported version 1.`);
  if (version.version === 1) return;
  throw new Error("Knowledge database has no schema migration record.");
}

function validateEvidence(root: string, index: RepositoryIndex, evidence: KnowledgeEvidence): void {
  if (evidence.evidence_kind === "symbol" && !index.symbols.some(({ id }) => id === evidence.symbol_id)) throw new Error(`Evidence refers to an unknown symbol: ${evidence.symbol_id}`);
  if (evidence.evidence_kind === "relationship" || evidence.evidence_kind === "adapter_fact") {
    throw new Error(`${evidence.evidence_kind} evidence is unavailable until that index exposes stable IDs.`);
  }
  if (evidence.file) normalizedFile(root, evidence.file);
  if (evidence.evidence_kind === "source_range") {
    const source = readFileSync(resolve(root, normalizedFile(root, evidence.file!)));
    if (evidence.end_byte! > source.length) throw new Error(`Evidence range exceeds file length: ${evidence.file}`);
  }
  if (evidence.evidence_kind === "git_commit") {
    try { execFileSync("git", ["cat-file", "-e", `${evidence.git_commit_hash}^{commit}`], { cwd: root, stdio: "ignore" }); }
    catch { throw new Error(`Evidence refers to an unknown Git commit: ${evidence.git_commit_hash}`); }
  }
  if (evidence.commit_hash && evidence.commit_hash !== index.commit_hash) throw new Error("V1 evidence must be from the current indexed commit.");
}

function weakestQuality(evidence: KnowledgeEvidence[]): ResolutionQuality {
  const rank: Record<ResolutionQuality, number> = { exact: 3, static: 2, heuristic: 1, unresolved: 0 };
  return evidence.reduce((weakest, item) => rank[item.resolution_quality] < rank[weakest] ? item.resolution_quality : weakest, evidence[0].resolution_quality);
}

function sourceFilesAtCommit(root: string, commitHash: string): Map<string, string> {
  const files = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", commitHash], { cwd: root, encoding: "buffer" })
    .toString("utf8").split("\0").filter(Boolean);
  const sourceFiles = new Map<string, string>();
  for (const file of files) {
    const content = execFileSync("git", ["cat-file", "blob", `${commitHash}:${file}`], { cwd: root, encoding: "buffer" });
    sourceFiles.set(file, createHash("sha256").update(content).digest("hex"));
  }
  return sourceFiles;
}

function storedSourceFiles(db: DatabaseSync, commitHash: string): Map<string, string> {
  const rows = db.prepare("SELECT file, content_hash FROM source_files WHERE commit_hash = ?").all(commitHash) as Array<{ file: string; content_hash: string }>;
  return new Map(rows.map(({ file, content_hash }) => [file, content_hash]));
}

function changedPaths(previous: Map<string, string>, current: Map<string, string>): string[] {
  return [...new Set([...previous.keys(), ...current.keys()])]
    .filter((file) => previous.get(file) !== current.get(file))
    .sort();
}

function storeIndexedState(db: DatabaseSync, root: string, index: RepositoryIndex, files = sourceFilesAtCommit(root, index.commit_hash)): void {
  const timestamp = now();
  db.prepare("INSERT OR IGNORE INTO indexed_commits (commit_hash, indexed_at) VALUES (?, ?)").run(index.commit_hash, timestamp);
  db.prepare("INSERT INTO repository_state (singleton, repository_root, indexed_commit, indexed_at) VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET repository_root = excluded.repository_root, indexed_commit = excluded.indexed_commit, indexed_at = excluded.indexed_at").run(root, index.commit_hash, timestamp);
  const insertFile = db.prepare("INSERT OR REPLACE INTO source_files (commit_hash, file, content_hash) VALUES (?, ?, ?)");
  for (const [file, contentHash] of files) insertFile.run(index.commit_hash, file, contentHash);
}

/** Snapshots the indexed commit and marks claims stale when one of their direct source files changed. */
export function refreshKnowledgeFreshness(repositoryRoot: string): KnowledgeFreshnessResult {
  const root = resolve(repositoryRoot);
  const index = indexRepository(root);
  const path = databasePath(root);
  const fresh = !existsSync(path);
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, fresh);
    db.exec("BEGIN");
    try {
      const state = db.prepare("SELECT repository_root, indexed_commit FROM repository_state WHERE singleton = 1").get() as { repository_root: string; indexed_commit: string } | undefined;
      if (state && state.repository_root !== root) throw new Error("Knowledge database belongs to a different repository root.");
      const currentFiles = sourceFilesAtCommit(root, index.commit_hash);
      const previousFiles = state ? storedSourceFiles(db, state.indexed_commit) : new Map<string, string>();
      const changed_files = state ? changedPaths(previousFiles, currentFiles) : [];
      let claims_marked_stale = 0;
      if (changed_files.length) {
        const placeholders = changed_files.map(() => "?").join(", ");
        const result = db.prepare(`UPDATE claims SET stale_at = ?, stale_reason = ?, updated_at = ? WHERE stale_at IS NULL AND id IN (SELECT DISTINCT claim_id FROM claim_source_files WHERE file IN (${placeholders}))`)
          .run(now(), `Source files changed at ${index.commit_hash}: ${changed_files.length}`, now(), ...changed_files);
        claims_marked_stale = Number(result.changes);
      }
      storeIndexedState(db, root, index, currentFiles);
      db.exec("COMMIT");
      return { commit_hash: index.commit_hash, previous_commit_hash: state?.indexed_commit ?? null, changed_files, claims_marked_stale };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally { db.close(); }
}

/** Saves source-backed verification outcomes atomically. Unsupported outcomes remain auditable but are never current knowledge. */
export function saveKnowledgeUpdates(repositoryRoot: string, updates: KnowledgeUpdate[]): KnowledgeWriteResult {
  const root = resolve(repositoryRoot);
  if (!updates.length) return { commit_hash: indexRepository(root).commit_hash, claims_saved: 0, evidence_saved: 0, claim_ids: [] };
  const index = indexRepository(root);
  for (const update of updates) {
    if (!update.claim.trim()) throw new Error("Knowledge claims must not be empty.");
    if (!update.evidence.length) throw new Error("Knowledge updates require at least one evidence record.");
    if (update.subject_symbol_id && !index.symbols.some(({ id }) => id === update.subject_symbol_id)) throw new Error(`Claim refers to an unknown symbol: ${update.subject_symbol_id}`);
    if (update.verification_status === "SUPPORTED" && update.evidence.some(({ resolution_quality }) => resolution_quality === "unresolved")) throw new Error("SUPPORTED claims cannot rely on unresolved evidence.");
    if (update.resolution_quality !== weakestQuality(update.evidence)) throw new Error("Claim resolution quality must equal its weakest evidence quality.");
    for (const evidence of update.evidence) validateEvidence(root, index, evidence);
  }
  const path = databasePath(root);
  const fresh = !existsSync(path);
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, fresh);
    db.exec("BEGIN");
    try {
      const state = db.prepare("SELECT repository_root, indexed_commit FROM repository_state WHERE singleton = 1").get() as { repository_root: string; indexed_commit: string } | undefined;
      if (state && state.repository_root !== root) throw new Error("Knowledge database belongs to a different repository root.");
      const currentFiles = sourceFilesAtCommit(root, index.commit_hash);
      if (state && state.indexed_commit !== index.commit_hash) {
        const changed = changedPaths(storedSourceFiles(db, state.indexed_commit), currentFiles);
        if (changed.length) {
          const placeholders = changed.map(() => "?").join(", ");
          db.prepare(`UPDATE claims SET stale_at = ?, stale_reason = ?, updated_at = ? WHERE stale_at IS NULL AND id IN (SELECT DISTINCT claim_id FROM claim_source_files WHERE file IN (${placeholders}))`)
            .run(now(), `Source files changed at ${index.commit_hash}: ${changed.length}`, now(), ...changed);
        }
      }
      storeIndexedState(db, root, index, currentFiles);
      const claimIds: string[] = [];
      let evidenceSaved = 0;
      for (const update of updates) {
        const timestamp = now();
        const claimId = randomUUID().toLowerCase();
        claimIds.push(claimId);
        db.prepare("INSERT INTO claims (id, claim, subject_symbol_id, verification_status, resolution_quality, verified_commit, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(claimId, update.claim.trim(), update.subject_symbol_id ?? null, update.verification_status, update.resolution_quality, index.commit_hash, timestamp, timestamp, timestamp);
        const files = new Set(update.source_files?.map((file) => normalizedFile(root, file)) ?? []);
        for (const evidence of update.evidence) {
          const file = evidence.file ? normalizedFile(root, evidence.file) : null;
          if (file) files.add(file);
          if (evidence.symbol_id) files.add(index.symbols.find(({ id }) => id === evidence.symbol_id)!.file);
          db.prepare("INSERT INTO claim_evidence (id, claim_id, evidence_kind, commit_hash, file, start_byte, end_byte, symbol_id, relationship_id, adapter, adapter_fact_id, git_commit_hash, excerpt, resolution_quality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID().toLowerCase(), claimId, evidence.evidence_kind, evidence.commit_hash ?? index.commit_hash, file, evidence.start_byte ?? null, evidence.end_byte ?? null, evidence.symbol_id ?? null, evidence.relationship_id ?? null, evidence.adapter ?? null, evidence.adapter_fact_id ?? null, evidence.git_commit_hash ?? null, evidence.excerpt ?? null, evidence.resolution_quality);
          evidenceSaved += 1;
        }
        const addFile = db.prepare("INSERT INTO claim_source_files (claim_id, file) VALUES (?, ?)");
        for (const file of files) addFile.run(claimId, file);
      }
      db.exec("COMMIT");
      return { commit_hash: index.commit_hash, claims_saved: updates.length, evidence_saved: evidenceSaved, claim_ids: claimIds };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally { db.close(); }
}
