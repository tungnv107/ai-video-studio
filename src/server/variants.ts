import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from './db';
import type {Actor} from './auth';
import {invariant} from '../domain/errors';
import {productionSettings} from '../domain/production-settings';
import {scriptSchema} from '../domain/schemas';

// Every export is a separate revision/approval context. Asset references stay in
// the same workspace; immutable source assets are reused without another AI call.
export async function createVariant(actor:Actor,sourceId:string,input:unknown,key:string){
 const data=z.object({revision:z.number().int(),aspectRatio:z.enum(['9:16','16:9','1:1']),platform:z.enum(['GENERIC','YOUTUBE','TIKTOK'])}).parse(input);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceId}))`;
  const source=await tx.videoProject.findFirst({where:{id:sourceId,workspaceId:actor.workspaceId,deletedAt:null},include:{script:true,assets:true,sources:true}});
  invariant(source?.script&&source.revision===data.revision,'VERSION_CONFLICT','Kịch bản đã thay đổi hoặc chưa có.',409);
  invariant(!await tx.productionJob.findFirst({where:{projectId:sourceId,status:{in:['QUEUED','RUNNING']}}}),'BUSY','Đợi sản xuất hiện tại hoàn tất.',409);
  const requestKey=actor.workspaceId+':variant:'+key,existing=await tx.productionJob.findUnique({where:{idempotencyKey:requestKey},include:{project:true}});
  if(existing){const cfg=existing.project.productionConfig as Record<string,unknown>;invariant(cfg.sourceProjectId===sourceId&&cfg.sourceRevision===data.revision&&cfg.platform===data.platform&&existing.project.aspectRatio===data.aspectRatio,'IDEMPOTENCY_CONFLICT','Khóa đã dùng cho phiên bản khác.',409);return existing.project;}
  const settings=productionSettings(source.productionConfig),script=scriptSchema.parse(source.script.data);
  if(data.platform==='TIKTOK'){delete settings.logoMediaId;settings.intro='';settings.outro='';settings.subtitle.bottom=Math.max(.2,settings.subtitle.bottom);settings.subtitle.margin=Math.max(.12,settings.subtitle.margin);}
  const config={...settings,platform:data.platform,sourceProjectId:sourceId,sourceRevision:data.revision};
  const project=await tx.videoProject.create({data:{workspaceId:actor.workspaceId,channelId:source.channelId,title:source.title+' · '+data.aspectRatio+' '+data.platform,topic:source.topic,topicHash:source.topicHash,targetDuration:source.targetDuration,quality:source.quality,aspectRatio:data.aspectRatio,revision:1,status:'SCHEDULED',productionConfig:config,script:{create:{currentVersion:1,data:script as unknown as Prisma.InputJsonValue,versions:{create:{version:1,data:script as unknown as Prisma.InputJsonValue,authorId:actor.userId,reason:'Export variant from '+sourceId+' revision '+source.revision}}}},sources:{create:source.sources.map(s=>({url:s.url,title:s.title,excerpt:s.excerpt,provenance:s.provenance,verified:false}))},jobs:{create:{idempotencyKey:requestKey}}}});
  await tx.videoScene.createMany({data:script.scenes.map(s=>({projectId:project.id,sceneOrder:s.scene_order,narration:s.narration_text,visualPrompt:s.image_generation_prompt,duration:s.duration_seconds}))});
  await tx.generatedAsset.createMany({data:source.assets.filter(a=>a.revision===source.revision).map(a=>({projectId:project.id,workspaceId:actor.workspaceId,revision:1,sceneOrder:a.sceneOrder,kind:a.kind,storageKey:a.storageKey,mimeType:a.mimeType,bytes:a.bytes,duration:a.duration,license:a.license,metadata:a.metadata??Prisma.JsonNull}))});
  await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'video.export_variant',entityId:project.id,details:{sourceId,...data}}});return project;
 });
}
