import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Queue} from 'bullmq';
import {db} from '../src/server/db';
import {queueConnection} from '../src/server/queue';
const file='artifacts/restart-smoke.json';
if(process.argv[2]==='prepare'){
  const workspace=await db.workspace.create({data:{name:'TEST restart '+randomUUID()}});
  const channel=await db.contentChannel.create({data:{workspaceId:workspace.id,name:'TEST persistence',topic:'Test'}});
  const schedule=await db.scheduleRule.create({data:{workspaceId:workspace.id,channelId:channel.id,name:'TEST persistent rule',topic:'Test',cron:'0 7 * * *',nextRunAt:new Date('2030-01-01T00:00:00Z'),enabled:false}});
  const name='studio-restart-'+workspace.id,q=new Queue(name,{connection:queueConnection()});await q.add('test-persist',{testOnly:true},{jobId:'persist',delay:3600000});await q.close();await mkdir('artifacts',{recursive:true});
  await writeFile(file,JSON.stringify({testFixture:true,workspaceId:workspace.id,scheduleId:schedule.id,queue:name,preparedAt:new Date().toISOString()},null,2));console.log('Prepared isolated database + Redis persistence fixture.');
}else{
  const marker=JSON.parse(await readFile(file,'utf8'));const schedule=await db.scheduleRule.findUniqueOrThrow({where:{id:marker.scheduleId}});
  if(schedule.workspaceId!==marker.workspaceId||schedule.cron!=='0 7 * * *')throw new Error('Persistence mismatch');
  const q=new Queue(marker.queue,{connection:queueConnection()}),job=await q.getJob('persist');if(!job||!job.data.testOnly)throw new Error('Redis job did not survive restart');
  await job.remove();await q.close();await db.workspace.delete({where:{id:marker.workspaceId}});
  await writeFile(file,JSON.stringify({...marker,passed:true,postgresSchedulePersisted:true,redisJobPersisted:true,verifiedAt:new Date().toISOString(),fixtureCleaned:true},null,2));console.log('PASS: PostgreSQL schedule and Redis job survived restart; test records removed.');
}
await db.$disconnect();
