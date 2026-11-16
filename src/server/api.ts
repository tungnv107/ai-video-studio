import {nextResearchRun,researchTime} from './schedule-timing';
import { NextRequest,NextResponse } from 'next/server';
import { z,ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db,adminDb,withTenant } from './db';
import { config } from './config';
import { audit,authorize,checkOrigin,createSession,rateLimit,requireActor } from './auth';
import { hashPassword,hashToken,verifyPassword,encrypt } from './crypto';
import { AppError,invariant } from '../domain/errors';
import { channelSchema,providerSchema,scheduleSchema } from '../domain/schemas';
import { nextRun,canApprove } from '../domain/workflow';
import { createProject,projectFor,saveScript,queueProject,setSceneLock } from './projects';
import { validateProviderUrl } from '../providers/openai';
import { readAsset,downloadUrl,storageHealth } from './storage';
import { redis } from './queue';
import { templates } from './templates';
import { log } from './logger';
import { socialRoute } from './social';
import {requestScriptEdit,listScriptEdits,applyScriptEdit,dismissScriptEdit} from './script-edits';
import {workspaceMembers,inviteMember,revokeInvitation,acceptInvitation,changeMember,roleSchema} from './members';
import {newChallenge,completeMfa,requestPasswordReset,resetPassword,securityAction} from './account-security';
import {tiktokWebhook} from './webhooks';
import {oauthCapabilities} from './oauth-apps';
import {analyticsRoute} from './analytics';
import {advancedRoute} from './advanced';
import {createVariant} from './variants';
import {estimateProject} from './estimates';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function body(request:Request){invariant(Number(request.headers.get('content-length')||0)<=1500000,'TOO_LARGE','Yêu cầu quá lớn.',413);const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw new AppError('TOO_LARGE','Yêu cầu quá lớn.',413);}chunks.push(value);}const raw=Buffer.concat(chunks).toString('utf8');try{return raw?JSON.parse(raw):{};}catch{throw new AppError('JSON','JSON không hợp lệ.');}}

export async function handle(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;const [resource,id,action]=path;const method=request.method;
  try{
    if(resource==='system'&&id==='health'){
      try{await db.$queryRaw`SELECT 1`;await redis().ping();await storageHealth();return reply({ok:true});}catch{return reply({ok:false},503);}
    }
    if(resource==='webhooks'&&id==='tiktok')return await tiktokWebhook(request,action);
    if(method!=='GET')checkOrigin(request);
    if(resource==='auth'){
      if(method==='POST'&&id==='reset-request')return reply(await requestPasswordReset(await body(request)));
      if(method==='POST'&&id==='reset')return reply(await resetPassword(await body(request)));
      if(method==='POST'&&id==='mfa'){const token=await completeMfa(await body(request)),response=reply({ok:true});response.cookies.set(config.cookieName,token,{httpOnly:true,sameSite:'lax',secure:config.appUrl.startsWith('https:'),path:'/',maxAge:config.sessionDays*86400});return response;}
      if(id==='login'||id==='register'){
        invariant(method==='POST','METHOD','Phương thức không hỗ trợ.',405);
        await rateLimit('auth-global',60,60);
        const data=z.object({email:z.string().email().max(250).transform(x=>x.trim().toLowerCase()),password:z.string().min(12).max(128),name:z.string().trim().min(1).max(100).optional()}).parse(await body(request));
        await rateLimit('auth:'+data.email,10,300);
        let user=await db.user.findUnique({where:{email:data.email},include:{memberships:{where:{workspace:{archivedAt:null}}}}});
        if(id==='register'){
          invariant(process.env.REGISTRATION_ENABLED!=='false','REGISTRATION_CLOSED','Đăng ký tài khoản hiện đã tắt.',403);
          invariant(!user,'ACCOUNT_EXISTS','Email đã được sử dụng.',409);
          invariant(data.name,'NAME','Cần nhập tên.');
          user=await db.user.create({data:{email:data.email,name:data.name,passwordHash:hashPassword(data.password),memberships:{create:{role:'OWNER',workspace:{create:{name:'Studio của '+data.name}}}}},include:{memberships:true}});
          for(const t of templates)await db.videoTemplate.create({data:{workspaceId:user.memberships[0].workspaceId,slug:t.slug,name:t.name,config:t}});
        }else invariant(user&&verifyPassword(data.password,user.passwordHash),'BAD_CREDENTIALS','Email hoặc mật khẩu không đúng.',401);
        invariant(user?.memberships.length,'WORKSPACE','Tài khoản không có workspace.',403);
        if(id==='login'&&user.totpSecret)return reply({mfaRequired:true,challenge:await newChallenge(user.id,'MFA',user.passwordHash)});
        const token=await createSession(user.id,user.memberships[0].workspaceId,user.passwordHash),response=reply({ok:true});
        response.cookies.set(config.cookieName,token,{httpOnly:true,sameSite:'lax',secure:config.appUrl.startsWith('https:'),path:'/',maxAge:config.sessionDays*86400});return response;
      }
      if(id==='logout'&&method==='POST'){const token=request.cookies.get(config.cookieName)?.value;if(token)await db.session.deleteMany({where:{tokenHash:hashToken(token)}});const response=reply({ok:true});response.cookies.delete(config.cookieName);return response;}
    }
    const actor=await requireActor();await rateLimit('api:'+actor.userId,240);
    const workspaceId=actor.workspaceId;
    if(resource==='security')return reply(await securityAction(actor,id,method,method==='GET'?{}:await body(request)));
    return await withTenant(workspaceId,async()=>{
    const analytics=await analyticsRoute(request,path,actor,()=>body(request));if(analytics)return analytics;
    const advanced=await advancedRoute(request,path,actor,()=>body(request));if(advanced)return advanced;
    if(resource==='bootstrap'&&method==='GET'){
      const [workspace,channels,videos,providers,schedules,jobs,notifications,costs,assets,logs,accounts,ideas,storedTemplates,publishing,counts]=await Promise.all([
        db.workspace.findUnique({where:{id:workspaceId},select:{id:true,name:true,timezone:true}}),
        db.contentChannel.findMany({where:{workspaceId,deletedAt:null},orderBy:{createdAt:'desc'}}),
        db.videoProject.findMany({where:{workspaceId,deletedAt:null,intent:{not:'IDEAS'}},orderBy:{createdAt:'desc'},take:100,include:{channel:{select:{name:true}}}}),
        db.aIProvider.findMany({where:{workspaceId},select:{id:true,name:true,kind:true,baseUrl:true,llmModel:true,imageModel:true,ttsModel:true,enabled:true,scriptCostCents:true,imageCostCents:true,ttsCostCents:true,concurrency:true,priority:true,requestsPerMinute:true,timeoutMs:true,settings:true}}),
        db.scheduleRule.findMany({where:{workspaceId},orderBy:{nextRunAt:'asc'}}),
        db.productionJob.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:50}),
        db.notification.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:30}),
        db.costUsage.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:100}),
        db.generatedAsset.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:100}),
        db.auditLog.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:50}),
        db.socialAccount.findMany({where:{workspaceId},select:{id:true,platform:true,displayName:true,remoteId:true,scopes:true,disconnectedAt:true}}),
        db.contentIdea.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:50}),
        db.videoTemplate.findMany({where:{workspaceId},orderBy:{name:'asc'}}),
        db.publishingJob.findMany({where:{project:{workspaceId}},select:{id:true,projectId:true,status:true,remoteId:true,error:true,scheduledAt:true,account:{select:{platform:true,displayName:true}},project:{select:{title:true}}},orderBy:{createdAt:'desc'},take:50}),
        db.videoProject.groupBy({by:['status'],where:{workspaceId,deletedAt:null,intent:{not:'IDEAS'}},_count:true})
      ]);
      const spent=await db.costUsage.aggregate({where:{workspaceId,status:{in:['COMPLETED','RESERVED','UNKNOWN']}},_sum:{amountCents:true}});
      const stored=await db.generatedAsset.aggregate({where:{workspaceId},_sum:{bytes:true}});
      return reply({actor,workspace,channels,videos,providers,schedules,jobs,notifications,costs,assets,logs,accounts,ideas,templates:storedTemplates,publishing,counts,totalCostCents:spent._sum.amountCents||0,storageBytes:stored._sum.bytes||0,capabilities:{publishing:process.env.PUBLISHING_ENABLED==='true',tiktokDirect:process.env.TIKTOK_DIRECT_POST_ENABLED==='true',...await oauthCapabilities(workspaceId)}});
    }
    if(resource==='auth'&&id==='me')return reply(actor);
    if(resource==='members'){
      if(method==='GET')return reply(await workspaceMembers(actor));
      if(id&&method==='PATCH')return reply(await changeMember(actor,id,z.object({role:roleSchema}).parse(await body(request)).role));
      if(id&&method==='DELETE')return reply(await changeMember(actor,id,null));
    }
    if(resource==='invitations'){
      if(method==='POST'&&id==='accept')return reply(await acceptInvitation(actor,await body(request)));
      if(method==='POST'&&!id)return reply(await inviteMember(actor,await body(request)),201);
      if(method==='DELETE'&&id)return reply(await revokeInvitation(actor,id));
    }
    if(resource==='ideas'){
      if(method==='GET')return reply(await db.contentIdea.findMany({where:{workspaceId},orderBy:{createdAt:'desc'},take:100}));
      if(method==='POST'){authorize(actor);const key=request.headers.get('idempotency-key');invariant(key&&key.length<=100,'IDEMPOTENCY_KEY','Cần Idempotency-Key.');const input=z.object({channelId:z.string(),topic:z.string().min(1).max(500)}).parse(await body(request));return reply(await createProject(actor,{...input,intent:'IDEAS'},key),202);}
    }
    if(resource==='workspaces'&&method==='GET')return reply(await adminDb.workspaceMember.findMany({where:{userId:actor.userId},include:{workspace:true}}));
    if(resource==='workspaces'&&id&&method==='POST'){
      const membership=await adminDb.workspaceMember.findFirst({where:{workspaceId:id,userId:actor.userId,workspace:{archivedAt:null}}});invariant(membership,'NOT_FOUND','Không tìm thấy workspace.',404);
      await adminDb.session.update({where:{tokenHash:hashToken(request.cookies.get(config.cookieName)!.value)},data:{workspaceId:id}});return reply({ok:true});
    }
    if(resource==='channels'){
      if(method==='GET')return reply(await db.contentChannel.findMany({where:{workspaceId,deletedAt:null}}));
      authorize(actor);
      if(method==='POST'){const channel=await db.contentChannel.create({data:{...channelSchema.parse(await body(request)),workspaceId}});await audit(actor,'channel.create',channel.id);return reply(channel,201);}
      const owned=await db.contentChannel.findFirst({where:{id,workspaceId,deletedAt:null}});invariant(owned,'NOT_FOUND','Không tìm thấy kênh.',404);
      if(method==='PATCH'){const result=await db.contentChannel.update({where:{id},data:channelSchema.partial().parse(await body(request))});await audit(actor,'channel.update',id);return reply(result);}
      if(method==='DELETE'){await db.contentChannel.update({where:{id},data:{deletedAt:new Date()}});await db.scheduleRule.updateMany({where:{channelId:id},data:{enabled:false}});await audit(actor,'channel.delete',id);return reply({ok:true});}
    }
    if(resource==='providers'){
      authorize(actor,['OWNER']);
      if(method==='POST'){
        const {apiKey,...data}=providerSchema.parse(await body(request));validateProviderUrl(data.baseUrl);
        const provider=await db.aIProvider.create({data:{...data,workspaceId,encryptedKey:encrypt(apiKey)}});
        await audit(actor,'provider.create',provider.id);return reply({id:provider.id,name:provider.name},201);
      }
      invariant(await db.aIProvider.findFirst({where:{id,workspaceId}}),'NOT_FOUND','Không tìm thấy provider.',404);
      if(method==='PATCH'){const {apiKey,...data}=providerSchema.omit({apiKey:true}).partial().extend({enabled:z.boolean().optional(),apiKey:z.string().min(1).max(500).optional()}).parse(await body(request));if(data.baseUrl)validateProviderUrl(data.baseUrl);await db.aIProvider.update({where:{id},data:{...data,...(apiKey?{encryptedKey:encrypt(apiKey)}:{})}});await audit(actor,'provider.update',id);return reply({ok:true});}
      if(method==='DELETE'){await db.aIProvider.delete({where:{id}});await audit(actor,'provider.delete',id);return reply({ok:true});}
    }
    if(resource==='videos'){
      if(!id&&method==='GET'){
        const page=Math.max(1,Number(request.nextUrl.searchParams.get('page')||1)),limit=24;
        invariant(Number.isInteger(page)&&page<100000,'PAGE','Trang không hợp lệ.');
        const status=request.nextUrl.searchParams.get('status'),where:Prisma.VideoProjectWhereInput={workspaceId,deletedAt:null};
        if(status)where.status=z.nativeEnum((await import('@prisma/client')).VideoStatus).parse(status);
        return reply({items:await db.videoProject.findMany({where,skip:(page-1)*limit,take:limit,orderBy:{createdAt:'desc'}}),total:await db.videoProject.count({where}),page,limit});
      }
      if(!id&&method==='POST'){authorize(actor);const key=request.headers.get('idempotency-key');invariant(key&&key.length<=100,'IDEMPOTENCY_KEY','Cần Idempotency-Key (tối đa 100 ký tự).');return reply(await createProject(actor,await body(request),key),202);}
      const project=await projectFor(workspaceId,id);
      if(action==='estimate'&&method==='GET')return reply(await estimateProject(workspaceId,id));
      if(action==='variants'&&method==='POST'){authorize(actor);const key=request.headers.get('idempotency-key');invariant(key&&key.length<=100,'IDEMPOTENCY_KEY','Cần Idempotency-Key.');return reply(await createVariant(actor,id,await body(request),key),202);}
      if(!action&&method==='GET')return reply(project);
      if(['download','srt','vtt','thumbnail'].includes(action)&&method==='GET'){
        const key=action==='srt'?project.srtKey:action==='vtt'?project.vttKey:action==='thumbnail'?project.thumbnailKey:project.outputKey;
        invariant(key,'NOT_READY','Tài sản chưa sẵn sàng.',404);
        if(config.storageDriver==='s3')return NextResponse.redirect(await downloadUrl(key));
        const bytes=await readAsset(key),type=action==='srt'?'application/x-subrip; charset=utf-8':action==='vtt'?'text/vtt; charset=utf-8':action==='thumbnail'?'image/jpeg':'video/mp4';
        const headers:Record<string,string>={'Content-Type':type,'Cache-Control':'private, no-store','Accept-Ranges':'bytes'};
        if(action==='srt'||action==='vtt'||request.nextUrl.searchParams.has('save'))headers['Content-Disposition']='attachment; filename="'+id+'.'+(action==='download'?'mp4':action)+'"';
        const range=request.headers.get('range');
        if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);invariant(m,'RANGE','Range không hợp lệ.',416);const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),bytes.length-1):bytes.length-1;invariant(start<=end&&start<bytes.length,'RANGE','Range ngoài file.',416);headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;headers['Content-Length']=String(end-start+1);return new NextResponse(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers});}
        headers['Content-Length']=String(bytes.length);return new NextResponse(new Uint8Array(bytes),{headers});
      }
      if(method==='POST'&&['approve','reject'].includes(action)){
        authorize(actor,['OWNER','REVIEWER']);
        if(action==='approve'){const data=z.object({reviewed:z.literal(true),rightsConfirmed:z.literal(true)}).parse(await body(request));void data;invariant(canApprove(project.status,project.qaScore,[]),'QA_GATE','Chỉ duyệt video đang chờ và đạt QA.',409);}
        else invariant(project.status==='AWAITING_APPROVAL','STATE','Video không ở trạng thái chờ duyệt.',409);
        await db.$transaction(async tx=>{
          const changed=await tx.videoProject.updateMany({where:{id,workspaceId,revision:project.revision,status:'AWAITING_APPROVAL'},data:{status:action==='approve'?'APPROVED':'CANCELLED'}});
          invariant(changed.count,'APPROVAL_CONFLICT','Phiên bản/trạng thái đã thay đổi. Tải lại trước khi duyệt.',409);
          await tx.approvalRequest.updateMany({where:{projectId:id,revision:project.revision,status:'PENDING'},data:{status:action==='approve'?'APPROVED':'REJECTED',actorId:actor.userId,decidedAt:new Date()}});
        });
        await audit(actor,'video.'+action,id);return reply({ok:true});
      }
      authorize(actor);
      if(method==='POST'&&(action==='render'||action==='retry')){const data=z.object({allowAdditionalCost:z.boolean().default(false)}).parse(await body(request));return reply(await queueProject(actor,id,action,data.allowAdditionalCost),202);}
      if(method==='POST'&&action==='cancel'){
        await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;await tx.scriptEditJob.updateMany({where:{projectId:id,status:{in:['QUEUED','RUNNING','READY']}},data:{status:'DISMISSED',leaseUntil:null}});await tx.productionJob.updateMany({where:{projectId:id,status:{in:['QUEUED','RUNNING']}},data:{status:'CANCELLED',leaseUntil:null}});await tx.publishingJob.updateMany({where:{projectId:id,status:{in:['AWAITING_APPROVAL','READY_TO_PUBLISH']}},data:{status:'CANCELLED'}});await tx.videoProject.update({where:{id},data:{status:'CANCELLED'}});});await audit(actor,'video.cancel',id);return reply({ok:true});
      }
    }
    if(resource==='scripts'&&id){
      const project=await projectFor(workspaceId,id);
      if(action==='edits'){
        if(method==='GET')return reply(await listScriptEdits(actor,id));
        if(method==='POST'){
          const key=request.headers.get('idempotency-key');invariant(key&&key.length<=100,'IDEMPOTENCY_KEY','Cần Idempotency-Key.');
          return reply(await requestScriptEdit(actor,id,await body(request),key),202);
        }
        if(method==='PATCH'){const data=z.object({jobId:z.string(),proposal:z.number().int().min(0).max(2)}).parse(await body(request));return reply(await applyScriptEdit(actor,id,data.jobId,data.proposal));}
        if(method==='DELETE'){const data=z.object({jobId:z.string()}).parse(await body(request));return reply(await dismissScriptEdit(actor,id,data.jobId));}
        throw new AppError('METHOD','Phương thức không hỗ trợ.',405);
      }
      if(method==='GET')return reply(project.script);
      authorize(actor);
      if(method==='PUT'){const data=z.object({script:z.unknown(),expectedRevision:z.number().int()}).parse(await body(request));const result=await saveScript(actor,id,data.script,data.expectedRevision);await audit(actor,'script.save',id);return reply(result);}
      if(method==='POST'&&action==='restore'){const data=z.object({version:z.number().int(),expectedRevision:z.number().int()}).parse(await body(request));const version=project.script?.versions.find(v=>v.version===data.version);invariant(version,'NOT_FOUND','Không tìm thấy phiên bản.',404);return reply(await saveScript(actor,id,version.data,data.expectedRevision));}
    }
    if(resource==='storyboards'&&id&&method==='PATCH'){
      authorize(actor);await projectFor(workspaceId,id);const data=z.object({sceneOrder:z.number().int(),locked:z.boolean()}).parse(await body(request));return reply(await setSceneLock(actor,id,data.sceneOrder,data.locked));
    }
    if(resource==='schedules'){
      authorize(actor);
      if(method==='POST'){
        const data=scheduleSchema.parse(await body(request));invariant(await db.contentChannel.findFirst({where:{id:data.channelId,workspaceId,deletedAt:null}}),'NOT_FOUND','Không tìm thấy kênh.',404);
        if(data.campaignId)invariant(await db.campaign.findFirst({where:{id:data.campaignId,workspaceId,channelId:data.channelId}}),'CAMPAIGN','Chiến dịch không thuộc kênh.',404);
        const now=new Date(),next=data.cron?nextResearchRun({...data,cron:data.cron},now)!:researchTime(new Date(data.runAt!),data);
        invariant(next>now,'SCHEDULE_PAST','Thời điểm chạy phải ở tương lai.');if(data.endsAt)invariant(new Date(data.endsAt)>next,'SCHEDULE_END','Ngày kết thúc phải sau lần chạy đầu.');
        const {runAt,...values}=data;void runAt;
        const rule=await db.scheduleRule.create({data:{...values,workspaceId,nextRunAt:next,endsAt:data.endsAt?new Date(data.endsAt):null}});await audit(actor,'schedule.create',rule.id);return reply(rule,201);
      }
      const rule=await db.scheduleRule.findFirst({where:{id,workspaceId}});invariant(rule,'NOT_FOUND','Không tìm thấy lịch.',404);
      if(method==='PATCH'){const data=z.object({enabled:z.boolean()}).parse(await body(request));if(data.enabled)invariant(rule.runCount<rule.maxRuns,'SCHEDULE_LIMIT','Lịch đã đạt giới hạn số lần chạy.');const next=data.enabled?(rule.cron?nextResearchRun(rule,new Date()):new Date(Date.now()+60000)):rule.nextRunAt;await db.scheduleRule.update({where:{id},data:{...data,nextRunAt:next}});return reply({ok:true});}
      if(method==='POST'&&action==='run'){await db.scheduleRule.update({where:{id},data:{enabled:true,nextRunAt:new Date()}});return reply({ok:true});}
    }
    if(resource==='assets'&&id&&method==='GET'){
      const asset=await db.generatedAsset.findFirst({where:{id,workspaceId}});invariant(asset,'NOT_FOUND','Không tìm thấy tài sản.',404);
      if(config.storageDriver==='s3')return NextResponse.redirect(await downloadUrl(asset.storageKey));
      return new NextResponse(new Uint8Array(await readAsset(asset.storageKey)),{headers:{'Content-Type':asset.mimeType,'Cache-Control':'private, no-store'}});
    }
    if(resource==='notifications'&&id&&method==='PATCH'){await db.notification.updateMany({where:{id,workspaceId},data:{readAt:new Date()}});return reply({ok:true});}
    if(resource==='integrations'||resource==='publishing')return await socialRoute(request,path,actor,()=>body(request));
    if(resource==='system'&&id==='openapi')return reply((await import('./openapi')).openapi);
    throw new AppError('NOT_FOUND','Endpoint không tồn tại.',404);
    });
  }catch(error){
    if(error instanceof ZodError)return reply({error:{code:'VALIDATION',message:error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')}},422);
    if(error instanceof AppError)return reply({error:{code:error.code,message:error.message}},error.status);
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return reply({error:{code:'CONFLICT',message:'Bản ghi đã tồn tại hoặc yêu cầu bị lặp.'}},409);
    log.error({resource,method,errorType:error instanceof Error?error.name:'unknown'},'api_error');
    return reply({error:{code:'INTERNAL',message:'Không thể xử lý yêu cầu. Kiểm tra dịch vụ và nhật ký hệ thống.'}},500);
  }
}
