import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config';
let client:Redis|undefined, production:Queue|undefined, dead:Queue|undefined, edits:Queue|undefined;
export const redis = () => client ??= new Redis(config.redisUrl,{maxRetriesPerRequest:1,connectTimeout:3000,lazyConnect:true});
export const queueConnection = () => {
  const url=new URL(config.redisUrl);
  return {host:url.hostname,port:Number(url.port||6379),username:url.username?decodeURIComponent(url.username):undefined,password:url.password?decodeURIComponent(url.password):undefined,db:Number(url.pathname.slice(1)||0),...(url.protocol==='rediss:'?{tls:{}}:{}),maxRetriesPerRequest:null};
};
export const productionQueue = () => production ??= new Queue('studio-production',{connection:queueConnection(),defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:10000},removeOnComplete:{count:1000},removeOnFail:{count:1000}}});
export const deadQueue = () => dead ??= new Queue('studio-dead-letter',{connection:queueConnection()});
export const scriptEditQueue = () => edits ??= new Queue('studio-script-edits',{connection:queueConnection(),defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:10000},removeOnComplete:{count:500},removeOnFail:{count:500}}});
export async function closeQueues() { await Promise.all([production?.close(),dead?.close(),edits?.close()]); if(client) client.disconnect(); }
