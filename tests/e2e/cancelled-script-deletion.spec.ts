import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {PrismaClient} from '@prisma/client';
import {fixtureScript} from '../fixtures';

loadEnvFile('.env');
const db=new PrismaClient(),headers={Origin:'http://localhost:3000'};
let userId='',workspaceId='',projectId='',activeId='';

test.beforeEach(async({page})=>{
  const registered=await page.request.post('/api/auth/register',{headers,data:{name:'TEST script deletion',email:randomUUID()+'@test.invalid',password:randomUUID()+randomUUID()}});
  expect(registered.status()).toBe(200);
  const actor=await (await page.request.get('/api/auth/me')).json();
  userId=actor.userId;workspaceId=actor.workspaceId;
  const channel=await db.contentChannel.create({data:{workspaceId,name:'TEST script deletion',topic:'Test'}});
  const project=await db.videoProject.create({data:{workspaceId,channelId:channel.id,title:'Kịch bản đã hủy để kiểm thử',topic:'Test deletion',topicHash:randomUUID(),intent:'SCRIPT',status:'CANCELLED',revision:1}});
  projectId=project.id;
  activeId=(await db.videoProject.create({data:{workspaceId,channelId:channel.id,title:'Kịch bản cần giữ',topic:'Test active',topicHash:randomUUID(),intent:'SCRIPT',status:'SCRIPT_READY'}})).id;
  await db.script.create({data:{workspaceId,projectId,currentVersion:1,data:fixtureScript}});
  await db.productionJob.create({data:{workspaceId,projectId,status:'CANCELLED',idempotencyKey:randomUUID()}});
  await db.costUsage.create({data:{workspaceId,projectId,category:'LLM',amountCents:5,status:'UNKNOWN',providerId:'test',idempotencyKey:randomUUID()}});
});

test.afterEach(async()=>{
  if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});
  if(userId)await db.user.delete({where:{id:userId}});
  userId='';workspaceId='';projectId='';activeId='';
});
test.afterAll(async()=>{await db.$disconnect();});

test('confirming deletion removes a cancelled script from all three views and keeps cost history',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let deleteRequests=0;
  page.on('request',request=>{if(request.method()==='DELETE'&&request.url().endsWith('/api/videos/'+projectId))deleteRequests++;});
  for(const view of ['scripts','storyboard','production']){
    await page.goto('/?view='+view);
    await expect(page.getByRole('heading',{name:'Kịch bản đã hủy để kiểm thử',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:/Kịch bản đã hủy để kiểm thử/}).click();
  const remove=page.getByRole('button',{name:'Xóa kịch bản',exact:true});
  await expect(remove).toBeVisible();
  await page.screenshot({path:'artifacts/cancelled-script-delete-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(remove).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/cancelled-script-delete-mobile.png',fullPage:true});
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('Kịch bản đã hủy để kiểm thử');await dialog.dismiss();});
  await remove.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(deleteRequests).toBe(0);
  expect((await db.videoProject.findUniqueOrThrow({where:{id:projectId}})).deletedAt).toBeNull();
  page.once('dialog',async dialog=>{await dialog.accept();});
  await remove.click();
  await expect(page.getByText('Đã xóa kịch bản đã hủy',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(deleteRequests).toBe(1);
  for(const view of ['scripts','storyboard','production']){
    await page.goto('/?view='+view);
    await expect(page.getByRole('heading',{name:'Kịch bản cần giữ',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Kịch bản đã hủy để kiểm thử',exact:true})).toHaveCount(0);
  }
  expect((await page.request.get('/api/videos/'+projectId)).status()).toBe(404);
  expect((await page.request.delete('/api/videos/'+projectId,{headers})).status()).toBe(404);
  expect((await page.request.put('/api/scripts/'+projectId,{headers,data:{script:fixtureScript,expectedRevision:1}})).status()).toBe(404);
  expect((await page.request.post('/api/videos/'+projectId+'/render',{headers,data:{}})).status()).toBe(404);
  const bootstrap=await (await page.request.get('/api/bootstrap')).json();
  expect(bootstrap.jobs.some((job:{projectId:string})=>job.projectId===projectId)).toBe(false);
  expect(bootstrap.totalCostCents).toBe(5);
  expect((await db.videoProject.findUniqueOrThrow({where:{id:projectId}})).deletedAt).not.toBeNull();
  expect(await db.script.count({where:{projectId}})).toBe(1);
  expect(await db.auditLog.count({where:{workspaceId,entityId:projectId,action:'video.delete'}})).toBe(1);
  expect(errors).toEqual([]);
});

test('state, CSRF, membership and tenant checks protect scripts from unauthorized deletion',async({page,request})=>{
  expect((await request.delete('/api/videos/'+projectId,{headers})).status()).toBe(401);
  expect((await page.request.delete('/api/videos/'+projectId)).status()).toBe(403);
  const active=await page.request.delete('/api/videos/'+activeId,{headers});
  expect(active.status()).toBe(409);
  expect((await active.json()).error.code).toBe('STATE');
  await page.goto('/?view=scripts');
  await page.getByRole('button',{name:/Kịch bản cần giữ/}).click();
  await expect(page.getByRole('button',{name:'Xóa kịch bản',exact:true})).toHaveCount(0);
  for(const role of ['VIEWER','REVIEWER'] as const){
    await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId}},data:{role}});
    expect((await page.request.delete('/api/videos/'+projectId,{headers})).status()).toBe(403);
    await page.goto('/?view=scripts');
    await page.getByRole('button',{name:/Kịch bản đã hủy để kiểm thử/}).click();
    await expect(page.getByRole('button',{name:'Xóa kịch bản',exact:true})).toHaveCount(0);
  }
  await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId}},data:{role:'EDITOR'}});
  const other=await db.workspace.create({data:{name:'TEST other deletion tenant'}});
  try{
    const channel=await db.contentChannel.create({data:{workspaceId:other.id,name:'TEST other',topic:'Test'}});
    const foreign=await db.videoProject.create({data:{workspaceId:other.id,channelId:channel.id,title:'Private',topic:'Private',topicHash:randomUUID(),status:'CANCELLED'}});
    expect((await page.request.delete('/api/videos/'+foreign.id,{headers})).status()).toBe(404);
    expect((await db.videoProject.findUniqueOrThrow({where:{id:foreign.id}})).deletedAt).toBeNull();
  }finally{await db.workspace.delete({where:{id:other.id}});}
  expect((await page.request.delete('/api/videos/'+projectId,{headers})).status()).toBe(200);
  expect((await db.videoProject.findUniqueOrThrow({where:{id:activeId}})).deletedAt).toBeNull();
});

test('a stale delete action reports the conflict and keeps the detail open',async({page})=>{
  await page.goto('/?view=scripts');
  await page.getByRole('button',{name:/Kịch bản đã hủy để kiểm thử/}).click();
  await expect(page.getByRole('button',{name:'Xóa kịch bản',exact:true})).toBeVisible();
  await db.videoProject.update({where:{id:projectId},data:{status:'SCRIPT_READY'}});
  page.once('dialog',async dialog=>{await dialog.accept();});
  await page.getByRole('button',{name:'Xóa kịch bản',exact:true}).click();
  await expect(page.getByText('Chỉ có thể xóa kịch bản đã hủy.',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await db.videoProject.findUniqueOrThrow({where:{id:projectId}})).deletedAt).toBeNull();
});

test('concurrent deletes record one audit entry and stop remaining internal jobs',async({page})=>{
  const job=await db.productionJob.create({data:{workspaceId,projectId,status:'RUNNING',workerId:'test-deletion',leaseUntil:new Date(Date.now()+3600000),idempotencyKey:randomUUID()}});
  const edit=await db.scriptEditJob.create({data:{workspaceId,projectId,actorId:userId,baseRevision:1,request:{},status:'READY',idempotencyKey:randomUUID()}});
  const responses=await Promise.all([
    page.request.delete('/api/videos/'+projectId,{headers}),
    page.request.delete('/api/videos/'+projectId,{headers})
  ]);
  expect(responses.map(response=>response.status()).sort()).toEqual([200,404]);
  expect(await db.productionJob.findUniqueOrThrow({where:{id:job.id}})).toMatchObject({status:'CANCELLED',leaseUntil:null});
  expect(await db.scriptEditJob.findUniqueOrThrow({where:{id:edit.id}})).toMatchObject({status:'DISMISSED',leaseUntil:null});
  expect(await db.auditLog.count({where:{workspaceId,entityId:projectId,action:'video.delete'}})).toBe(1);
});
