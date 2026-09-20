import { DatabaseSync } from 'node:sqlite';
import { constants, fstatSync, lstatSync, mkdirSync, openSync, closeSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  root: string;
  directory: string;
  db: DatabaseSync;
  constructor(cwd: string) {
    this.root = realpathSync(cwd);
    this.directory = join(this.root, '.quality-review');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.checkDirectory();
    const path = join(this.directory, 'state.db');
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { const stat = lstatSync(path + suffix); if (!stat.isFile() || stat.nlink !== 1) throw new Error('Unsafe SQLite path'); }
      catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try { const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1) throw new Error('Unsafe SQLite path'); }
    finally { closeSync(fd); }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA temp_store=MEMORY; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY, repository TEXT NOT NULL, file TEXT NOT NULL, language TEXT NOT NULL,
        qualified_name TEXT NOT NULL, symbol_type TEXT NOT NULL, start_line INTEGER, end_line INTEGER,
        content_hash TEXT NOT NULL, current_status TEXT NOT NULL, first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, last_reviewed_at TEXT, last_reviewed_hash TEXT,
        retries INTEGER NOT NULL DEFAULT 0, retry_after INTEGER NOT NULL DEFAULT 0, error TEXT,
        active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY, symbol_id TEXT NOT NULL, reviewed_hash TEXT NOT NULL, model TEXT NOT NULL,
        prompt_version TEXT NOT NULL, verdict TEXT, severity TEXT, confidence TEXT, summary TEXT,
        report_path TEXT, created_at TEXT NOT NULL, human_status TEXT NOT NULL DEFAULT 'pending',
        input_json TEXT NOT NULL, result_json TEXT NOT NULL, raw_response TEXT NOT NULL,
        num_ctx INTEGER NOT NULL DEFAULT 32768);
      CREATE TABLE IF NOT EXISTS worker_lock (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS queue ON symbols(active,current_status,file,id);
      CREATE INDEX IF NOT EXISTS history ON reviews(symbol_id,reviewed_hash);`);
    if (!(this.db.prepare("SELECT 1 FROM pragma_table_info('reviews') WHERE name='num_ctx'").get())) {
      this.db.exec('ALTER TABLE reviews ADD COLUMN num_ctx INTEGER NOT NULL DEFAULT 32768');
    }
  }
  checkDirectory() {
    if (lstatSync(this.directory).isSymbolicLink() || realpathSync(this.directory) !== this.directory) throw new Error('Unsafe storage directory');
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  lock() {
    this.transaction(() => {
      const row = this.db.prepare('SELECT pid FROM worker_lock WHERE id=1').get() as {pid:number}|undefined;
      if (row) {
        try { process.kill(row.pid, 0); } catch (error: any) { if (error.code === 'ESRCH') { this.db.exec('DELETE FROM worker_lock'); } else throw error; }
        if (this.db.prepare('SELECT pid FROM worker_lock').get()) throw new Error(`Another scan/worker owns the queue (PID ${row.pid})`);
      }
      this.db.prepare('INSERT INTO worker_lock VALUES (1,?)').run(process.pid);
    });
  }
  unlock() { this.db.prepare('DELETE FROM worker_lock WHERE pid=?').run(process.pid); }
  report(id: string, text: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Unsafe report ID');
    this.checkDirectory();
    const directory = join(this.directory, 'reports');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) throw new Error('Unsafe reports directory');
    const path = join(directory, `${id}.md`);
    // Exclusive creation prevents overwriting symlinks or hard links supplied by the repository.
    try { writeFileSync(path, text, { flag: 'wx', mode: 0o600 }); }
    catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 200_000 || readFileSync(path, 'utf8') !== text) throw new Error('Unsafe or conflicting report file');
    }
    return `reports/${id}.md`;
  }
  close() { this.db.close(); }
}
