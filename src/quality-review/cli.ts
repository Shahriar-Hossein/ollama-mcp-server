import { parseArgs } from 'node:util';
import { Store } from './storage.js';
import { QualityService } from './service.js';
import { markdown, validateReview } from './reviewer.js';

const help = `quality scan|status|review [next]|work|findings|show ID|accept ID|reject ID|rename-reports
  --cwd PATH       Target repository (default current directory)
  --count N        Maximum attempts; review defaults to one, --file to all eligible
  --file PATH      Restrict reviews to one relative source path
  --symbol NAME    Restrict reviews to one discovered qualified function name
  --model NAME     Ollama model (default qwen2.5-coder:3b)
  --num-ctx N      Ollama context window in tokens (default 32768)
  --force          Explicitly review already reviewed/exhausted versions again
  --severity LEVEL Filter findings; --count limits displayed findings (default 100)
  --help           Show this help
work drains the eligible queue; Ctrl+C finishes and saves the current request.
accept/reject changes metadata only. No command applies source changes.`;
async function main() {
  const {values,positionals} = parseArgs({allowPositionals:true,options:{cwd:{type:'string'},count:{type:'string'},file:{type:'string'},symbol:{type:'string'},model:{type:'string'},'num-ctx':{type:'string'},force:{type:'boolean'},severity:{type:'string'},help:{type:'boolean'}}});
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command,arg] = positionals;
  if (!['scan','status','review','work','findings','show','accept','reject','rename-reports'].includes(command)) throw new Error('Unknown command');
  if (positionals.length > 2 || (arg && !(command === 'review' && arg === 'next') && !['show','accept','reject'].includes(command))) throw new Error('Unexpected positional argument');
  if (['show','accept','reject'].includes(command) && !arg) throw new Error('Review ID required');
  const count = values.count === undefined ? undefined : Number(values.count);
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) throw new Error('--count must be a positive integer');
  const numCtx = values['num-ctx'] === undefined ? undefined : Number(values['num-ctx']);
  if (numCtx !== undefined && (!Number.isSafeInteger(numCtx) || numCtx < 1)) throw new Error('--num-ctx must be a positive integer');
  if (values.severity && !['none','low','medium','high','critical'].includes(values.severity)) throw new Error('Invalid severity');
  if (command === 'review' && arg === 'next' && count !== undefined && count !== 1) throw new Error('review next always reviews one function');
  const store = new Store(values.cwd ?? process.cwd());
  const service = new QualityService(store);
  let stopped = false;
  const stop = () => { stopped = true; console.error('Stopping after the current request is persisted.'); };
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
  const print = (value: unknown) => console.log(JSON.stringify(value,null,2));
  try {
    if (command === 'scan') print(service.scan());
    else if (command === 'status') print(service.status());
    else if (command === 'rename-reports') print(service.renameReports());
    else if (command === 'findings') print(service.findings(values.severity,count));
    else if (command === 'show') {
      const row = service.show(arg);
      console.log(markdown(String(row.id),JSON.parse(String(row.input_json)),String(row.model),String(row.created_at),validateReview(String(row.result_json)),Number(row.num_ctx) || 32768));
      console.log(`Human status: ${row.human_status}`);
    }
    else if (command === 'accept' || command === 'reject') { service.decide(arg,command === 'accept' ? 'accepted':'rejected'); print({id:arg,status:command}); }
    else print(await service.review({count: arg === 'next' ? 1 : count ?? (command === 'work' ? Infinity : undefined),file:values.file,symbol:values.symbol,model:values.model,numCtx,force:values.force,stopped:()=>stopped,onResult:print}));
  } finally { process.off('SIGINT',stop); process.off('SIGTERM',stop); store.close(); }
}
main().catch(error => { console.error(String(error)); process.exitCode=1; });
