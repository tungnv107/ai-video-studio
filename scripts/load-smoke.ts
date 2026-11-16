import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient(),base=process.env.TEST_BASE_URL||'http://localhost:3000',email='load-'+randomUUID()+'@test.invalid';
let userId:string|undefined,workspaceId:string|undefined;
try{
 const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:new URL(base).origin,'Content-Type':'application/json'},body:JSON.stringify({name:'TEST bounded API load',email,password:randomUUID()+randomUUID()})});if(!response.ok)throw Error('Fixture registration failed '+response.status);
 const cookie=response.headers.get('set-cookie')!.split(';')[0],actor=await (await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).json();userId=actor.userId;workspaceId=actor.workspaceId;
 const measurements:{path:string;status:number;ms:number}[]=[],count=80,concurrency=8;let cursor=0;
 await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<count){const index=cursor++,path=['bootstrap','channels','calendar','analytics'][index%4],start=performance.now(),r=await fetch(base+'/api/'+path,{headers:{Cookie:cookie}});await r.arrayBuffer();measurements.push({path,status:r.status,ms:Math.round(performance.now()-start)});}}));
 const sorted=measurements.map(m=>m.ms).sort((a,b)=>a-b),report={passed:measurements.every(m=>m.status===200),requests:count,concurrency,environment:'local smoke; not production capacity certification',p50Ms:sorted[Math.floor(count*.5)],p95Ms:sorted[Math.floor(count*.95)],maxMs:sorted.at(-1),errors:measurements.filter(m=>m.status!==200)};await mkdir('artifacts',{recursive:true});await writeFile('artifacts/load-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)throw Error('Load smoke failed');
}finally{if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect();}
