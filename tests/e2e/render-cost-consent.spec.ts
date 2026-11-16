import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {PrismaClient} from '@prisma/client';
import {fixtureScript} from '../fixtures';

loadEnvFile('.env');
const db=new PrismaClient();
let userId='',workspaceId='',projectId='';
test.beforeEach(async({page})=>{
  const headers={Origin:'http://localhost:3000'};
  const registered=await page.request.post('/api/auth/register',{headers,data:{name:'TEST render consent',email:randomUUID()+'@test.invalid',password:randomUUID()+randomUUID()}});
  expect(registered.status()).toBe(200);
  const actor=await (await page.request.get('/api/auth/me')).json();userId=actor.userId;workspaceId=actor.workspaceId;
  const channel=await (await page.request.post('/api/channels',{headers,data:{name:'TEST render consent',topic:'Test'}})).json();
  const project=await (await page.request.post('/api/videos',{headers:{...headers,'Idempotency-Key':randomUUID()},data:{channelId:channel.id,topic:randomUUID(),targetDuration:10,intent:'SCRIPT'}})).json();
  projectId=project.id;
  await db.productionJob.updateMany({where:{projectId},data:{status:'FAILED'}});
  await db.videoProject.update({where:{id:projectId},data:{status:'FAILED'}});
  expect((await page.request.put('/api/scripts/'+projectId,{headers,data:{script:fixtureScript,expectedRevision:0}})).ok()).toBe(true);
  await db.costUsage.create({data:{workspaceId,projectId,category:'LLM',amountCents:5,status:'UNKNOWN',providerId:'test',idempotencyKey:projectId+':script:test'}});
});
test.afterEach(async()=>{if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});if(userId)await db.user.delete({where:{id:userId}});userId='';workspaceId='';projectId='';});
test.afterAll(async()=>{await db.$disconnect();});

test('saved-script rendering is not blocked by an old script charge',async({page})=>{
  let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
  await page.goto('/?view=scripts');await page.getByRole('button',{name:/Video kiểm thử kỹ thuật/}).click();
  const response=page.waitForResponse(value=>value.url().endsWith('/api/videos/'+projectId+'/render'));
  await page.getByRole('button',{name:'Dựng phiên bản đã lưu',exact:true}).click();
  expect((await response).status()).toBe(202);
  await expect(page.getByText('Đã xếp lịch dựng video',{exact:true})).toBeVisible();
  expect(dialogs).toBe(0);
  expect((await db.costUsage.findFirstOrThrow({where:{projectId,category:'LLM'}})).status).toBe('UNKNOWN');
  expect(await db.productionJob.count({where:{projectId,status:'QUEUED'}})).toBe(1);
});

test('rendering requests cost consent for an unresolved media step and respects cancel',async({page})=>{
  await db.costUsage.create({data:{workspaceId,projectId,category:'TTS',amountCents:3,status:'UNKNOWN',providerId:'test',idempotencyKey:projectId+':r1:s1:audio:test'}});
  const requests:boolean[]=[];page.on('request',request=>{if(request.url().endsWith('/api/videos/'+projectId+'/render'))requests.push(request.postDataJSON().allowAdditionalCost);});
  await page.goto('/?view=scripts');await page.getByRole('button',{name:/Video kiểm thử kỹ thuật/}).click();
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('chi phí bổ sung');await dialog.dismiss();});
  await page.getByRole('button',{name:'Dựng phiên bản đã lưu',exact:true}).click();
  await expect(page.getByText('Bước cần chạy lại có lời gọi AI chưa rõ kết quả. Cần đồng ý chi phí bổ sung trước khi tiếp tục.',{exact:true})).toBeVisible();
  expect(await db.productionJob.count({where:{projectId,status:'QUEUED'}})).toBe(0);
  page.once('dialog',async dialog=>{await dialog.accept();});
  await page.getByRole('button',{name:'Dựng phiên bản đã lưu',exact:true}).click();
  await expect(page.getByText('Đã xếp lịch dựng video',{exact:true})).toBeVisible();
  expect(requests).toEqual([false,false,true]);
  expect(await db.productionJob.count({where:{projectId,status:'QUEUED'}})).toBe(1);
  const costs=await db.costUsage.findMany({where:{projectId}});
  expect(costs.reduce((sum,cost)=>sum+cost.amountCents,0)).toBe(8);
  expect(costs.every(cost=>cost.status==='UNKNOWN')).toBe(true);
});
