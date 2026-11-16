import {z} from 'zod';
import {channelSchema,providerSchema,videoInputSchema,scheduleSchema,rawScriptSchema} from '../domain/schemas';
import {scriptEditRequestSchema} from '../domain/script-edits';
import {invitationSchema} from './members';
import {oauthAppInput} from './oauth-apps';
const operation=(summary:string)=>({summary,responses:{'200':{description:'Thành công'},'401':{description:'Chưa đăng nhập'},'403':{description:'Không đủ quyền'},'422':{description:'Validation error'}}});
export const openapi={openapi:'3.1.0',info:{title:'AI Video Automation Studio',version:'0.1.0'},servers:[{url:'/api'}],security:[{session:[]}],components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:'studio_session'}}},paths:{
  '/auth/register':{post:operation('Tạo tài khoản và workspace')},'/auth/login':{post:operation('Đăng nhập')},'/auth/logout':{post:operation('Đăng xuất')},
  '/bootstrap':{get:operation('Dashboard và dữ liệu workspace')},'/channels':{get:operation('Danh sách kênh'),post:operation('Tạo kênh')},
  '/providers':{post:operation('Thêm provider, mã hóa API key')},'/videos':{get:operation('Video phân trang, filter status'),post:{...operation('Tạo job sản xuất nền'),parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string'}}]}},
  '/videos/{id}':{get:operation('Chi tiết video, script, jobs và QA'),delete:operation('OWNER/EDITOR xóa mềm kịch bản đã hủy; trạng thái khác trả 409')},'/videos/{id}/render':{post:operation('Dựng từ script hiện tại')},
  '/videos/{id}/retry':{post:operation('Thử lại từ checkpoint')},'/videos/{id}/approve':{post:operation('Duyệt revision hiện tại')},
  '/videos/{id}/cancel':{post:operation('Hủy job nội bộ')},'/videos/{id}/download':{get:operation('MP4 riêng tư, hỗ trợ Range')},
  '/scripts/{id}':{get:operation('Kịch bản và phiên bản'),put:operation('Lưu phiên bản với optimistic concurrency')},
  '/schedules':{post:operation('Lịch cron/timezone hoặc một lần')},'/publishing':{post:operation('Consent cụ thể và tạo publishing request')},
  '/system/health':{get:{...operation('DB/Redis/storage readiness'),security:[]}}
}};
const specification=openapi as unknown as {paths:Record<string,Record<string,unknown>>;components:Record<string,unknown>};
specification.paths['/scripts/{id}/edits']={get:operation('Danh sách đề xuất AI'),post:{...operation('Yêu cầu AI biên tập nền'),parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string'}}]},patch:operation('Áp dụng proposal theo jobId và chỉ số proposal'),delete:operation('Hủy hoặc bỏ proposal theo jobId')};
specification.paths['/members']={get:operation('Thành viên workspace và lời mời, không trả token')};
specification.paths['/members/{id}']={patch:operation('OWNER đổi role theo userId'),delete:operation('OWNER xóa thành viên và thu hồi session')};
specification.paths['/invitations']={post:operation('OWNER tạo liên kết mời dùng một lần, 7 ngày')};
specification.paths['/invitations/{id}']={delete:operation('OWNER thu hồi lời mời')};
specification.paths['/invitations/accept']={post:operation('Nhận lời mời bằng token, đúng email tài khoản')};
for(const [path,item] of Object.entries(specification.paths))if(path.includes('{id}'))item.parameters=[{name:'id',in:'path',required:true,schema:{type:'string'}}];
specification.paths['/ideas']={get:operation('Ý tưởng của workspace'),post:operation('Tạo background job khám phá ý tưởng')};
const inputSchemas:Record<string,z.ZodType>={Channel:channelSchema,Provider:providerSchema,Video:videoInputSchema,Schedule:scheduleSchema,Script:rawScriptSchema,ScriptEdit:scriptEditRequestSchema,Invitation:invitationSchema};
specification.components.schemas=Object.fromEntries(Object.entries(inputSchemas).map(([name,schema])=>[name,z.toJSONSchema(schema,{io:'input',target:'draft-7'})]));
for(const [path,name] of [['/channels','Channel'],['/providers','Provider'],['/videos','Video'],['/schedules','Schedule'],['/scripts/{id}/edits','ScriptEdit'],['/invitations','Invitation']]){
  const post=specification.paths[path].post as Record<string,unknown>;
  post.requestBody={required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/'+name}}}};
}


// Advanced routes use the same Origin, session and workspace checks, except signed webhook.
for(const [path,methods] of Object.entries({
 '/auth/mfa':['post'],'/auth/reset-request':['post'],'/auth/reset':['post'],
 '/security':['get'],'/security/setup':['post'],'/security/enable':['post'],'/security/disable':['post'],
 '/media':['get','post'],'/media/{id}':['get','delete'],'/production-settings/{id}':['get','put'],
 '/brand-kits':['get','post'],'/template-versions':['get','post'],'/campaigns':['get','post'],'/campaigns/{id}':['patch'],'/campaigns/{id}/schedule':['post'],
 '/calendar':['get'],'/calendar/{id}':['patch'],'/bulk-approval':['post'],'/analytics':['get'],'/analytics/sync':['post'],
 '/experiments':['get','post'],'/experiments/{id}':['patch'],'/recommendations':['get','post'],
 '/lifecycle':['get','patch'],'/lifecycle/workspace/archive':['post'],'/videos/{id}/estimate':['get'],'/videos/{id}/variants':['post'],
 '/publishing/{id}/cancel':['post'],'/publishing/{id}/reconcile':['post'],'/publishing/{id}/thumbnail':['post'],
 '/providers/{id}':['patch','delete'],'/channels/{id}':['patch','delete'],'/schedules/{id}':['patch'],'/schedules/{id}/run':['post'],
 '/integrations/{platform}/app':['get','put','delete'],'/integrations/{platform}/connect':['post'],'/integrations/{platform}/callback':['get'],'/integrations/{platform}/disconnect':['post'],'/integrations/{platform}/creator':['get'],
 '/webhooks/tiktok/{appId}':['post']
})){const item:Record<string,unknown>={};for(const method of methods)item[method]=operation(method.toUpperCase()+' '+path);const parameters=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string'}}));if(parameters.length)item.parameters=parameters;specification.paths[path]=item;}
for(const path of ['/auth/login','/auth/register','/auth/mfa','/auth/reset-request','/auth/reset','/webhooks/tiktok/{appId}'])for(const [method,op] of Object.entries(specification.paths[path]))if(method!=='parameters')(op as Record<string,unknown>).security=[];

(specification.components.schemas as Record<string,unknown>).WorkspaceOAuthAppInput=z.toJSONSchema(oauthAppInput,{io:"input",target:"draft-7"});
(specification.paths["/integrations/{platform}/app"].put as Record<string,unknown>).requestBody={required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/WorkspaceOAuthAppInput"}}}};
