import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import vm from "node:vm";
// Usage: SCRATCH=<dir> npx tsx scripts/experimental/run-small-models-2026-10-10.mts <model>
const P = process.cwd();
const S = process.env.SCRATCH!;
const { runLocalExploreRepo } = await import(`${P}/src/experimental/tools/local-explore-repo.ts`);
const { generateResult } = await import(`${P}/src/ollama-client.ts`);
const model = process.argv[2];
const out: Record<string, any> = { model, tests: {} };
const dir = `${S}/out/${model.replace(/[^\w.-]/g, "_")}`;
mkdirSync(dir, { recursive: true });
const save = () => writeFileSync(`${dir}/result.json`, JSON.stringify(out, null, 2));
const NUM_CTX = 32768;
const sampling = { temperature: 0.2, top_p: 0.9, top_k: 40, seed: 42 };

const strip = (t: string) =>
  t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<thought>[\s\S]*?<\/thought>/g, "")
    .replace(/^\s*```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
const gen = (system: string, prompt: string) =>
  generateResult(model, prompt, system, undefined, false, { num_ctx: NUM_CTX, num_predict: 8192, ...sampling } as any, 400000);

async function timed(id: string, fn: () => Promise<any>) {
  const t = performance.now();
  try { out.tests[id] = { ...(await fn()), seconds: +((performance.now() - t) / 1000).toFixed(1) }; }
  catch (e: any) { out.tests[id] = { error: String(e?.message ?? e).slice(0, 300), seconds: +((performance.now() - t) / 1000).toFixed(1) }; }
  console.error(model, id, JSON.stringify(out.tests[id]).slice(0, 300));
  save();
}

type Gold = { file: string; text: string };
async function scout(id: string, root: string, query: string, gold: Gold[], forbidden: string[] = []) {
  await timed(id, async () => {
    const r: any = await runLocalExploreRepo({ repository_root: root, query, model, limit: 8, num_ctx: NUM_CTX, num_predict: 2048 });
    const ev: any[] = r.evidence ?? [];
    const hit = gold.filter((g) => ev.some((e) => e.file === g.file && e.quote.trim() === g.text)).length;
    const text = JSON.stringify(r);
    const bad = forbidden.filter((f) => ev.some((e) => e.quote.includes(f)));
    return { status: r.status, confidence: r.confidence, gold_hit: hit, gold_total: gold.length, selected: ev.length, junk: ev.length - hit, forbidden_hit: bad, summary: String(r.answer ?? r.summary ?? "").slice(0, 400), has_redis_claim: /redis/i.test(String(r.answer ?? r.summary ?? "")) };
  });
}

// T1
await scout("T1", P, "Which environment variables gate the local worker and cloud Claude worker, how are they resolved independently from ENABLE_EXPERIMENTAL, and where are their guarded registrations?", [
  { file: "src/config/features.ts", text: 'localWorker: autonomousFlag(environment, "LOCAL_WORKER_ENABLED"),' },
  { file: "src/config/features.ts", text: 'cloudClaudeWorker: autonomousFlag(environment, "CLOUD_CLAUDE_ENABLED"),' },
  { file: "src/config/features.ts", text: 'if (value === undefined || value === "" || value === "0") return false;' },
  { file: "src/config/features.ts", text: 'if (value === "1") return true;' },
  { file: "src/config/features.ts", text: "throw new Error(`${name} must be 1 or 0.`);" },
  { file: "src/index.ts", text: "if (features.cloudClaudeWorker) {" },
  { file: "src/index.ts", text: "registerRunCloudClaudeTask(server);" },
  { file: "src/index.ts", text: "if (features.localWorker) {" },
  { file: "src/index.ts", text: "registerRunLocalWorkerTask(server);" },
]);
// T2
await scout("T2", P, "How does the cache store outlines in Redis and what TTL invalidates them?", []);
// T5 / T7
const PY = mkdtempSync(`${tmpdir()}/py-scopes-`);
cpSync(`${P}/scripts/experimental/fixtures/py-scopes/python`, `${PY}/python`, { recursive: true });
for (const a of [["init", "-q"], ["add", "."], ["-c", "user.name=T", "-c", "user.email=t@e.x", "commit", "-qm", "f"]]) execFileSync("git", ["-C", PY, ...a]);
await scout("T5", PY, "Which OPTIONS dictionary does process_background read, what mode does it return, and what attempts value is in that dictionary? Cite declaration, values and return.", [
  { file: "python/scopes.py", text: "OPTIONS = {" }, { file: "python/scopes.py", text: '"mode": "batch",' }, { file: "python/scopes.py", text: '"attempts": 11,' },
  { file: "python/scopes.py", text: "async def process_background():" }, { file: "python/scopes.py", text: 'return OPTIONS["mode"]' }], ['"inline"', '"attempts": 4']);
await scout("T7", PY, "Which OPTIONS dictionary does process_inline read, what mode does it return, and what attempts value is in that dictionary? Cite declaration, values and return.", [
  { file: "python/scopes.py", text: "def process_inline():" }, { file: "python/scopes.py", text: "OPTIONS = {" }, { file: "python/scopes.py", text: '"mode": "inline",' },
  { file: "python/scopes.py", text: '"attempts": 4,' }, { file: "python/scopes.py", text: 'return OPTIONS["mode"]' }], ['"batch"', '"attempts": 11']);

const fenced = (file: string, n = 0) => readFileSync(file, "utf8").split("```").filter((_, i) => i % 2 === 1)[n].replace(/^[a-z]*\n/, "").trim();
const QD = `${P}/docs/experimental/benchmarks/runs/2026-10-10-qwen9b-vs-4b-questions`;
const runTsx = (file: string) => { try { return { ok: true, out: execFileSync("npx", ["tsx", file], { encoding: "utf8", cwd: P, timeout: 60000 }) }; } catch (e: any) { return { ok: false, out: String(e.stderr || e.message).slice(0, 400) }; } };

// T3
await timed("T3", async () => {
  const r = await gen("You are a precise TypeScript engineer. Return only the function body or function, no Markdown fences, no prose.", fenced(`${QD}/T3-regex-recognizer.ts`));
  const code = strip(r.text);
  writeFileSync(`${dir}/T3-out.ts`, code);
  const exp = /export\s+(async\s+)?function\s+pythonDictionaryRequest/.test(code) ? code : code.replace(/function\s+pythonDictionaryRequest/, "export function pythonDictionaryRequest");
  writeFileSync(`${dir}/T3-mod.ts`, exp);
  writeFileSync(`${dir}/T3-test.ts`, `import { pythonDictionaryRequest as f } from "./T3-mod.ts";
const pos:[string,any][]=[["Which OPTIONS dictionary does process_inline read, what mode?",{dictionaryName:"OPTIONS",functionName:"process_inline"}],["Which batch_cfg dictionary does Run read",{dictionaryName:"batch_cfg",functionName:"Run"}]];
const neg=["Which OPTIONS dictionary does a read and Which OPTIONS dictionary does b read",'Which "OPTIONS" dictionary does f read',"Which a.b dictionary does f read","Which my-dict dictionary does f read","Which 2x dictionary does f read","Which OPTIONS dictionary does f reading","nothing here"];
let ok=0;const fails:string[]=[];
for(const [q,e] of pos){let r;try{r=f(q)}catch{r="THROW"} if(JSON.stringify(r)===JSON.stringify(e))ok++;else fails.push("pos:"+q)}
for(const q of neg){let r;try{r=f(q)}catch{r="THROW"} if(r===undefined)ok++;else fails.push("neg:"+q)}
console.log(JSON.stringify({ok,fails}));`);
  const run = runTsx(`${dir}/T3-test.ts`);
  const tc = (() => { try { execFileSync("npx", ["tsc", "--noEmit", "--strict", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--ignoreConfig", "--allowImportingTsExtensions", `${dir}/T3-mod.ts`], { cwd: P, encoding: "utf8" }); return true; } catch { return false; } })();
  return { status: r.completion?.status, tokens: r.completion?.eval_count, strict_compile: tc, run: run.ok ? JSON.parse(run.out.trim().split("\n").pop()!) : { error: run.out }, total: 9 };
});

// T4
await timed("T4", async () => {
  const r = await gen("You are a precise TypeScript engineer. Return only TypeScript code, no fences, no prose.", fenced(`${QD}/T4-typed-ast-helper.ts`));
  let code = strip(r.text);
  const pre = (/interface PyNode/.test(code) ? "" : "export interface PyNode { type: string; text: string; startRow: number; endRow: number; namedChildren: PyNode[]; childForFieldName(name: string): PyNode | null; hasError: boolean; }\n") + (/DictRow/.test(code.split("function")[0]) && /interface DictRow/.test(code) ? "" : "export interface DictRow { row: number; keys: string[]; }\n");
  code = pre + code;
  if (!/export\s+function\s+pythonDictionaryEntryRows/.test(code)) code = code.replace(/function\s+pythonDictionaryEntryRows/, "export function pythonDictionaryEntryRows");
  writeFileSync(`${dir}/T4-mod.ts`, code);
  writeFileSync(`${dir}/T4-test.ts`, `import { pythonDictionaryEntryRows as f } from "./T4-mod.ts";
const n=(type:string,text:string,row=0,ch:any[]=[],f:any={},err=false,end=row):any=>({type,text,startRow:row,endRow:end,namedChildren:ch,hasError:err,childForFieldName:(k:string)=>f[k]??null});
const str=(s:string,row=0)=>n("string",s,row);
const pair=(k:any,v:any,row=0,end=row)=>n("pair",k.text+": "+v.text,row,[k,v],{key:k,value:v},false,end);
const dict=(ps:any[],err=false)=>n("dictionary","{}",0,ps,{},err,9);
const call=(d:any)=>{try{return f(d)}catch{return "THROW"}};
const res:Record<string,boolean>={};
const j=(x:any)=>JSON.stringify(x);
res.valid=j(call(dict([pair(str('"a"',1),n("integer","11",1),1),pair(str("'b'",2),str('"x"',2),2)])))===j([{row:1,keys:["a"]},{row:2,keys:["b"]}]);
res.dup=call(dict([pair(str('"a"',1),n("integer","1",1),1),pair(str("'a'",2),n("integer","2",2),2)]))===undefined;
res.samerow=j(call(dict([pair(str('"a"',1),n("integer","1",1),1),pair(str('"b"',1),n("float","2.5",1),1)])))===j([{row:1,keys:["a","b"]}]);
res.badlater=call(dict([pair(str('"a"',1),n("integer","1",1),1),n("dictionary_splat","**x",2)]))===undefined && call(dict([pair(str('"a"',1),n("integer","1",1),1),pair(str('"b"',2),n("list","[1]",2),2)]))===undefined;
res.count=call(dict([]))===undefined && call(dict([1,2,3,4].map(i=>pair(str('"k'+i+'"',i),n("integer","1",i),i))))===undefined && call(dict([1,2,3].map(i=>pair(str('"k'+i+'"',i),n("integer","1",i),i))))!==undefined;
res.errmulti=call(dict([pair(str('"a"',1),n("integer","1",1),1)],true))===undefined && call(dict([pair(str('"a"',1),n("integer","1",1),1,2)]))===undefined;
res.sorted=j(call(dict([pair(str('"b"',5),n("integer","1",5),5),pair(str('"a"',2),n("integer","1",2),2)])))===j([{row:2,keys:["a"]},{row:5,keys:["b"]}]);
console.log(j(res));`);
  const tc = (() => { try { execFileSync("npx", ["tsc", "--noEmit", "--strict", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--ignoreConfig", "--allowImportingTsExtensions", `${dir}/T4-mod.ts`], { cwd: P, encoding: "utf8" }); return true; } catch { return false; } })();
  const run = runTsx(`${dir}/T4-test.ts`);
  let checks: any = { error: run.out };
  if (run.ok) { const o = JSON.parse(run.out.trim().split("\n").pop()!); checks = { valid: o.valid, dup: o.dup, samerow: o.samerow, badlater: o.badlater, count: o.count, errmulti: o.errmulti, sorted: o.sorted }; }
  const passed = run.ok ? Object.values(checks).filter(Boolean).length : 0;
  return { status: r.completion?.status, tokens: r.completion?.eval_count, strict_compile: tc, checks, passed, total: 7 };
});

// T6
await timed("T6", async () => {
  const r = await gen("You are a specialized sub-agent assistant.", fenced(`${QD}/T6-groupby-repair.js`));
  const raw = r.text; const code = strip(raw);
  const bare = !/```|<think>|\bimport\b|\bexport\b/.test(raw);
  const ctx: any = { TypeError }; vm.createContext(ctx);
  let res: any = { bare };
  try {
    vm.runInContext(code, ctx);
    const rows = [{ kind: "10" }, { kind: "__proto__" }, { kind: "2" }, { kind: "10" }, { kind: "alpha" }, { kind: "__proto__" }];
    const snap = JSON.stringify(rows);
    const g = vm.runInContext("groupBy", ctx)(rows);
    const isMap = Object.prototype.toString.call(g) === "[object Map]";
    const keys = isMap ? [...g.keys()] : [];
    const throws = (v: any) => { try { vm.runInContext("groupBy", ctx)(v); return false; } catch (e: any) { return e?.name === "TypeError"; } };
    res = { ...res, isMap, order: JSON.stringify(keys) === JSON.stringify(["10", "__proto__", "2", "alpha"]), identity: isMap && g.get("10")?.[0] === rows[0] && g.get("10")?.[1] === rows[3] && g.get("__proto__")?.length === 2, immutable: JSON.stringify(rows) === snap, throws: throws(null) && throws({}) };
    res.pass = res.isMap && res.order && res.identity && res.immutable && res.throws;
  } catch (e: any) { res.error = String(e.message).slice(0, 200); res.pass = false; }
  return { status: r.completion?.status, tokens: r.completion?.eval_count, ...res };
});
console.error("DONE", model);
