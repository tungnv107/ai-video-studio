import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
import Redis from 'ioredis';
import sharp from 'sharp';
import {runMedia,renderVideo} from '../src/render/ffmpeg';
const taskUrl=new URL(process.env.DATABASE_URL!);taskUrl.hostname='postgres';taskUrl.port='5432';process.env.DATABASE_URL=taskUrl.toString();
if(process.env.TENANT_DATABASE_URL){const tenant=new URL(process.env.TENANT_DATABASE_URL);tenant.hostname='postgres';tenant.port='5432';process.env.TENANT_DATABASE_URL=tenant.toString();}
process.env.REDIS_URL='redis://redis:6379';process.env.STORAGE_LOCAL_DIR='/tmp/studio-storage';
const db=new PrismaClient(),redis=new Redis(process.env.REDIS_URL);
await db.$queryRaw`SELECT 1`;await db.scriptEditJob.count();await db.workspaceInvitation.count();await db.mediaItem.count();await db.authChallenge.count();await db.experiment.count();if(await redis.ping()!=='PONG')throw new Error('Redis unavailable');
const directory='/tmp/studio-container-smoke';await mkdir(directory,{recursive:true});
await sharp({create:{width:270,height:480,channels:3,background:'#194b54'}}).png().toFile(directory+'/image.png');
await runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.7','-c:a','libmp3lame',directory+'/audio.mp3']);
const output=await renderVideo({directory,aspect:'9:16',targetDuration:1,widthOverride:270,fps:24,scenes:[{image:directory+'/image.png',audio:directory+'/audio.mp3',text:'Kiểm thử container tiếng Việt',duration:1}]});
if(!output.qa.passed)throw new Error('Container render failed QA');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1'],{stdio:'ignore',env:{...process.env,PORT:'3000'}});
const worker=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','src/worker/main.ts'],{stdio:'ignore',env:process.env});
try{
  let ready=false;for(let attempt=0;attempt<60;attempt++){try{const response=await fetch('http://127.0.0.1:3000/api/system/health');if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!ready)throw new Error('Production web health did not become ready');
  const login=await fetch('http://127.0.0.1:3000/login');if(!login.ok||!(await login.text()).includes('AI Video'))throw new Error('Production login response failed');
  const join=await fetch('http://127.0.0.1:3000/join');if(!join.ok||!(await join.text()).includes('AI Video'))throw new Error('Invitation landing page failed');
  const email='container-'+randomUUID()+'@test.invalid';let userId:string|undefined,workspaceId:string|undefined;try{const registered=await fetch('http://127.0.0.1:3000/api/auth/register',{method:'POST',headers:{Origin:process.env.APP_URL||'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password:randomUUID()+randomUUID(),name:'TEST Linux authenticated RLS'})});if(!registered.ok)throw Error('Production register failed '+registered.status);const cookie=registered.headers.get('set-cookie')!.split(';')[0],bootstrap=await fetch('http://127.0.0.1:3000/api/bootstrap',{headers:{Cookie:cookie}});if(!bootstrap.ok)throw Error('Production tenant bootstrap failed '+bootstrap.status);const value=await bootstrap.json();userId=value.actor.userId;workspaceId=value.actor.workspaceId;if(value.actor.role!=='OWNER'||value.templates.length!==7)throw Error('Production bootstrap payload invalid');}finally{const user=userId?{id:userId}:await db.user.findUnique({where:{email}});if(user){if(!workspaceId)workspaceId=(await db.workspaceMember.findFirst({where:{userId:user.id}}))?.workspaceId;if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});await db.user.delete({where:{id:user.id}});}}
  const workerHealth=await fetch('http://127.0.0.1:3001');if(!workerHealth.ok)throw new Error('Worker health failed');
  console.log(JSON.stringify({passed:true,platform:process.platform,postgres:true,redis:true,ffmpeg:true,qa:output.qa.score,productionWebHealth:true,workerHealth:true,loginPage:true,invitationPage:true,collaborationTables:true,advancedTables:true,authenticatedRlsBootstrap:true,testFixture:true}));
}finally{await Promise.all([server,worker].map(async process=>{if(process.exitCode===null){process.kill('SIGTERM');await once(process,'exit');}}));await db.$disconnect();redis.disconnect();}
