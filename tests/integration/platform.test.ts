import {beforeAll,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Queue,Worker,QueueEvents} from 'bullmq';
import sharp from 'sharp';
import {db} from '../../src/server/db';
import {createProject,projectFor,saveScript,queueProject} from '../../src/server/projects';
import {tickSchedules} from '../../src/server/scheduler';
import {paidStep} from '../../src/server/budget';
import {encrypt,hashPassword,canonicalHash} from '../../src/server/crypto';
import {createSession,sessionActor,Actor} from '../../src/server/auth';
import {queueConnection,closeQueues,productionQueue,deadQueue} from '../../src/server/queue';
import {finishOAuth,accountToken,startOAuth} from '../../src/server/oauth';
import {changeOAuthApp} from '../../src/server/oauth-apps';
import {reconcile} from '../../src/worker/reconcile';
import {decrypt} from '../../src/server/crypto';
import {runProduction} from '../../src/worker/pipeline';
import {OpenAIAdapter} from '../../src/providers/openai';
import * as media from '../../src/render/ffmpeg';
import {AppError} from '../../src/domain/errors';
import {fixtureScript} from '../fixtures';
let actor:Actor,other:Actor,channelId:string;const users:string[]=[],workspaces:string[]=[];
beforeAll(async()=>{
  for(const n of ['Owner','Other']){
    const user=await db.user.create({data:{email:randomUUID()+'@test.invalid',name:'TEST '+n,passwordHash:hashPassword('test-password-12345'),memberships:{create:{role:'OWNER',workspace:{create:{name:'TEST integration '+n}}}}},include:{memberships:true}});
    const a:Actor={userId:user.id,workspaceId:user.memberships[0].workspaceId,role:'OWNER',name:user.name,email:user.email};
    if(n==='Owner')actor=a;else other=a;users.push(user.id);workspaces.push(a.workspaceId);
  }
  channelId=(await db.contentChannel.create({data:{workspaceId:actor.workspaceId,name:'TEST integration',topic:'Test',budgetCents:10000}})).id;
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
afterAll(async()=>{await db.oAuthState.deleteMany({where:{workspaceId:{in:workspaces}}});for(const id of workspaces)await db.workspace.delete({where:{id}});await db.user.deleteMany({where:{id:{in:users}}});await closeQueues();await db.$disconnect();});
const create=(topic:string=randomUUID(),intent='SCRIPT')=>createProject(actor,{channelId,topic,targetDuration:10,intent},randomUUID());
describe('Real PostgreSQL tenant isolation and persistence',()=>{
  it('creates opaque session and enforces membership on lookup',async()=>{const token=await createSession(actor.userId,actor.workspaceId);expect(await sessionActor(token)).toMatchObject({workspaceId:actor.workspaceId,role:'OWNER'});const session=await db.session.findFirst({where:{userId:actor.userId}});expect(session?.tokenHash).not.toBe(token);expect(await sessionActor('wrong')).toBeNull();});
  it('rejects cross-tenant channel/project access at service and composite FK',async()=>{await expect(createProject(other,{channelId,topic:'x'},randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});const p=await create();await expect(projectFor(other.workspaceId,p.id)).rejects.toMatchObject({code:'NOT_FOUND'});await expect(db.videoProject.create({data:{workspaceId:other.workspaceId,channelId,title:'x',topic:'x',topicHash:'x'}})).rejects.toMatchObject({code:'P2003'});});
  it('deduplicates concurrent requests with the same idempotency key',async()=>{const key=randomUUID(),input={channelId,topic:randomUUID(),targetDuration:10};const [a,b]=await Promise.all([createProject(actor,input,key),createProject(actor,input,key)]);expect(a.id).toBe(b.id);expect(await db.productionJob.count({where:{projectId:a.id}})).toBe(1);await expect(createProject(actor,{...input,targetDuration:15},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});});
  it('blocks repeated normalized topics',async()=>{const topic='Test '+randomUUID();await create(topic);await expect(create(topic.toUpperCase()+'!')).rejects.toMatchObject({code:'DUPLICATE_TOPIC'});});
  it('runs duplicate scheduler ticks exactly once with persisted next occurrence',async()=>{
    const now=new Date(),s=await db.scheduleRule.create({data:{workspaceId:actor.workspaceId,channelId,name:'TEST schedule',topic:'Test scheduled',cron:'0 7 * * *',timezone:'Asia/Ho_Chi_Minh',nextRunAt:new Date(now.getTime()-1000),maxRuns:2}});
    await Promise.all([tickSchedules(now,actor.workspaceId),tickSchedules(now,actor.workspaceId)]);
    expect(await db.scheduledOccurrence.count({where:{scheduleId:s.id}})).toBe(1);
    const rule=await db.scheduleRule.findUniqueOrThrow({where:{id:s.id}});expect(rule.runCount).toBe(1);expect(rule.nextRunAt!.getTime()).toBeGreaterThan(now.getTime());
  });
});
describe('Budget and uncertain provider outcomes',()=>{
  it('reserves monthly budget atomically across competing jobs',async()=>{
    const c=await db.contentChannel.create({data:{workspaceId:actor.workspaceId,name:'TEST budget',topic:'Test',budgetCents:10}});
    const p=await createProject(actor,{channelId:c.id,topic:'test budget'},randomUUID()),base={projectId:p.id,workspaceId:actor.workspaceId,channelId:c.id,providerId:'test',category:'IMAGE',cents:7};
    const result=await Promise.allSettled([paidStep({...base,key:randomUUID()},async()=>1),paidStep({...base,key:randomUUID()},async()=>2)]);
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(result.filter(x=>x.status==='rejected')).toHaveLength(1);
  });
  it('keeps unknown charge after timeout and prevents unapproved repeat',async()=>{
    const p=await create(),key=randomUUID(),input={projectId:p.id,workspaceId:actor.workspaceId,channelId,providerId:'test',category:'TTS',cents:3,key};
    await expect(paidStep(input,async()=>{throw new AppError('PROVIDER_UNKNOWN','test timeout');})).rejects.toThrow();
    expect((await db.costUsage.findUniqueOrThrow({where:{idempotencyKey:key}})).status).toBe('UNKNOWN');
    const fn=vi.fn(async()=>1);await expect(paidStep(input,fn)).rejects.toMatchObject({code:'COST_RECONCILIATION'});expect(fn).not.toHaveBeenCalled();
  });
});
describe('Real worker checkpoints with mocked paid AI',()=>{
  it('only one worker claims a job, saves script/version and stops at SCRIPT_READY',async()=>{
    await db.aIProvider.create({data:{workspaceId:actor.workspaceId,name:'TEST ONLY provider',encryptedKey:encrypt('test-never-live')}});
    const p=await create(),j=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
    const spy=vi.spyOn(OpenAIAdapter.prototype,'script').mockImplementation(async()=>{await new Promise(r=>setTimeout(r,100));return structuredClone(fixtureScript);});
    await Promise.all([runProduction(j.id),runProduction(j.id)]);
    expect(spy).toHaveBeenCalledTimes(1);const result=await projectFor(actor.workspaceId,p.id);expect(result.status).toBe('SCRIPT_READY');expect(result.script?.versions).toHaveLength(1);expect(result.scenes).toHaveLength(2);
    const updated=structuredClone(fixtureScript);updated.title='Edited test';await saveScript(actor,p.id,updated,1);
    await expect(saveScript(actor,p.id,updated,1)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    expect((await projectFor(actor.workspaceId,p.id)).revision).toBe(2);
  });
  it('does not research high-risk topics without supplied sources',async()=>{
    const p=await create('Tư vấn đầu tư '+randomUUID()),j=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
    const spy=vi.spyOn(OpenAIAdapter.prototype,'script');await expect(runProduction(j.id)).rejects.toMatchObject({code:'SOURCES_REQUIRED'});expect(spy).not.toHaveBeenCalled();
  });
  it('generates ideas asynchronously without inventing verified sources',async()=>{
    const p=await create('Ideas '+randomUUID(),'IDEAS'),job=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
    vi.spyOn(OpenAIAdapter.prototype,'ideas').mockResolvedValue({ideas:[{title:'Fixture idea',problem:'Test problem',audience:'Test audience',channelFit:90,feasibility:85,feasibilityReason:'Test feasibility',angle:'Test angle',hook:'Test hook',sourceUrls:['https://unverified.example/'],priority:80}]});
    const scriptSpy=vi.spyOn(OpenAIAdapter.prototype,'script');await runProduction(job.id);
    expect(scriptSpy).not.toHaveBeenCalled();const idea=await db.contentIdea.findFirstOrThrow({where:{workspaceId:actor.workspaceId,title:'Fixture idea'}});expect(idea.sourceUrls).toEqual([]);expect(idea).toMatchObject({channelId,problem:'Test problem',audience:'Test audience',channelFit:90,feasibility:85});expect(idea.estimatedCostCents).toBeGreaterThan(0);expect(idea.estimateBasis).toContain('10s');
    expect((await db.productionJob.findUniqueOrThrow({where:{id:job.id}})).status).toBe('COMPLETED');
  });
  it('renders image/audio/subtitles through the complete pipeline and reuses saved images after TTS failure',async()=>{
    const p=await create('Fixture pipeline '+randomUUID(),'VIDEO'),job=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
    vi.spyOn(OpenAIAdapter.prototype,'script').mockResolvedValue({...structuredClone(fixtureScript),title:'Unique fixture '+p.id,full_narration:'Video mới kiểm thử tiếng Việt có dấu. '+fixtureScript.scenes[1].narration_text,scenes:fixtureScript.scenes.map((s,i)=>i===0?{...s,narration_text:'Video mới kiểm thử tiếng Việt có dấu.'}:s)});
    const image=await sharp({create:{width:540,height:960,channels:3,background:'#254956'}}).png().toBuffer();
    const imageSpy=vi.spyOn(OpenAIAdapter.prototype,'image').mockResolvedValue(Buffer.from(image));
    const speechSpy=vi.spyOn(OpenAIAdapter.prototype,'speech').mockRejectedValueOnce(new AppError('PROVIDER_REJECTED','TEST TTS failure'));
    await expect(runProduction(job.id)).rejects.toMatchObject({code:'PROVIDER_REJECTED'});
    expect(await db.generatedAsset.count({where:{projectId:p.id,kind:'IMAGE'}})).toBe(1);
    const directory=path.resolve('artifacts/integration-evidence');await mkdir(directory,{recursive:true});
    const audioFile=path.join(directory,'test-tone.mp3');
    await media.runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libmp3lame',audioFile]);speechSpy.mockResolvedValue(await readFile(audioFile));
    await queueProject(actor,p.id,'retry');const retry=await db.productionJob.findFirstOrThrow({where:{projectId:p.id,status:'QUEUED'}});
    const original=media.renderVideo;vi.spyOn(media,'renderVideo').mockImplementation(input=>original({...input,widthOverride:270,fps:24}));
    await runProduction(retry.id);
    const result=await projectFor(actor.workspaceId,p.id);expect(result.status).toBe('AWAITING_APPROVAL');expect(result.outputKey).toMatch(/final\.mp4$/);expect(result.qaScore).toBeGreaterThanOrEqual(85);expect((result.qaReport as {checks:{name:string;pass:boolean}[]}).checks.some(c=>c.name==='Tốc độ đọc phụ đề')).toBe(true);expect(result.assets).toHaveLength(4);expect(imageSpy).toHaveBeenCalledTimes(2);
    await writeFile(path.join(directory,'pipeline-verification.json'),JSON.stringify({testFixture:true,paidAIMocked:true,status:result.status,qa:result.qaReport,assetCount:result.assets.length},null,2));
    vi.mocked(media.renderVideo).mockRejectedValueOnce(new AppError('MEDIA_FAILED','TEST render interrupted'));
    await queueProject(actor,p.id,'retry');const failedRender=await db.productionJob.findFirstOrThrow({where:{projectId:p.id,status:'QUEUED'}});
    await expect(runProduction(failedRender.id)).rejects.toMatchObject({code:'MEDIA_FAILED'});
    expect((await projectFor(actor.workspaceId,p.id)).status).toBe('FAILED');
    await queueProject(actor,p.id,'retry');const restored=await db.productionJob.findFirstOrThrow({where:{projectId:p.id,status:'QUEUED'}});await runProduction(restored.id);
    expect((await projectFor(actor.workspaceId,p.id)).status).toBe('AWAITING_APPROVAL');expect(imageSpy).toHaveBeenCalledTimes(2);expect(speechSpy).toHaveBeenCalledTimes(3);
  });
  it('refuses to start a cancelled job',async()=>{const p=await create(),j=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});await db.productionJob.update({where:{id:j.id},data:{status:'CANCELLED'}});const spy=vi.spyOn(OpenAIAdapter.prototype,'script');await runProduction(j.id);expect(spy).not.toHaveBeenCalled();});
});
describe('OAuth and Redis recovery',()=>{
  it('rejects invalid, expired and replayed OAuth callback before network',async()=>{const fetcher=vi.spyOn(globalThis,'fetch');await expect(finishOAuth(actor,'youtube','missing','code')).rejects.toMatchObject({code:'OAUTH_STATE'});const state=randomUUID();await db.oAuthState.create({data:{id:state,userId:actor.userId,workspaceId:actor.workspaceId,platform:'youtube',verifier:encrypt('verifier'),expiresAt:new Date(0)}});await expect(finishOAuth(actor,'youtube',state,'code')).rejects.toMatchObject({code:'OAUTH_STATE'});expect(fetcher).not.toHaveBeenCalled();});
  it('preserves consent digest after PostgreSQL JSONB key normalization',async()=>{const input={z:1,a:{b:2,a:3}};const rows=await db.$queryRaw<{value:unknown}[]>`SELECT ${JSON.stringify(input)}::jsonb AS value`;expect(canonicalHash(rows[0].value)).toBe(canonicalHash(input));});
  it('completes OAuth callback once, encrypts tokens, and rotates expired refresh credentials',async()=>{
    await changeOAuthApp(actor,'youtube',{clientId:'test-client',clientSecret:'test-secret',expectedVersion:0});
    const state=new URL(await startOAuth(actor,'youtube')).searchParams.get('state')!;
    const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/token')?Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}):Response.json({items:[{id:'test-channel',snippet:{title:'TEST YouTube'}}]}));
    const account=await finishOAuth(actor,'youtube',state,'test-code');await expect(finishOAuth(actor,'youtube',state,'test-code')).rejects.toMatchObject({code:'OAUTH_STATE'});
    const credential=await db.socialAccountCredential.findUniqueOrThrow({where:{socialAccountId:account.id}});expect(credential.encryptedAccessToken).not.toContain('test-access');expect(decrypt(credential.encryptedAccessToken)).toBe('test-access');
    await db.socialAccountCredential.update({where:{id:credential.id},data:{expiresAt:new Date(0)}});
    fetcher.mockResolvedValue(Response.json({access_token:'test-new-access',refresh_token:'test-new-refresh',expires_in:3600}));expect(await accountToken(account.id)).toBe('test-new-access');
    expect(decrypt((await db.socialAccountCredential.findUniqueOrThrow({where:{id:credential.id}})).encryptedRefreshToken!)).toBe('test-new-refresh');
    await db.socialAccount.update({where:{id:account.id},data:{disconnectedAt:new Date()}});await expect(accountToken(account.id)).rejects.toMatchObject({code:'DISCONNECTED'});
  });
  it('recovers an expired worker lease once and dead-letters exhausted jobs',async()=>{
    // Scope this dispatcher to a separate test workspace so unrelated queued jobs are untouched.
    const channel=await db.contentChannel.create({data:{workspaceId:other.workspaceId,name:'TEST recovery',topic:'Test'}});
    const p=await createProject(other,{channelId:channel.id,topic:'recovery'},randomUUID()),job=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
    await db.productionJob.update({where:{id:job.id},data:{status:'RUNNING',workerId:'dead-worker',leaseUntil:new Date(0),attempts:1}});
    await Promise.all([reconcile(other.workspaceId),reconcile(other.workspaceId)]);
    const recovered=await db.productionJob.findUniqueOrThrow({where:{id:job.id}});expect(recovered.status).toBe('QUEUED');expect(recovered.queueVersion).toBe(1);
    expect(await productionQueue().getJob(job.id+'-1')).toBeTruthy();await (await productionQueue().getJob(job.id+'-1'))?.remove();
    await db.productionJob.update({where:{id:job.id},data:{status:'RUNNING',workerId:'dead-again',leaseUntil:new Date(0),attempts:3}});await reconcile(other.workspaceId);
    expect((await db.productionJob.findUniqueOrThrow({where:{id:job.id}})).status).toBe('FAILED');const dead=await deadQueue().getJob(job.id+'-lease-1');expect(dead).toBeTruthy();await dead?.remove();
  });
  it('retries a failed BullMQ attempt and preserves a completed job ID',async()=>{
    const name='studio-integration-'+randomUUID(),connection=queueConnection(),queue=new Queue(name,{connection}),events=new QueueEvents(name,{connection});await events.waitUntilReady();
    let attempts=0;const worker=new Worker(name,async()=>{attempts++;if(attempts===1)throw new Error('test transient');return 'ok';},{connection});
    try{const job=await queue.add('test',{},{jobId:'one',attempts:2,backoff:{type:'fixed',delay:50}});expect(await job.waitUntilFinished(events,10000)).toBe('ok');await queue.add('test',{},{jobId:'one'});expect(attempts).toBe(2);expect(await queue.getCompletedCount()).toBe(1);}finally{await worker.close();await events.close();await queue.obliterate({force:true});await queue.close();}
  });
});
