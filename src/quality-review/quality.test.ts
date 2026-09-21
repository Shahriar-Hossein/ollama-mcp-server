import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync, symlinkSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from './storage.js';
import { QualityService } from './service.js';
import { discover, sourcePath } from './scanner.js';
import { validateReview } from './reviewer.js';

const clean = JSON.stringify({verdict:'skip',severity:'none',confidence:'high',title:'Reasonable',summary:'No finding',issues:[],suggested_code:null,assumptions:[],needs_broader_context:false});
const finding = JSON.stringify({...JSON.parse(clean),verdict:'finding',severity:'medium',issues:[{category:'correctness',description:'Example',reasoning:'Fixture',suggested_change:'Inspect manually'}]});
const fixture = `export function alpha(x: number) { return x + 1; }
export const beta = (x: number) => x * 2;
class Service { run() { return 3; } other() { return 4; } }
function gone() { return 5; }
`;
function setup(t: any) {
  const root = mkdtempSync(join(tmpdir(),'quality-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(join(root,'fixture.ts'),fixture);
  return root;
}
function symbols(store: Store) { return store.db.prepare('SELECT * FROM symbols WHERE active=1 ORDER BY qualified_name').all(); }

test('AST discovery, scopes and formatting hashes preserve literal/semantic changes', () => {
  const a = discover('a.ts','function f(x:number) { return x + 1; }')[0];
  const b = discover('a.ts','\nfunction f ( x : number ) { /* note */ return x+1; }')[0];
  assert.equal(a.id,b.id); assert.equal(a.content_hash,b.content_hash);
  assert.notEqual(a.content_hash,discover('a.ts','function f(x:number) { return x + 2; }')[0].content_hash);
  assert.notEqual(discover('a.js','function f(){return "a b"}')[0].content_hash,discover('a.js','function f(){return "ab"}')[0].content_hash);
  assert.notEqual(discover('a.js','function f(){return\n1}')[0].content_hash,discover('a.js','function f(){return 1}')[0].content_hash);
  assert.deepEqual(discover('a.ts','const a={run(){return 1}}; const b={run(){return 2}};').map(s=>s.qualified_name),['a.run','b.run']);
  assert.equal(discover('a.tsx','const View = () => <span>Hello</span>;')[0].qualified_name,'View');
  for (const ext of ['js','jsx','ts','tsx','mjs','cjs','mts','cts']) assert.equal(discover(`a.${ext}`,'function f(){ return 1; }').length,1);
});

test('queue persists, individual changes requeue, history prevents churn, source stays untouched', async t => {
  const root = setup(t);
  let store = new Store(root), service = new QualityService(store);
  service.scan(); assert.equal(symbols(store).length,5);
  let calls=0;
  const mock = async (_model: string,input: any) => { calls++; assert.ok(input.target_function); return finding; };
  assert.deepEqual(await service.review({},mock),{attempted:1,completed:1});
  store.close(); store = new Store(root); service = new QualityService(store);
  assert.equal(symbols(store).filter(s=>s.current_status==='reviewed').length,1);
  assert.deepEqual(await service.review({count:3},mock),{attempted:3,completed:3});
  assert.equal(calls,4);
  await service.review({file:'fixture.ts'},mock); assert.equal(calls,5);
  assert.equal(readFileSync(join(root,'fixture.ts'),'utf8'),fixture);
  assert.deepEqual(readdirSync(root).sort(),['.quality-review','fixture.ts']);
  assert.equal(readdirSync(join(root,'.quality-review','reports')).length,5);
  service.scan(); assert.ok(symbols(store).every(s=>s.current_status==='reviewed'));
  const modified = fixture.replace('x + 1','x + 9').replace('function gone() { return 5; }','function added() { return 8; }');
  writeFileSync(join(root,'fixture.ts'),modified); service.scan();
  const rows = symbols(store);
  assert.equal(rows.find(s=>s.qualified_name==='alpha')?.current_status,'stale');
  assert.equal(rows.find(s=>s.qualified_name==='added')?.current_status,'pending');
  assert.equal(rows.find(s=>s.qualified_name==='beta')?.current_status,'reviewed');
  assert.ok(!rows.find(s=>s.qualified_name==='gone'));
  const order:string[]=[];
  await service.review({count:10},async (_,input)=>{order.push(input.qualified_name);return clean;});
  assert.deepEqual(order,['added','alpha']);
  writeFileSync(join(root,'fixture.ts'),fixture); service.scan();
  assert.ok(symbols(store).every(s=>s.current_status==='reviewed'));
  assert.deepEqual(await service.review({count:10},mock),{attempted:0,completed:0});
  const first = service.findings()[0]; service.decide(String(first.id),'accepted');
  assert.equal(service.show(String(first.id)).human_status,'accepted');
  assert.equal(readFileSync(join(root,'fixture.ts'),'utf8'),fixture);
  store.close();
});

test('symbol filter reviews only the selected function', async t => {
  const root = setup(t), store = new Store(root), service = new QualityService(store);
  t.after(()=>store.close()); service.scan();
  const seen: string[] = [];
  assert.deepEqual(await service.review({file:'fixture.ts',symbol:'beta'},async (_,input)=>{seen.push(input.qualified_name); return clean;}),{attempted:1,completed:1});
  assert.deepEqual(seen,['beta']);
});

test('review passes an explicit context window to the model call', async t => {
  const root = setup(t), store = new Store(root), service = new QualityService(store);
  t.after(()=>store.close()); service.scan();
  let received: number | undefined;
  await service.review({numCtx:8192},async (_model,_input,numCtx)=>{ received=numCtx; return clean; });
  assert.equal(received,8192);
  assert.equal(store.db.prepare('SELECT num_ctx FROM reviews').get()?.num_ctx,8192);
  assert.match(String(store.db.prepare('SELECT report_path FROM reviews').get()?.report_path),/^reports\//);
});

test('reports use readable per-function and per-model sequence names', async t => {
  const root = setup(t), store = new Store(root), service = new QualityService(store);
  t.after(()=>store.close()); service.scan();
  await service.review({symbol:'alpha',model:'qwen2.5-coder:7b'},async()=>clean);
  await service.review({symbol:'alpha',model:'qwen2.5-coder:7b',force:true},async()=>clean);
  const paths = store.db.prepare('SELECT report_path FROM reviews ORDER BY rowid').all().map((row:any)=>row.report_path);
  assert.deepEqual(paths,['reports/alpha-qwen2.5-coder%3A7b-1.md','reports/alpha-qwen2.5-coder%3A7b-2.md']);
  assert.deepEqual(service.renameReports(),{renamed:0});
});

test('malformed results, finite retries, outage stop, lock, atomic scan and report recovery', async t => {
  const root = setup(t), store = new Store(root), service = new QualityService(store);
  t.after(()=>store.close()); service.scan();
  assert.throws(()=>validateReview('no json'));
  assert.deepEqual(validateReview('{}').verdict,'skip');
  assert.equal(validateReview(JSON.stringify({verdict:'skip',severity:'low'})).verdict,'skip');
  assert.deepEqual(validateReview(JSON.stringify({findings:['Avoid duplicate work']})).issues,[{category:'other',description:'Avoid duplicate work',reasoning:'',suggested_change:''}]);
  assert.deepEqual(validateReview(JSON.stringify({verdict:'finding',severity:'high',confidence:0.95,issues:[{what_is_wrong:'Missing bound',why:'Error text is unbounded',suggested_code:'Limit it'}]})),{verdict:'finding',severity:'high',confidence:'high',title:'Model-raised concern',summary:'Inspect the issue details and raw model response.',issues:[{category:'other',description:'Missing bound',reasoning:'Error text is unbounded',suggested_change:'Limit it'}],suggested_code:null,assumptions:[],needs_broader_context:false});
  await service.review({count:2},async()=>'{');
  assert.equal(symbols(store).filter(s=>s.current_status==='failed').length,2);
  await assert.rejects(service.review({count:100},async()=>{throw new Error('unavailable');}),/batch stopped/);
  assert.equal(symbols(store).filter(s=>s.current_status==='failed').length,3);
  store.db.exec("UPDATE symbols SET current_status='failed',retries=3,retry_after=0");
  assert.deepEqual(await service.review({count:100},async()=>clean),{attempted:0,completed:0});
  await service.review({force:true},async()=>finding);
  const row = service.findings()[0];
  await service.review({force:true},async()=>'{');
  assert.equal(symbols(store).filter(s=>s.current_status==='reviewed').length,1);
  store.db.prepare('UPDATE reviews SET report_path=NULL WHERE id=?').run(row.id);
  service.recoverReports(); assert.ok(service.show(String(row.id)).report_path);
  await service.review({symbol:'beta',force:true},async()=>clean);
  const skipped = store.db.prepare("SELECT * FROM reviews WHERE verdict='skip' ORDER BY rowid DESC LIMIT 1").get() as any;
  store.db.prepare('UPDATE reviews SET report_path=NULL WHERE id=?').run(skipped.id);
  service.recoverReports(); assert.ok(service.show(String(skipped.id)).report_path);
  store.lock(); const other = new Store(root);
  assert.throws(()=>new QualityService(other).scan(),/owns the queue/); other.close(); store.unlock();
  const before = JSON.stringify(symbols(store));
  writeFileSync(join(root,'fixture.ts'),'function broken(');
  assert.throws(()=>service.scan(),/Parse error/);
  assert.equal(JSON.stringify(symbols(store)),before);
});

test('reject traversal, source/storage/report symlinks and hard links; skip dependencies', t => {
  const root = setup(t);
  assert.throws(()=>sourcePath(root,'../outside.ts'),/outside/);
  symlinkSync(join(root,'fixture.ts'),join(root,'alias.ts'));
  assert.throws(()=>sourcePath(root,'alias.ts'),/symlinks/);
  mkdirSync(join(root,'node_modules')); writeFileSync(join(root,'node_modules','dep.ts'),fixture);
  const store = new Store(root), service = new QualityService(store); service.scan();
  assert.equal(symbols(store).length,5);
  assert.throws(()=>store.report('../../outside','bad'),/Unsafe/);
  symlinkSync(root,join(root,'.quality-review','reports'));
  assert.throws(()=>store.report('safe.md','bad'),/Unsafe/);
  store.close();
  const root2 = mkdtempSync(join(tmpdir(),'quality-unsafe-')); t.after(()=>rmSync(root2,{recursive:true,force:true}));
  symlinkSync(root,join(root2,'.quality-review')); assert.throws(()=>new Store(root2),/Unsafe/);
  rmSync(join(root2,'.quality-review')); mkdirSync(join(root2,'.quality-review'));
  linkSync(join(root,'fixture.ts'),join(root2,'.quality-review','state.db'));
  assert.throws(()=>new Store(root2),/Unsafe/);
  assert.equal(readFileSync(join(root,'fixture.ts'),'utf8'),fixture);
});

const cli = resolve('src/quality-review/cli.ts');
function runCLI(root: string,args: string[],host: string) {
  const child = spawn(process.execPath,['--import','tsx',cli,...args,'--cwd',root],{env:{...process.env,OLLAMA_HOST:host},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr=''; child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
  const done = once(child,'close').then(([code])=>({code,stdout,stderr}));
  return {child,done};
}
test('actual CLI: one/count calls, SIGINT safe persistence, restart and source integrity', async t => {
  const root = setup(t); let calls=0; let interrupt: (()=>void)|undefined;
  const server = createServer(async (req,res)=>{
    let body=''; for await (const chunk of req) body+=chunk;
    const request=JSON.parse(body); calls++;
    assert.equal(req.url,'/api/generate'); assert.equal(request.stream,false);
    assert.equal(request.tools,undefined); assert.ok(JSON.parse(request.prompt).target_function);
    if (interrupt) { const fn=interrupt; interrupt=undefined; fn(); await new Promise(resolve=>setTimeout(resolve,100)); }
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({response:clean}));
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>server.close()); const address=server.address() as {port:number}; const host=`http://127.0.0.1:${address.port}`;
  for (const args of [['scan'],['review','next'],['review','--count','3']]) {
    const result = await runCLI(root,args,host).done; assert.equal(result.code,0,result.stderr);
  }
  assert.equal(calls,4);
  writeFileSync(join(root,'extra.ts'),'function extraOne(){return 1} function extraTwo(){return 2}');
  assert.equal((await runCLI(root,['scan'],host).done).code,0);
  const worker=runCLI(root,['work'],host); interrupt=()=>worker.child.kill('SIGINT');
  const stopped=await worker.done; assert.equal(stopped.code,0,stopped.stderr); assert.match(stopped.stderr,/Stopping/); assert.equal(calls,5);
  assert.equal((await runCLI(root,['work'],host).done).code,0); assert.equal(calls,7);
  const store = new Store(root); assert.equal(store.db.prepare('SELECT count(*) AS n FROM reviews').get()?.n,7); store.close();
  assert.equal(readFileSync(join(root,'fixture.ts'),'utf8'),fixture);
  assert.equal(readFileSync(join(root,'extra.ts'),'utf8'),'function extraOne(){return 1} function extraTwo(){return 2}');
  assert.deepEqual(readdirSync(root).sort(),['.quality-review','extra.ts','fixture.ts']);
});
