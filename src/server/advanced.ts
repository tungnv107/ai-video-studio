import {scheduleMilestones,nextResearchRun} from './schedule-timing';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {NextRequest,NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from './db';
import {Actor,authorize,audit} from './auth';
import {config} from './config';
import {hashToken,verifyPassword} from './crypto';
import {invariant,safeError} from '../domain/errors';
import {productionSettings,productionSettingsSchema} from '../domain/production-settings';
import {putAsset,readAsset,downloadUrl} from './storage';
import {probe} from '../render/ffmpeg';
import {nextRun,canApprove} from '../domain/workflow';
const json=(x:unknown)=>x as Prisma.InputJsonValue;
const reply=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function validateMedia(workspaceId:string,settings:ReturnType<typeof productionSettings>){
 for(const id of Object.values(settings.providerIds))if(id)invariant(await db.aIProvider.findFirst({where:{id,workspaceId}}),'PROVIDER_OWNER','Provider không thuộc workspace.',404);
 for(const [id,kind] of [[settings.logoMediaId,'IMAGE'],[settings.musicMediaId,'AUDIO'],[settings.footageMediaId,'VIDEO']])if(id)invariant(await db.mediaItem.findFirst({where:{id,workspaceId,kind,deletedAt:null}}),'MEDIA_OWNER','Tài sản không tồn tại hoặc sai loại.',404);
 if(settings.visualMode==='FOOTAGE')invariant(settings.footageMediaId,'FOOTAGE_REQUIRED','Cần chọn footage đã có quyền sử dụng.');
}
async function limitedForm(request:Request){const reader=request.body?.getReader();invariant(reader,'UPLOAD','Thiếu file.');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32_000_000){await reader.cancel();invariant(false,'UPLOAD_SIZE','Tối đa 30 MB mỗi tài sản.',413);}chunks.push(value);}return new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}
export async function advancedRoute(request:NextRequest,pathParts:string[],actor:Actor,body:()=>Promise<unknown>):Promise<NextResponse|undefined>{
 const [resource,id,action]=pathParts,{workspaceId}=actor,method=request.method;
 if(resource==='media'){
  if(method==='GET'&&!id)return reply(await db.mediaItem.findMany({where:{workspaceId,deletedAt:null},orderBy:{createdAt:'desc'},take:200}));
  if(method==='GET'&&id){const item=await db.mediaItem.findFirst({where:{id,workspaceId,deletedAt:null}});invariant(item,'NOT_FOUND','Không tìm thấy tài sản.',404);if(config.storageDriver==='s3')return NextResponse.redirect(await downloadUrl(item.storageKey));return new NextResponse(new Uint8Array(await readAsset(item.storageKey)),{headers:{'Content-Type':item.mimeType,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});}
  authorize(actor);
  if(method==='POST'){
   const form=await limitedForm(request),file=form.get('file');invariant(file instanceof File&&file.size>0&&file.size<=30_000_000,'UPLOAD_SIZE','File phải có dữ liệu và không quá 30 MB.');
   const data=z.object({license:z.string().trim().min(3).max(500),rightsConfirmed:z.literal('true')}).parse(Object.fromEntries(form)),bytes=Buffer.from(await file.arrayBuffer());let normalized=bytes,mime='',kind='',extension='',duration:number|undefined;
   if(file.type.startsWith('image/')){normalized=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().png().toBuffer();mime='image/png';kind='IMAGE';extension='png';}
   else {const directory=path.join(config.renderDir,'upload-'+randomUUID());await mkdir(directory,{recursive:true});try{const target=path.join(directory,'input');await writeFile(target,bytes);const info=await probe(target);duration=Number(info.format.duration);invariant(duration>0&&duration<=1800,'MEDIA_DURATION','Âm thanh/video phải dài tối đa 30 phút.');const video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');invariant(video||audio,'MEDIA_FORMAT','File không có track media.');if(video){invariant(video.codec_name==='h264'&&bytes.subarray(4,8).toString()==='ftyp','MEDIA_FORMAT','Footage cần MP4 H.264.');mime='video/mp4';kind='VIDEO';extension='mp4';}else {invariant(audio?.codec_name==='mp3'||audio?.codec_name==='pcm_s16le','MEDIA_FORMAT','Nhạc cần MP3 hoặc WAV PCM 16-bit.');mime=audio.codec_name==='mp3'?'audio/mpeg':'audio/wav';kind='AUDIO';extension=audio.codec_name==='mp3'?'mp3':'wav';}}finally{await rm(directory,{recursive:true,force:true});}}
   const mediaId=randomUUID(),key=`${workspaceId}/library/${mediaId}.${extension}`;await putAsset(key,normalized,mime);const item=await db.mediaItem.create({data:{id:mediaId,workspaceId,name:file.name.slice(0,150),kind,storageKey:key,mimeType:mime,bytes:normalized.length,duration,license:data.license,checksum:hashToken(normalized.toString('base64')),createdBy:actor.userId}});await audit(actor,'media.upload',item.id);return reply(item,201);
  }
  if(method==='DELETE'){const item=await db.mediaItem.findFirst({where:{id,workspaceId,deletedAt:null}});invariant(item,'NOT_FOUND','Không tìm thấy tài sản.',404);const channels=await db.contentChannel.findMany({where:{workspaceId},select:{settings:true}}),projects=await db.videoProject.findMany({where:{workspaceId,deletedAt:null},select:{productionConfig:true}});invariant(![...channels.map(x=>x.settings),...projects.map(x=>x.productionConfig)].some(x=>JSON.stringify(x).includes(id)),'MEDIA_IN_USE','Tài sản đang được kênh hoặc video sử dụng.',409);await db.mediaItem.update({where:{id},data:{deletedAt:new Date()}});return reply({ok:true});}
 }
 if(resource==='production-settings'&&id){
  const channel=await db.contentChannel.findFirst({where:{id,workspaceId,deletedAt:null}});invariant(channel,'NOT_FOUND','Không tìm thấy kênh.',404);
  if(method==='GET')return reply({settings:productionSettings(channel.settings),updatedAt:channel.updatedAt});authorize(actor);
  if(method==='PUT'){const data=z.object({settings:productionSettingsSchema,expectedUpdatedAt:z.string().datetime()}).parse(await body());await validateMedia(workspaceId,data.settings);const changed=await db.contentChannel.updateMany({where:{id,workspaceId,updatedAt:new Date(data.expectedUpdatedAt)},data:{settings:json(data.settings)}});invariant(changed.count,'VERSION_CONFLICT','Cấu hình kênh đã thay đổi. Tải lại trước khi lưu.',409);await audit(actor,'channel.production-settings',id);return reply({ok:true});}
 }
 if(resource==='brand-kits'||resource==='template-versions'){
  if(method==='GET')return reply(resource==='brand-kits'?await db.brandKit.findMany({where:{workspaceId},orderBy:{version:'desc'}}):await db.videoTemplate.findMany({where:{workspaceId},orderBy:{version:'desc'}}));authorize(actor);
  if(method==='POST'){const data=z.object({name:z.string().min(1).max(100),slug:z.string().regex(/^[a-z0-9-]{1,80}$/),config:productionSettingsSchema}).parse(await body());await validateMedia(workspaceId,data.config);
   return reply(await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId+':'+resource+':'+(resource==='brand-kits'?data.name:data.slug)}))`;if(resource==='brand-kits'){const latest=await tx.brandKit.findFirst({where:{workspaceId,name:data.name},orderBy:{version:'desc'}});return tx.brandKit.create({data:{workspaceId,name:data.name,version:(latest?.version||0)+1,config:json(data.config)}});}const latest=await tx.videoTemplate.findFirst({where:{workspaceId,slug:data.slug},orderBy:{version:'desc'}});return tx.videoTemplate.create({data:{workspaceId,name:data.name,slug:data.slug,version:(latest?.version||0)+1,config:json(data.config)}});}),201);
  }
 }
 if(resource==='campaigns'){
  if(method==='GET')return reply(await db.campaign.findMany({where:{workspaceId},orderBy:{createdAt:'desc'}}));authorize(actor);
  if(method==='POST'&&id&&action==='schedule'){const data=z.object({scheduleId:z.string()}).parse(await body()),campaign=await db.campaign.findFirst({where:{id,workspaceId}});invariant(campaign,'NOT_FOUND','Không tìm thấy chiến dịch.',404);const changed=await db.scheduleRule.updateMany({where:{id:data.scheduleId,workspaceId,channelId:campaign.channelId},data:{campaignId:campaign.id,endsAt:campaign.endsAt}});invariant(changed.count,'SCHEDULE_CHANNEL','Lịch không thuộc kênh của chiến dịch.',404);return reply({ok:true});}
  if(method==='POST'){const data=z.object({channelId:z.string(),name:z.string().min(1).max(100),topics:z.array(z.string().min(1).max(500)).min(1).max(1000),startsAt:z.string().datetime(),endsAt:z.string().datetime(),budgetCents:z.number().int().min(1).max(1000000),maxVideos:z.number().int().min(1).max(1000)}).parse(await body());invariant(new Date(data.endsAt)>new Date(data.startsAt),'CAMPAIGN_DATES','Ngày kết thúc phải sau ngày bắt đầu.');invariant(await db.contentChannel.findFirst({where:{id:data.channelId,workspaceId,deletedAt:null}}),'NOT_FOUND','Không tìm thấy kênh.',404);return reply(await db.campaign.create({data:{...data,workspaceId}}),201);}
  if(method==='PATCH'){const data=z.object({status:z.enum(['ACTIVE','PAUSED','COMPLETED'])}).parse(await body());const changed=await db.campaign.updateMany({where:{id,workspaceId},data});invariant(changed.count,'NOT_FOUND','Không tìm thấy chiến dịch.',404);return reply({ok:true});}
 }
 if(resource==='calendar'&&method==='GET'){
  const from=new Date(request.nextUrl.searchParams.get('from')||Date.now()),to=new Date(request.nextUrl.searchParams.get('to')||Date.now()+31*86400000);invariant(Number.isFinite(+from)&&Number.isFinite(+to)&&to>from&&+to-+from<=93*86400000,'CALENDAR_RANGE','Khoảng xem lịch tối đa 93 ngày.');
  const rules=await db.scheduleRule.findMany({where:{workspaceId,enabled:true}}),events=[];
  for(const rule of rules){let when=rule.nextRunAt,remaining=rule.maxRuns-rule.runCount;for(let i=0;when&&remaining>0&&i<1000&&when<=to;i++,remaining--){if(rule.endsAt&&when>rule.endsAt)break;if(when>=from)events.push({id:rule.id+':'+when.toISOString(),scheduleId:rule.id,name:rule.name,at:when,timezone:rule.timezone,movable:i===0,updatedAt:rule.updatedAt,campaignId:rule.campaignId,...scheduleMilestones(when,rule)});when=nextResearchRun(rule,when);} }return reply(events);
 }
 if(resource==='calendar'&&id&&method==='PATCH'){
  authorize(actor);const data=z.object({at:z.string().datetime(),expectedUpdatedAt:z.string().datetime()}).parse(await body());invariant(new Date(data.at)>new Date(),'SCHEDULE_PAST','Lần chạy phải ở tương lai.');const changed=await db.scheduleRule.updateMany({where:{id,workspaceId,updatedAt:new Date(data.expectedUpdatedAt),OR:[{endsAt:null},{endsAt:{gte:new Date(data.at)}}]},data:{nextRunAt:new Date(data.at)}});invariant(changed.count,'CALENDAR_CONFLICT','Lịch đã thay đổi hoặc vượt ngày kết thúc.',409);await audit(actor,'schedule.move',id);return reply({ok:true});
 }
 if(resource==='bulk-approval'&&method==='POST'){
  authorize(actor,['OWNER','REVIEWER']);const data=z.object({reviewed:z.literal(true),rightsConfirmed:z.literal(true),videos:z.array(z.object({id:z.string(),revision:z.number().int()})).min(1).max(50)}).parse(await body()),results=[];
  for(const item of data.videos)try{await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.id}))`;const p=await tx.videoProject.findFirst({where:{id:item.id,workspaceId,revision:item.revision,deletedAt:null}});invariant(p&&canApprove(p.status,p.qaScore,[]),'QA_GATE','Video đã thay đổi hoặc chưa đạt QA.',409);await tx.videoProject.update({where:{id:p.id},data:{status:'APPROVED'}});await tx.approvalRequest.updateMany({where:{projectId:p.id,revision:p.revision,status:'PENDING'},data:{status:'APPROVED',actorId:actor.userId,decidedAt:new Date()}});await tx.auditLog.create({data:{workspaceId,actorId:actor.userId,action:'video.bulk-approve',entityId:p.id}});});results.push({id:item.id,ok:true});}catch(e){results.push({id:item.id,ok:false,error:safeError(e)});}return reply(results);
 }
 if(resource==='lifecycle'){
  authorize(actor,['OWNER']);if(method==='GET')return reply(await db.workspace.findUnique({where:{id:workspaceId},select:{name:true,archivedAt:true,retentionDays:true}}));
  if(method==='PATCH'){const data=z.object({retentionDays:z.union([z.literal(0),z.number().int().min(7).max(3650)])}).parse(await body());await db.workspace.update({where:{id:workspaceId},data});await audit(actor,'workspace.retention');return reply({ok:true});}
  if(method==='POST'&&action==='archive'){const data=z.object({password:z.string(),name:z.string()}).parse(await body()),user=await db.user.findUniqueOrThrow({where:{id:actor.userId}}),workspace=await db.workspace.findUniqueOrThrow({where:{id:workspaceId}});invariant(verifyPassword(data.password,user.passwordHash)&&data.name===workspace.name,'CONFIRMATION','Mật khẩu hoặc tên workspace không đúng.',401);await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;invariant(!await tx.productionJob.findFirst({where:{workspaceId,status:'RUNNING'}})&&!await tx.publishingJob.findFirst({where:{project:{workspaceId},status:{in:['UPLOADING','PLATFORM_PROCESSING']}}}),'WORKSPACE_BUSY','Đợi công việc đang chạy hoàn tất.',409);await tx.workspace.update({where:{id:workspaceId},data:{archivedAt:new Date()}});await tx.scheduleRule.updateMany({where:{workspaceId},data:{enabled:false}});await tx.productionJob.updateMany({where:{workspaceId,status:'QUEUED'},data:{status:'CANCELLED'}});await tx.scriptEditJob.updateMany({where:{workspaceId,status:{in:['QUEUED','RUNNING','READY']}},data:{status:'DISMISSED'}});await tx.publishingJob.updateMany({where:{project:{workspaceId},status:'READY_TO_PUBLISH'},data:{status:'CANCELLED'}});await tx.session.deleteMany({where:{workspaceId}});});return reply({ok:true});}
 }
}
