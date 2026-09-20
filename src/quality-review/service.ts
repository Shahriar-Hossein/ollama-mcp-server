import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { Store } from './storage.js';
import { readSymbols, scanFiles, sourcePath, type SymbolInput } from './scanner.js';
import { buildContext, callModel, DEFAULT_MODEL, markdown, PROMPT_VERSION, validateReview, type ModelCall } from './reviewer.js';

type Row = SymbolInput & {current_status:string; retries:number};
export class QualityService {
  constructor(readonly store: Store) {}
  private upsert(symbol: SymbolInput) {
    const now = new Date().toISOString();
    const previous = this.store.db.prepare('SELECT * FROM symbols WHERE id=?').get(symbol.id);
    const reviewed = this.store.db.prepare('SELECT created_at FROM reviews WHERE symbol_id=? AND reviewed_hash=? ORDER BY created_at DESC LIMIT 1').get(symbol.id, symbol.content_hash);
    const status = reviewed ? 'reviewed' : previous?.last_reviewed_hash ? 'stale' : 'pending';
    this.store.db.prepare(`INSERT INTO symbols (id,repository,file,language,qualified_name,symbol_type,start_line,end_line,content_hash,current_status,first_seen_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET start_line=excluded.start_line,end_line=excluded.end_line,content_hash=excluded.content_hash,
      current_status=CASE WHEN symbols.content_hash=excluded.content_hash AND symbols.active=1 THEN symbols.current_status ELSE excluded.current_status END,
      retries=CASE WHEN symbols.content_hash=excluded.content_hash THEN symbols.retries ELSE 0 END,
      retry_after=CASE WHEN symbols.content_hash=excluded.content_hash THEN symbols.retry_after ELSE 0 END,
      error=CASE WHEN symbols.content_hash=excluded.content_hash THEN symbols.error ELSE NULL END,
      updated_at=excluded.updated_at,active=1`).run(symbol.id,this.store.root,symbol.file,symbol.language,symbol.qualified_name,symbol.symbol_type,symbol.start_line,symbol.end_line,symbol.content_hash,status,now,now);
  }
  scan() {
    this.store.lock();
    try {
      this.store.transaction(() => {
        this.store.db.exec('CREATE TEMP TABLE seen (id TEXT PRIMARY KEY)');
        for (const file of scanFiles(this.store.root)) for (const symbol of readSymbols(this.store.root,file)) {
          this.upsert(symbol);
          this.store.db.prepare('INSERT INTO seen VALUES (?)').run(symbol.id);
        }
        this.store.db.exec('UPDATE symbols SET active=0 WHERE id NOT IN (SELECT id FROM seen); DROP TABLE seen');
      });
      return this.status();
    } finally { this.store.unlock(); }
  }
  recoverReports() {
    for (const row of this.store.db.prepare("SELECT * FROM reviews WHERE verdict='finding' AND report_path IS NULL").iterate()) {
      const id = String(row.id);
      const path = this.store.report(id,markdown(id,JSON.parse(String(row.input_json)),String(row.model),String(row.created_at),validateReview(String(row.result_json)),Number(row.num_ctx) || 32768));
      this.store.db.prepare('UPDATE reviews SET report_path=? WHERE id=?').run(path,id);
    }
  }
  status() {
    const counts: Record<string, number> = {pending:0,reviewed:0,stale:0,failed:0,ignored:0};
    for (const row of this.store.db.prepare('SELECT current_status,count(*) AS count FROM symbols WHERE active=1 GROUP BY current_status').all()) counts[String(row.current_status)] = Number(row.count);
    return {total: Object.values(counts).reduce((a,b)=>a+b,0), ...counts,
      findings: this.store.db.prepare("SELECT severity,count(*) AS count FROM reviews WHERE verdict='finding' GROUP BY severity").all()};
  }

  findings(severity?: string, limit=100) {
    return this.store.db.prepare(`SELECT r.id,s.file,s.qualified_name,r.reviewed_hash,r.severity,r.confidence,r.summary,r.human_status,r.created_at,
      (s.active=0 OR s.content_hash!=r.reviewed_hash) AS outdated FROM reviews r JOIN symbols s ON s.id=r.symbol_id
      WHERE r.verdict='finding' AND (? IS NULL OR r.severity=?) ORDER BY r.created_at DESC LIMIT ?`).all(severity ?? null,severity ?? null,limit);
  }
  show(id: string) {
    const row = this.store.db.prepare('SELECT * FROM reviews WHERE id=?').get(id);
    if (!row) throw new Error('Review not found');
    return row;
  }
  decide(id: string, decision: 'accepted'|'rejected') {
    this.show(id);
    this.store.db.prepare('UPDATE reviews SET human_status=? WHERE id=?').run(decision,id);
  }
  async review(options: {count?:number; file?:string; symbol?:string; model?:string; numCtx?:number; force?:boolean; stopped?:()=>boolean; onResult?:(result:unknown)=>void} = {}, modelCall: ModelCall = callModel) {
    const model = options.model ?? DEFAULT_MODEL;
    const file = options.file ? relative(this.store.root,sourcePath(this.store.root,options.file)) : null;
    const count = options.count ?? (file ? Infinity : 1);
    if (!(count > 0)) throw new Error('Count must be positive');
    this.store.lock();
    let completed = 0, attempted = 0;
    try {
      this.recoverReports();
      this.store.db.exec('CREATE TEMP TABLE attempted (id TEXT PRIMARY KEY)');
      while (attempted < count && !options.stopped?.()) {
        const row = this.store.db.prepare(`SELECT * FROM symbols WHERE active=1 AND (? IS NULL OR file=?) AND (? IS NULL OR qualified_name=?)
          AND id NOT IN (SELECT id FROM attempted)
          AND (?=1 OR current_status IN ('pending','stale') OR (current_status='failed' AND retries<3 AND retry_after<=?))
          ORDER BY CASE current_status WHEN 'pending' THEN 0 WHEN 'stale' THEN 1 WHEN 'reviewed' THEN 2 ELSE 3 END,file,qualified_name,id LIMIT 1`).get(file,file,options.symbol ?? null,options.symbol ?? null,options.force ? 1 : 0,Date.now()) as Row|undefined;
        if (!row) break;
        this.store.db.prepare('INSERT INTO attempted VALUES (?)').run(row.id);
        let symbol: SymbolInput | undefined;
        let input: ReturnType<typeof buildContext>;
        try {
          symbol = readSymbols(this.store.root,row.file).find(s => s.id === row.id);
          if (!symbol) { this.store.db.prepare('UPDATE symbols SET active=0 WHERE id=?').run(row.id); continue; }
          this.upsert(symbol);
          const current = this.store.db.prepare('SELECT current_status FROM symbols WHERE id=?').get(row.id);
          if (!options.force && current?.current_status === 'reviewed') continue;
          input = buildContext(symbol);
        } catch (error) { this.fail(row.id,error); options.onResult?.({id:row.id,error:String(error)}); attempted++; continue; }
        attempted++;
        let raw: string;
        try { raw = await modelCall(model,input,options.numCtx); }
        catch (error) {
          this.fail(row.id,error);
          // A transport/model-service error stops this batch instead of poisoning the queue.
          throw new Error(`Ollama request failed; batch stopped after ${completed} completed reviews: ${String(error)}`);
        }
        let result;
        try { result = validateReview(raw); }
        catch (error) { this.fail(row.id,error); options.onResult?.({id:row.id,error:String(error)}); continue; }
        const id = randomUUID(), date = new Date().toISOString();
        const numCtx = options.numCtx ?? 32768;
        this.store.transaction(() => {
          this.store.db.prepare(`INSERT INTO reviews(id,symbol_id,reviewed_hash,model,prompt_version,verdict,severity,confidence,summary,created_at,input_json,result_json,raw_response,num_ctx) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,row.id,symbol.content_hash,model,PROMPT_VERSION,result.verdict,result.severity,result.confidence,result.summary,date,JSON.stringify(input),JSON.stringify(result),raw,numCtx);
          this.store.db.prepare("UPDATE symbols SET current_status='reviewed',last_reviewed_at=?,last_reviewed_hash=?,retries=0,retry_after=0,error=NULL WHERE id=?").run(date,symbol.content_hash,row.id);
        });
        completed++;
        const path = this.store.report(id,markdown(id,input,model,date,result,numCtx));
        this.store.db.prepare('UPDATE reviews SET report_path=? WHERE id=?').run(path,id);
        options.onResult?.({id,symbol: symbol.qualified_name,verdict:result.verdict});
      }
      return {attempted,completed};
    } finally { this.store.db.exec('DROP TABLE IF EXISTS attempted'); this.store.unlock(); }
  }
  private fail(id: string, error: unknown) {
    this.store.db.prepare("UPDATE symbols SET current_status=CASE WHEN EXISTS (SELECT 1 FROM reviews WHERE symbol_id=symbols.id AND reviewed_hash=symbols.content_hash) THEN 'reviewed' ELSE 'failed' END,retries=retries+1,retry_after=?,error=? WHERE id=?").run(Date.now()+60_000,String(error).slice(0,2000),id);
  }
}
