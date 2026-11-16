import {test,expect,APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {PrismaClient,Prisma} from '@prisma/client';
import {loadEnvFile} from 'node:process';
import {fixtureScript} from '../fixtures';
loadEnvFile('.env');const db=new PrismaClient(),users:string[]=[],workspaces:string[]=[];
const headers={Origin:'http://localhost:3000'};
async function register(request:APIRequestContext,name:string){const email='e2e-collab-'+randomUUID()+'@test.invalid',password='Test-password-'+randomUUID();const response=await request.post('/api/auth/register',{headers,data:{email,password,name}});expect(response.ok()).toBeTruthy();const actor=await (await request.get('/api/auth/me')).json();users.push(actor.userId);workspaces.push(actor.workspaceId);return {email,password,actor};}
test.afterAll(async()=>{for(const id of workspaces)await db.workspace.delete({where:{id}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();});
test('owner invites; signed-out recipient logs in, joins, changes workspace; owner changes role and removes access',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const owner=await register(page.request,'TEST Chủ studio');
  const recipientContext=await browser.newContext({baseURL:'http://localhost:3000'}),recipient=await recipientContext.newPage();
  try{
    const user=await register(recipient.request,'TEST Người nhận');await recipient.request.post('/api/auth/logout',{headers});
    await page.goto('/?view=settings');await expect(page.getByRole('heading',{name:'Thành viên workspace',exact:true})).toBeVisible();
    await page.getByLabel('Email người nhận',{exact:true}).fill(user.email);await page.getByLabel('Vai trò mời',{exact:true}).selectOption('REVIEWER');await page.getByRole('button',{name:'Tạo liên kết mời',exact:true}).click();
    await expect(page.getByLabel('Liên kết mời mới',{exact:true})).toHaveValue(/#invite=/);const invite=await page.getByLabel('Liên kết mời mới',{exact:true}).inputValue();
    await recipient.goto(invite);await recipient.getByLabel('Email',{exact:true}).fill(user.email);await recipient.getByLabel('Mật khẩu',{exact:true}).fill(user.password);await recipient.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await expect(recipient.getByLabel('Mã hoặc liên kết lời mời',{exact:true})).not.toHaveValue('');await recipient.getByRole('button',{name:'Tham gia workspace',exact:true}).click();
    await expect(recipient.getByLabel('Chuyển workspace',{exact:true})).toHaveValue(owner.actor.workspaceId);expect((await (await recipient.request.get('/api/auth/me')).json()).role).toBe('REVIEWER');
    await expect(recipient.getByRole('button',{name:'Tạo liên kết mời',exact:true})).toHaveCount(0);expect((await recipient.request.post('/api/invitations',{headers,data:{email:'denied@test.invalid'}})).status()).toBe(403);
    await page.getByRole('button',{name:'Làm mới thành viên',exact:true}).click();await expect(page.getByLabel('Vai trò của '+user.email,{exact:true})).toHaveValue('REVIEWER');
    await page.screenshot({path:'artifacts/ui-members.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/ui-members-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1440,height:1050});
    await page.getByLabel('Vai trò của '+user.email,{exact:true}).selectOption('EDITOR');await expect(page.getByLabel('Vai trò của '+user.email,{exact:true})).toHaveValue('EDITOR');expect((await (await recipient.request.get('/api/auth/me')).json()).role).toBe('EDITOR');
    await recipient.getByLabel('Chuyển workspace',{exact:true}).selectOption(user.actor.workspaceId);await expect(recipient.getByRole('button',{name:'Tạo liên kết mời',exact:true})).toBeVisible();await recipient.getByLabel('Chuyển workspace',{exact:true}).selectOption(owner.actor.workspaceId);await expect(recipient.getByRole('button',{name:'Tạo liên kết mời',exact:true})).toHaveCount(0);
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Xóa thành viên '+user.email,exact:true}).click();await expect(page.getByLabel('Vai trò của '+user.email,{exact:true})).toHaveCount(0);expect((await recipient.request.get('/api/auth/me')).status()).toBe(401);
    await page.getByLabel('Vai trò của '+owner.email,{exact:true}).selectOption('VIEWER');await expect(page.getByRole('alert').filter({hasText:'ít nhất một chủ sở hữu'})).toBeVisible();expect(errors).toEqual([]);
  }finally{await recipientContext.close();}
});
test('script assistant queues a request and applies an explicit fixture proposal through the real API',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await register(page.request,'TEST Biên tập');
  const channel=await (await page.request.post('/api/channels',{headers,data:{name:'TEST Kênh biên tập',topic:'Kiểm thử'}})).json();
  const project=await (await page.request.post('/api/videos',{headers:{...headers,'Idempotency-Key':randomUUID()},data:{channelId:channel.id,topic:'TEST edit '+randomUUID(),targetDuration:10,intent:'SCRIPT'}})).json();
  await db.productionJob.updateMany({where:{projectId:project.id},data:{status:'COMPLETED'}});await db.videoProject.update({where:{id:project.id},data:{status:'SCRIPT_READY'}});
  const save=await page.request.put('/api/scripts/'+project.id,{headers,data:{script:fixtureScript,expectedRevision:0}});expect(save.ok()).toBeTruthy();
  await page.goto('/?view=scripts');await page.getByRole('button',{name:/Video kiểm thử kỹ thuật/}).click();await expect(page.getByRole('heading',{name:'Trợ lý biên tập AI'})).toBeVisible();
  await page.getByRole('button',{name:'Khóa scene',exact:true}).first().click();await expect(page.getByRole('button',{name:'Mở khóa scene',exact:true})).toHaveCount(1);await page.getByLabel('Thao tác AI',{exact:true}).selectOption('HOOKS');await expect(page.getByRole('button',{name:'Tạo đề xuất AI',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Mở khóa scene',exact:true}).click();await expect(page.getByRole('button',{name:'Khóa scene',exact:true})).toHaveCount(2);
  await page.getByLabel('Thao tác AI',{exact:true}).selectOption('SCENE');await page.getByLabel('Scene cần viết lại',{exact:true}).selectOption('1');await page.getByLabel('Yêu cầu biên tập',{exact:true}).fill('TEST: giải thích dễ hiểu hơn');await page.getByRole('button',{name:'Tạo đề xuất AI',exact:true}).click();await expect(page.getByText('Đang xếp hàng',{exact:true})).toBeVisible();
  const job=await db.scriptEditJob.findFirstOrThrow({where:{projectId:project.id}}),candidate=structuredClone(fixtureScript);candidate.scenes[0].narration_text='Đề xuất fixture kiểm thử giao diện, không phải kết quả AI thật.';
  await db.scriptEditJob.update({where:{id:job.id},data:{status:'READY',result:{proposals:[{label:'TEST phương án biên tập',script:candidate}]} as unknown as Prisma.InputJsonValue}});
  await expect(page.getByText('Sẵn sàng xem trước',{exact:true})).toBeVisible();await page.getByText('TEST phương án biên tập · 10s',{exact:true}).click();await page.getByRole('region',{name:'Trợ lý biên tập AI'}).screenshot({path:'artifacts/ui-script-assistant.png'});
  await page.getByRole('button',{name:'Áp dụng phương án 1',exact:true}).click();await expect(page.getByText('Đã áp dụng',{exact:true})).toBeVisible();await expect(page.getByLabel('Lời thoại',{exact:true}).first()).toHaveValue(candidate.scenes[0].narration_text);expect((await db.videoProject.findUniqueOrThrow({where:{id:project.id}})).revision).toBe(2);
  await page.getByLabel('Lời thoại',{exact:true}).first().fill('Chỉnh sửa chưa lưu');await expect(page.getByRole('button',{name:'Tạo đề xuất AI',exact:true})).toBeDisabled();await expect(page.getByText('Lưu các chỉnh sửa hiện tại trước khi yêu cầu hoặc áp dụng AI.',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
