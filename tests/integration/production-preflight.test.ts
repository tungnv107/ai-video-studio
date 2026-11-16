import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/server/db';
import {encrypt,hashPassword} from '../../src/server/crypto';
import {createProject} from '../../src/server/projects';
import {runProduction} from '../../src/worker/pipeline';
import {productionPreflight} from '../../src/server/production-preflight';
import {productionSettings} from '../../src/domain/production-settings';
import {OpenAIAdapter} from '../../src/providers/openai';
import {closeQueues} from '../../src/server/queue';
import type {Actor} from '../../src/server/auth';
import {fixtureScript} from '../fixtures';
let actor:Actor,channelId:string;
beforeAll(async()=>{
  const user=await db.user.create({data:{name:'TEST preflight',email:randomUUID()+'@test.invalid',passwordHash:hashPassword('test-password-12345'),memberships:{create:{role:'OWNER',workspace:{create:{name:'TEST preflight'}}}}},include:{memberships:true}});
  actor={userId:user.id,workspaceId:user.memberships[0].workspaceId,role:'OWNER',name:user.name,email:user.email};
  channelId=(await db.contentChannel.create({data:{workspaceId:actor.workspaceId,name:'TEST preflight',topic:'Test'}})).id;
  await db.aIProvider.create({data:{workspaceId:actor.workspaceId,name:'TEST LLM only',kind:'OPENAI_COMPATIBLE',encryptedKey:encrypt('never-live')}});
});
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{await db.workspace.delete({where:{id:actor.workspaceId}});await db.user.delete({where:{id:actor.userId}});await closeQueues();await db.$disconnect();});
it('fails missing video capability before consuming a script request or reserving any cost',async()=>{
  const p=await createProject(actor,{channelId,topic:randomUUID(),intent:'VIDEO',targetDuration:10},randomUUID()),job=await db.productionJob.findFirstOrThrow({where:{projectId:p.id}});
  const script=vi.spyOn(OpenAIAdapter.prototype,'script');
  await expect(runProduction(job.id)).rejects.toMatchObject({code:'PROVIDER_MISSING'});
  expect(script).not.toHaveBeenCalled();expect(await db.costUsage.count({where:{projectId:p.id}})).toBe(0);
});
it('allows rendering saved assets without requiring unused AI providers',async()=>{
  const p=await createProject(actor,{channelId,topic:randomUUID(),intent:'VIDEO',targetDuration:10},randomUUID());
  await db.script.create({data:{projectId:p.id,workspaceId:actor.workspaceId,currentVersion:1,data:fixtureScript}});
  await db.videoProject.update({where:{id:p.id},data:{revision:1}});
  await db.generatedAsset.createMany({data:fixtureScript.scenes.flatMap(scene=>['IMAGE','AUDIO'].map(kind=>({projectId:p.id,workspaceId:actor.workspaceId,revision:1,sceneOrder:scene.scene_order,kind,storageKey:'test/'+randomUUID(),mimeType:kind==='IMAGE'?'image/png':'audio/mpeg',bytes:100})))});
  const project=await db.videoProject.findUniqueOrThrow({where:{id:p.id},include:{script:true,channel:true}});
  await expect(productionPreflight(project)).resolves.toBeUndefined();
  project.productionConfig=productionSettings({visualMode:'FOOTAGE'});
  await expect(productionPreflight(project)).rejects.toMatchObject({code:'FOOTAGE_REQUIRED'});
});
