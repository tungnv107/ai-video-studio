import {variantSchema,variantIndex} from './analytics';
import {productionSettings} from '../domain/production-settings';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { videoInputSchema,scriptSchema,sameScene } from '../domain/schemas';
import { AppError,invariant } from '../domain/errors';
import { editableStatuses,topicHash } from '../domain/workflow';
import type { Actor } from './auth';
export async function createProject(actor:Actor,input:unknown,idempotencyKey:string){
  const data=videoInputSchema.parse(input);
  const key=actor.workspaceId+':'+idempotencyKey;
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.channelId}))`;
    const prior=await tx.productionJob.findUnique({where:{idempotencyKey:key},include:{project:{include:{sources:true}}}});
    if(prior){
      const p=prior.project;
      invariant(p.workspaceId===actor.workspaceId&&p.channelId===data.channelId&&p.topic===data.topic&&p.targetDuration===data.targetDuration&&p.aspectRatio===data.aspectRatio&&p.quality===data.quality&&p.intent===data.intent&&(p.campaignId||undefined)===data.campaignId&&JSON.stringify(p.sources.map(s=>({url:s.url,title:s.title,excerpt:s.excerpt})).sort((a,b)=>a.url.localeCompare(b.url)))===JSON.stringify([...data.sources].sort((a,b)=>a.url.localeCompare(b.url))),'IDEMPOTENCY_CONFLICT','Idempotency key đã dùng cho yêu cầu khác.',409);
      return p;
    }
    const channel=await tx.contentChannel.findFirst({where:{id:data.channelId,workspaceId:actor.workspaceId,deletedAt:null}});
    invariant(channel,'NOT_FOUND','Không tìm thấy kênh.',404);
    const hash=topicHash(data.topic);
    const duplicate=data.intent==='IDEAS'?null:await tx.videoProject.findFirst({where:{channelId:channel.id,intent:{not:'IDEAS'},topicHash:hash,deletedAt:null,status:{notIn:['CANCELLED']},createdAt:{gte:new Date(Date.now()-channel.dedupeDays*86400000)}}});
    invariant(!duplicate,'DUPLICATE_TOPIC','Chủ đề đã được sản xuất trong khoảng tránh lặp của kênh.',409);
    if(data.campaignId){const campaign=await tx.campaign.findFirst({where:{id:data.campaignId,workspaceId:actor.workspaceId,channelId:channel.id,status:'ACTIVE',startsAt:{lte:new Date()},endsAt:{gte:new Date()}}});invariant(campaign,'CAMPAIGN','Chiến dịch chưa hoạt động hoặc không thuộc kênh.',409);invariant(await tx.videoProject.count({where:{campaignId:campaign.id,deletedAt:null}})<campaign.maxVideos,'CAMPAIGN_LIMIT','Chiến dịch đã đủ số video.',409);}
    const experiment=data.intent==='IDEAS'?null:await tx.experiment.findFirst({where:{workspaceId:actor.workspaceId,channelId:channel.id,status:'ACTIVE'}}),variants=experiment?variantSchema.array().parse(experiment.variants):[],variant=variants.length?variants[variantIndex(key,variants.length)]:null;
    const {sources,...values}=data;
    const project=await tx.videoProject.create({data:{...values,productionConfig:variant?.settings||productionSettings(channel.settings),experimentId:experiment?.id,variant:variant?.label,workspaceId:actor.workspaceId,title:data.topic,topicHash:hash,status:'SCHEDULED',sources:{create:sources},jobs:{create:{idempotencyKey:key}}}});
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'video.create',entityId:project.id}});
    return project;
  });
}
export async function projectFor(workspaceId:string,id:string){
  const project=await db.videoProject.findFirst({where:{id,workspaceId,deletedAt:null},include:{channel:true,script:{include:{versions:{orderBy:{version:'desc'}}}},scenes:{orderBy:{sceneOrder:'asc'}},assets:true,jobs:{orderBy:{createdAt:'desc'}},costs:true,sources:true,approvals:true,publishingJobs:{select:{id:true,status:true,account:{select:{displayName:true,platform:true}},post:{select:{publishedAt:true,url:true}}}}}});
  invariant(project,'NOT_FOUND','Không tìm thấy video.',404);return project;
}
export async function saveScript(actor:Actor,id:string,input:unknown,expectedRevision:number){
  return db.$transaction(tx=>saveScriptInTransaction(tx,actor,id,input,expectedRevision));
}
export async function saveScriptInTransaction(tx:Prisma.TransactionClient,actor:Actor,id:string,input:unknown,expectedRevision:number,reason='User edit/restore'){
  const data=scriptSchema.parse(input);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const project=await tx.videoProject.findFirst({where:{id,workspaceId:actor.workspaceId},include:{script:true,scenes:true}});
    invariant(project,'NOT_FOUND','Không tìm thấy video.',404);
    invariant(editableStatuses.includes(project.status),'BUSY','Chưa thể sửa khi công việc đang chạy.',409);
    invariant(project.revision===expectedRevision,'VERSION_CONFLICT','Kịch bản đã thay đổi. Tải lại trước khi lưu.',409);
    invariant(!await tx.productionJob.findFirst({where:{projectId:id,status:{in:['QUEUED','RUNNING']}}}),'BUSY','Công việc còn trong hàng đợi.',409);
    invariant(!await tx.publishingJob.findFirst({where:{projectId:id,status:'UPLOADING'}}),'UPLOAD_IN_PROGRESS','Đợi upload hoàn tất trước khi chỉnh sửa phiên bản.',409);
    const previous=project.script ? scriptSchema.parse(project.script.data):null;
    for(const locked of project.scenes.filter(s=>s.locked)){
      const old=previous?.scenes.find(s=>s.scene_order===locked.sceneOrder),updated=data.scenes.find(s=>s.scene_order===locked.sceneOrder);
      invariant(sameScene(old,updated),'LOCKED_SCENE','Hãy mở khóa scene trước khi chỉnh sửa.',409);
    }
    const version=project.revision+1;
    const script=await tx.script.upsert({where:{projectId:id},create:{projectId:id,workspaceId:actor.workspaceId,data:data as unknown as Prisma.InputJsonValue,currentVersion:version},update:{data:data as unknown as Prisma.InputJsonValue,currentVersion:version,approvedAt:null}});
    await tx.scriptVersion.create({data:{scriptId:script.id,version,data:data as unknown as Prisma.InputJsonValue,authorId:actor.userId,reason}});
    const locks=new Map(project.scenes.map(s=>[s.sceneOrder,s.locked]));
    await tx.videoScene.deleteMany({where:{projectId:id}});
    await tx.videoScene.createMany({data:data.scenes.map(s=>({projectId:id,sceneOrder:s.scene_order,narration:s.narration_text,visualPrompt:s.image_generation_prompt,duration:s.duration_seconds,locked:locks.get(s.scene_order)||false}))});
    await tx.approvalRequest.updateMany({where:{projectId:id,status:'PENDING'},data:{status:'SUPERSEDED'}});
    await tx.publishingJob.updateMany({where:{projectId:id,status:{in:['AWAITING_APPROVAL','READY_TO_PUBLISH']}},data:{status:'CANCELLED',consentAt:null}});
    await tx.scriptEditJob.updateMany({where:{projectId:id,status:{in:['QUEUED','RUNNING','READY']}},data:{status:'STALE',leaseUntil:null}});
    return tx.videoProject.update({where:{id},data:{title:data.title,targetDuration:data.target_duration,revision:version,status:'SCRIPT_READY',completedAt:null,outputKey:null,srtKey:null,vttKey:null,thumbnailKey:null,qaScore:null,qaReport:Prisma.DbNull}});
}
export async function queueProject(actor:Actor,id:string,action:'render'|'retry',allowAdditionalCost=false){
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const project=await tx.videoProject.findFirst({where:{id,workspaceId:actor.workspaceId},include:{script:true}});
    invariant(project,'NOT_FOUND','Không tìm thấy video.',404);
    invariant(editableStatuses.includes(project.status),'STATE','Trạng thái hiện tại không cho phép chạy lại.',409);
    invariant(!await tx.productionJob.findFirst({where:{projectId:id,status:{in:['QUEUED','RUNNING']}}}),'BUSY','Video đã có công việc đang chạy.',409);
    if(action==='render') invariant(project.script,'NO_SCRIPT','Cần có kịch bản trước khi dựng.');
    const uncertain=await tx.costUsage.count({where:{projectId:id,status:{in:['UNKNOWN','RESERVED']}}});
    if(uncertain && !allowAdditionalCost) throw new AppError('COST_CONFIRMATION','Có lời gọi AI chưa rõ kết quả. Cần đồng ý chi phí bổ sung trước khi thử lại.',409);
    if(allowAdditionalCost){
      await tx.automationTask.updateMany({where:{projectId:id,kind:"VIDEO",status:"FAILED"},data:{remoteId:null,status:"QUEUED",error:null}});
      // Keep the old estimate charged; freeing the idempotency slot does not erase its cost.
      const costs=await tx.costUsage.findMany({where:{projectId:id,status:{in:['UNKNOWN','RESERVED','COMPLETED']}}});
      for(const c of costs) await tx.costUsage.update({where:{id:c.id},data:{idempotencyKey:c.idempotencyKey+':reviewed:'+randomUUID(),status:c.status==='RESERVED'?'UNKNOWN':c.status}});
    }
    await tx.productionJob.create({data:{projectId:id,workspaceId:actor.workspaceId,idempotencyKey:actor.workspaceId+':retry:'+randomUUID()}});
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:allowAdditionalCost?'video.retry_with_cost_consent':'video.'+action,entityId:id}});
    return tx.videoProject.update({where:{id},data:{status:'SCHEDULED',completedAt:null,intent:action==='render'?'VIDEO':project.intent,lastError:null}});
  });
}
export async function setSceneLock(actor:Actor,id:string,sceneOrder:number,locked:boolean){
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    invariant(await tx.videoProject.findFirst({where:{id,workspaceId:actor.workspaceId,deletedAt:null}}),'NOT_FOUND','Không tìm thấy video.',404);
    return tx.videoScene.update({where:{projectId_sceneOrder:{projectId:id,sceneOrder}},data:{locked}});
  });
}
