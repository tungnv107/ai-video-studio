import {tickRetention} from './retention';
import {syncMetrics,tickAnalyticsTasks} from './analytics';
import {processWebhooks} from '../server/webhooks';
import { Worker,UnrecoverableError } from 'bullmq';
import { createServer } from 'node:http';
import { db } from '../server/db';
import { productionQueue,deadQueue,queueConnection,closeQueues } from '../server/queue';
import { tickSchedules } from '../server/scheduler';
import { runProduction } from './pipeline';
import { log } from '../server/logger';
import { AppError } from '../domain/errors';
import { tickPublishing } from './publishing';
import { reconcile } from './reconcile';
import {runScriptEdit,reconcileScriptEdits} from './script-edits';
let stopping=false,ticking=false,lastTick=0;
const maintenance=new Map<string,Promise<void>>();
function dispatch(name:string,work:()=>Promise<unknown>){if(maintenance.has(name)||stopping)return;const task=work().then(()=>{}).catch(()=>log.error({task:name},"maintenance_failed")).finally(()=>maintenance.delete(name));maintenance.set(name,task);}
const worker=new Worker('studio-production',async bullJob=>{
  try { await runProduction(bullJob.data.jobId); }
  catch(error){if(error instanceof AppError&&error.retryable)throw error;throw new UnrecoverableError(error instanceof Error?error.message:'Production failed');}
},{connection:queueConnection(),concurrency:Number(process.env.WORKER_CONCURRENCY||1),lockDuration:180000,maxStalledCount:2});
worker.on('failed',(job,error)=>{void (async()=>{
  if(!job)return;const record=await db.productionJob.findUnique({where:{id:job.data.jobId}});
  if(record?.status==='FAILED')await deadQueue().add('failed',{jobId:record.id,error:record.error},{jobId:record.id+'-'+record.queueVersion,removeOnComplete:false});
  log.warn({jobId:job.id,code:error.name},'production_failed');
})().catch(()=>log.error('dead_letter_failed'));});
worker.on('error',()=>log.error('queue_worker_error'));
const editWorker=new Worker('studio-script-edits',async job=>{try{await runScriptEdit(job.data.jobId);}catch(error){if(error instanceof AppError&&error.retryable)throw error;throw new UnrecoverableError(error instanceof Error?error.message:'Script edit failed');}},{connection:queueConnection(),concurrency:1,lockDuration:180000,maxStalledCount:2});
editWorker.on('error',()=>log.error('script_edit_worker_error'));
editWorker.on('failed',job=>{if(job)void db.scriptEditJob.findUnique({where:{id:job.data.jobId}}).then(record=>record?.status==='FAILED'?deadQueue().add('script-edit-failed',{scriptEditId:record.id},{jobId:'edit-'+record.id+'-'+record.queueVersion}):undefined).catch(()=>log.error('script_edit_dead_letter_failed'));});
async function tick(){if(ticking||stopping)return;ticking=true;try{await tickSchedules();await reconcile();await reconcileScriptEdits();lastTick=Date.now();dispatch('webhooks',processWebhooks);dispatch('publishing',tickPublishing);dispatch('metrics',syncMetrics);dispatch('recommendations',tickAnalyticsTasks);dispatch('retention',tickRetention);}catch{log.error('scheduler_or_dispatch_failed');}finally{ticking=false;}}
await tick();
const timer=setInterval(()=>void tick(),5000);
const health=createServer((_,res)=>{const ok=Date.now()-lastTick<30000;res.writeHead(ok?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok,worker:'production',lastTick}));});
health.listen(Number(process.env.WORKER_HEALTH_PORT||3001),'0.0.0.0');
async function shutdown(){if(stopping)return;stopping=true;clearInterval(timer);health.close();await Promise.all([worker.close(),editWorker.close()]);while(ticking)await new Promise(r=>setTimeout(r,100));await Promise.allSettled([...maintenance.values()]);await closeQueues();await db.$disconnect();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
log.info('production_worker_started');
