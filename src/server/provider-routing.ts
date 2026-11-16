import {randomUUID} from 'node:crypto';
import type {AIProvider} from '@prisma/client';
import {db} from './db';
import {redis} from './queue';
import {AppError,invariant} from '../domain/errors';
export async function providerSlot<T>(provider:AIProvider,work:()=>Promise<T>):Promise<T>{
 const token=randomUUID(),now=Date.now(),key='provider-slots:'+provider.id,bucket='provider-rpm:'+provider.id+':'+Math.floor(now/60000),lease=Math.max(330000,provider.timeoutMs+30000);
 const acquired=await redis().eval("redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[2]) then return 0 end; local n=tonumber(redis.call('GET',KEYS[2]) or '0'); if n>=tonumber(ARGV[3]) then return 0 end; redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],120); redis.call('ZADD',KEYS[1],ARGV[4],ARGV[5]); redis.call('PEXPIRE',KEYS[1],ARGV[6]); return 1",2,key,bucket,now,provider.concurrency,provider.requestsPerMinute,now+lease,token,lease);
 if(!acquired)throw new AppError('PROVIDER_RATE_LIMIT','Provider đã đạt giới hạn đồng thời/tần suất.',429,true);
 try{return await work();}finally{await redis().zrem(key,token);}
}
export async function providersFor(workspaceId:string,capability:string,preferredId?:string){const kinds=capability==='SEARCH'?['BRAVE']:capability==='VIDEO'?['RUNWAY']:capability==='ALIGNMENT'?['ELEVENLABS']:['IMAGE','TTS'].includes(capability)?['OPENAI']:['OPENAI','OPENAI_COMPATIBLE'];const list=await db.aIProvider.findMany({where:{workspaceId,enabled:true,kind:{in:kinds}},orderBy:[{priority:'asc'},{createdAt:'asc'}]});if(preferredId){const index=list.findIndex(p=>p.id===preferredId);invariant(index>=0,'PROVIDER_MISSING','Provider được chọn cho kênh không còn khả dụng.',503);list.unshift(...list.splice(index,1));}invariant(list.length,'PROVIDER_MISSING','Chưa cấu hình provider cho '+capability+'.',503);return list;}
export function definiteRejection(error:unknown){return error instanceof AppError&&['PROVIDER_RATE_LIMIT','PROVIDER_REJECTED','CAPABILITY'].includes(error.code);}
