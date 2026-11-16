import {beforeAll,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/server/db';
import {createProject,saveScript,queueProject} from '../../src/server/projects';
import {encrypt,hashPassword} from '../../src/server/crypto';
import {closeQueues} from '../../src/server/queue';
import {runProduction} from '../../src/worker/pipeline';
import {OpenAIAdapter} from '../../src/providers/openai';
import {AppError} from '../../src/domain/errors';
import type {Actor} from '../../src/server/auth';
import {fixtureScript} from '../fixtures';

let actor:Actor,channelId:string,providerId:string;
beforeAll(async()=>{
  const user=await db.user.create({data:{email:randomUUID()+'@test.invalid',name:'TEST retry costs',passwordHash:hashPassword(randomUUID()),memberships:{create:{role:'OWNER',workspace:{create:{name:'TEST retry costs'}}}}},include:{memberships:true}});
  actor={userId:user.id,workspaceId:user.memberships[0].workspaceId,role:'OWNER',name:user.name,email:user.email};
  channelId=(await db.contentChannel.create({data:{workspaceId:actor.workspaceId,name:'TEST retry costs',topic:'Test',budgetCents:10000}})).id;
  providerId=(await db.aIProvider.create({data:{workspaceId:actor.workspaceId,name:'TEST never live',encryptedKey:encrypt('test-only')}})).id;
});
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{if(actor){await db.workspace.delete({where:{id:actor.workspaceId}});await db.user.delete({where:{id:actor.userId}});}await closeQueues();await db.$disconnect();});
async function fixture(saved=true){
  const project=await createProject(actor,{channelId,topic:'Checkpoint '+randomUUID(),targetDuration:10,intent:'VIDEO'},randomUUID());
  await db.productionJob.updateMany({where:{projectId:project.id},data:{status:'FAILED'}});
  await db.videoProject.update({where:{id:project.id},data:{status:'FAILED'}});
  if(saved)await saveScript(actor,project.id,fixtureScript,0);
  const base={projectId:project.id,workspaceId:actor.workspaceId,providerId,category:'LLM',status:'UNKNOWN',amountCents:5};
  const current=await db.costUsage.create({data:{...base,idempotencyKey:project.id+':script:'+providerId}});
  const historical=await db.costUsage.create({data:{...base,idempotencyKey:project.id+':script:'+providerId+':reviewed:'+randomUUID()}});
  return {project,current,historical};
}

describe('checkpoint-aware cost confirmation',()=>{
  it('uses a saved audio checkpoint even if the cost receipt update was interrupted',async()=>{
    const {project}=await fixture(),key=project.id+':r1:s1:audio:'+providerId;
    await db.generatedAsset.create({data:{projectId:project.id,workspaceId:actor.workspaceId,revision:1,sceneOrder:1,kind:'AUDIO',storageKey:'test/'+randomUUID()+'.mp3',mimeType:'audio/mpeg',bytes:123,duration:5}});
    await db.costUsage.create({data:{projectId:project.id,workspaceId:actor.workspaceId,providerId,category:'TTS',status:'UNKNOWN',amountCents:3,idempotencyKey:key}});
    expect(await queueProject(actor,project.id,'render')).toMatchObject({status:'SCHEDULED'});
    expect(await db.costUsage.findUnique({where:{idempotencyKey:key}})).toMatchObject({status:'UNKNOWN',amountCents:3});
  });
  it('renders a saved script without repeating its LLM call or erasing uncertain charges',async()=>{
    const {project,current,historical}=await fixture();
    const script=vi.spyOn(OpenAIAdapter.prototype,'script');
    const image=vi.spyOn(OpenAIAdapter.prototype,'image').mockRejectedValue(new AppError('PROVIDER_REJECTED','TEST stop before media generation'));
    const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network in this test'));
    expect(await queueProject(actor,project.id,'render')).toMatchObject({status:'SCHEDULED',intent:'VIDEO'});
    const job=await db.productionJob.findFirstOrThrow({where:{projectId:project.id,status:'QUEUED'}});
    await expect(runProduction(job.id)).rejects.toMatchObject({code:'PROVIDER_REJECTED'});
    expect(script).not.toHaveBeenCalled();expect(image).toHaveBeenCalledTimes(1);expect(network).not.toHaveBeenCalled();
    for(const cost of [current,historical])expect(await db.costUsage.findUniqueOrThrow({where:{id:cost.id}})).toMatchObject({idempotencyKey:cost.idempotencyKey,status:'UNKNOWN',amountCents:5});
  });
  it('still requires consent when the script itself must be generated again',async()=>{
    const {project}=await fixture(false);
    await expect(queueProject(actor,project.id,'retry')).rejects.toMatchObject({code:'COST_CONFIRMATION'});
    expect(await db.productionJob.count({where:{projectId:project.id,status:'QUEUED'}})).toBe(0);
  });
  it('requires consent for unknown media calls and only releases the pending step after approval',async()=>{
    const {project,current,historical}=await fixture();
    const media=await db.costUsage.create({data:{projectId:project.id,workspaceId:actor.workspaceId,providerId,category:'TTS',status:'RESERVED',amountCents:3,idempotencyKey:project.id+':r1:s1:audio:'+providerId}});
    await expect(queueProject(actor,project.id,'render')).rejects.toMatchObject({code:'COST_CONFIRMATION'});
    expect(await queueProject(actor,project.id,'render',true)).toMatchObject({status:'SCHEDULED',intent:'VIDEO'});
    const reviewed=await db.costUsage.findUniqueOrThrow({where:{id:media.id}});
    expect(reviewed).toMatchObject({status:'UNKNOWN',amountCents:3});expect(reviewed.idempotencyKey).toContain(':reviewed:');
    for(const cost of [current,historical])expect((await db.costUsage.findUniqueOrThrow({where:{id:cost.id}})).idempotencyKey).toBe(cost.idempotencyKey);
    expect((await db.costUsage.aggregate({where:{projectId:project.id},_sum:{amountCents:true}}))._sum.amountCents).toBe(13);
  });
  it('does not treat a corrupt saved script as a reusable checkpoint',async()=>{
    const {project}=await fixture();
    await db.script.update({where:{projectId:project.id},data:{data:{invalid:true}}});
    await expect(queueProject(actor,project.id,'render')).rejects.toMatchObject({code:'COST_CONFIRMATION'});
  });
});
