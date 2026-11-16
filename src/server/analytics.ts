import {randomUUID,createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from './db';
import {Actor,authorize} from './auth';
import {invariant} from '../domain/errors';
import {productionSettingsSchema} from '../domain/production-settings';
export const variantSchema=z.object({label:z.string().regex(/^[A-Za-z0-9_-]{1,30}$/),instruction:z.string().max(300),settings:productionSettingsSchema});
export function variantIndex(key:string,count:number){return createHash('sha256').update(key).digest().readUInt32BE(0)%count;}
export async function analyticsData(workspaceId:string,channelId?:string,campaignId?:string){
 const posts=await db.publishedPost.findMany({where:{publishingJob:{project:{workspaceId,...(channelId?{channelId}:{}),...(campaignId?{campaignId}:{})}}},include:{metrics:{orderBy:{capturedAt:'desc'},take:48},publishingJob:{include:{project:{select:{id:true,title:true,channelId:true,campaignId:true,experimentId:true,variant:true,targetDuration:true,topic:true}},account:{select:{platform:true,displayName:true}}}}},orderBy:{publishedAt:'desc'},take:500});
 const early=posts.length?await db.$queryRaw<import('@prisma/client').PlatformMetricSnapshot[]>`SELECT DISTINCT ON (m."postId") m.* FROM "PlatformMetricSnapshot" m JOIN "PublishedPost" p ON p.id=m."postId" WHERE m."postId"=ANY(${posts.map(p=>p.id)}::text[]) AND m."capturedAt">=p."publishedAt"+interval '24 hours' AND m."capturedAt"<=p."publishedAt"+interval '48 hours' ORDER BY m."postId",m."capturedAt" ASC`:[];
 for(const p of posts){const first=early.find(m=>m.postId===p.id);if(first&&!p.metrics.some(m=>m.id===first.id))p.metrics.push(first);}
 return posts.map(p=>({id:p.id,url:p.url,publishedAt:p.publishedAt,nextSyncAt:p.nextSyncAt,syncError:p.syncError,project:p.publishingJob.project,account:p.publishingJob.account,metrics:p.metrics.map(m=>({capturedAt:m.capturedAt,views:m.views?.toString()??null,likes:m.likes?.toString()??null,comments:m.comments?.toString()??null,shares:m.shares?.toString()??null,watchMinutes:m.watchMinutes,averageViewDuration:m.averageViewDuration}))}));
}
export async function analyticsRoute(request:NextRequest,path:string[],actor:Actor,body:()=>Promise<unknown>){const [resource,id]=path,{workspaceId}=actor,method=request.method;
 if(resource==='analytics'){
  if(method==='GET')return NextResponse.json(await analyticsData(workspaceId,request.nextUrl.searchParams.get('channelId')||undefined,request.nextUrl.searchParams.get('campaignId')||undefined));
  authorize(actor);if(method==='POST'&&id==='sync'){await db.publishedPost.updateMany({where:{publishingJob:{project:{workspaceId}}},data:{nextSyncAt:new Date()}});return NextResponse.json({ok:true});}
 }
 if(resource==='experiments'){
  if(method==='GET')return NextResponse.json(await db.experiment.findMany({where:{workspaceId},orderBy:{createdAt:'desc'}}));authorize(actor);
  if(method==='POST'){const data=z.object({channelId:z.string(),name:z.string().min(1).max(150),variants:z.array(variantSchema).min(2).max(4),minimumSamples:z.number().int().min(10).max(1000).default(10),metric:z.enum(['views','likes','comments','shares']).default('views')}).parse(await body());invariant(new Set(data.variants.map(v=>v.label)).size===data.variants.length,'VARIANTS','Tên biến thể không được trùng.');invariant(await db.contentChannel.findFirst({where:{id:data.channelId,workspaceId,deletedAt:null}}),'CHANNEL','Không tìm thấy kênh.',404);for(const variant of data.variants)await (await import('./advanced')).validateMedia(workspaceId,variant.settings);return NextResponse.json(await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.channelId}))`;invariant(!await tx.experiment.findFirst({where:{workspaceId,channelId:data.channelId,status:'ACTIVE'}}),'EXPERIMENT_ACTIVE','Mỗi kênh chỉ có một thử nghiệm đang chạy.',409);return tx.experiment.create({data:{...data,workspaceId,variants:data.variants as unknown as Prisma.InputJsonValue}});}),{status:201});}
  if(method==='PATCH'){const data=z.object({status:z.enum(['PAUSED','COMPLETED'])}).parse(await body());const changed=await db.experiment.updateMany({where:{id,workspaceId},data});invariant(changed.count,'NOT_FOUND','Không tìm thấy thử nghiệm.',404);return NextResponse.json({ok:true});}
 }
 if(resource==='recommendations'){
  if(method==='GET')return NextResponse.json(await db.automationTask.findMany({where:{workspaceId,kind:'RECOMMENDATIONS'},select:{id:true,status:true,result:true,error:true,createdAt:true},take:10,orderBy:{createdAt:'desc'}}));authorize(actor);
  if(method==='POST'){const {channelId}=z.object({channelId:z.string()}).parse(await body()),key=request.headers.get('idempotency-key');invariant(key&&key.length<=100,'IDEMPOTENCY_KEY','Cần Idempotency-Key.');const existing=await db.automationTask.findUnique({where:{key:workspaceId+':recommendations:'+key}});if(existing){invariant((existing.request as {channelId?:string}).channelId===channelId,'IDEMPOTENCY_CONFLICT','Khóa đã dùng cho kênh khác.',409);return NextResponse.json(existing);}const post=await db.publishedPost.findFirst({where:{publishingJob:{project:{workspaceId,channelId}},metrics:{some:{views:{not:null}}}},include:{publishingJob:true},orderBy:{publishedAt:'desc'}});invariant(post,'METRICS_REQUIRED','Cần video đã có số liệu nền tảng trước khi xin đề xuất AI.',409);return NextResponse.json(await db.automationTask.create({data:{workspaceId,projectId:post.publishingJob.projectId,kind:'RECOMMENDATIONS',key:workspaceId+':recommendations:'+key,request:{channelId,actorId:actor.userId,nonce:randomUUID()}}}),{status:202});}
 }
}
