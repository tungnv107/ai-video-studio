import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from '../server/db';
import {accountToken} from '../server/oauth';
import {YouTubeAdapter,TikTokAdapter} from '../providers/social';
import {OpenAIAdapter} from '../providers/openai';
import {providersFor,providerSlot} from '../server/provider-routing';
import {analyticsData} from '../server/analytics';
import {paidStep} from '../server/budget';
import {readAsset} from '../server/storage';
import {invariant,safeError} from '../domain/errors';
const json=(v:unknown)=>v as Prisma.InputJsonValue;
function count(value:unknown){return typeof value==='string'&&/^\d+$/.test(value)||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?BigInt(value):null;}
export async function syncMetrics(){
 if(process.env.ANALYTICS_ENABLED==='false')return;
 const posts=await db.publishedPost.findMany({where:{nextSyncAt:{lte:new Date()},OR:[{syncLeaseUntil:null},{syncLeaseUntil:{lt:new Date()}}],publishingJob:{account:{disconnectedAt:null},project:{workspace:{archivedAt:null}}}},take:10,include:{publishingJob:{include:{account:true}}}});
 for(const post of posts){const lease=new Date(Date.now()+300000),claimed=await db.publishedPost.updateMany({where:{id:post.id,nextSyncAt:{lte:new Date()},OR:[{syncLeaseUntil:null},{syncLeaseUntil:{lt:new Date()}}]},data:{syncLeaseUntil:lease}});if(!claimed.count)continue;
  try{const account=post.publishingJob.account,token=await accountToken(account.id);let views:bigint|null=null,likes:bigint|null=null,comments:bigint|null=null,shares:bigint|null=null,watchMinutes:number|null=null,averageViewDuration:number|null=null,raw:unknown;
   if(account.platform==='youtube'){const api=new YouTubeAdapter(token),remote=await api.status(post.remoteId);views=count(remote.statistics?.viewCount);likes=count(remote.statistics?.likeCount);comments=count(remote.statistics?.commentCount);raw=remote.statistics||{};
    if(account.scopes.includes('https://www.googleapis.com/auth/yt-analytics.readonly')){const report=await api.analytics(post.remoteId,post.publishedAt.toISOString().slice(0,10),new Date().toISOString().slice(0,10));const values:Record<string,number>={};for(let i=0;i<(report.columnHeaders||[]).length;i++)values[report.columnHeaders[i].name]=report.rows?.[0]?.[i];watchMinutes=Number.isFinite(values.estimatedMinutesWatched)?values.estimatedMinutesWatched:null;averageViewDuration=Number.isFinite(values.averageViewDuration)?values.averageViewDuration:null;shares=count(values.shares);raw={statistics:remote.statistics,analytics:report};}
   }else{invariant(account.scopes.includes('video.list'),'ANALYTICS_SCOPE','Kết nối lại TikTok để cấp quyền video.list.',403);const report=await new TikTokAdapter(token).metrics([post.remoteId]),video=report.videos?.find((v:{id:string})=>v.id===post.remoteId);invariant(video,'METRICS_NOT_FOUND','Nền tảng chưa trả số liệu video.');views=count(video.view_count);likes=count(video.like_count);comments=count(video.comment_count);shares=count(video.share_count);raw=video;}
   await db.$transaction(async tx=>{const guard=await tx.publishedPost.updateMany({where:{id:post.id,syncLeaseUntil:lease},data:{nextSyncAt:new Date(Date.now()+3600000),syncLeaseUntil:null,syncError:null}});if(!guard.count)return;const periodKey=new Date().toISOString().slice(0,13);await tx.platformMetricSnapshot.upsert({where:{postId_periodKey:{postId:post.id,periodKey}},create:{postId:post.id,periodKey,views,likes,comments,shares,watchMinutes,averageViewDuration,raw:json(raw)},update:{views,likes,comments,shares,watchMinutes,averageViewDuration,raw:json(raw),capturedAt:new Date()}});});
  }catch(e){await db.publishedPost.updateMany({where:{id:post.id,syncLeaseUntil:lease},data:{syncLeaseUntil:null,nextSyncAt:new Date(Date.now()+3600000),syncError:safeError(e)}});}
 }
}
export async function tickAnalyticsTasks(){
 const tasks=await db.automationTask.findMany({where:{kind:{in:['THUMBNAIL','RECOMMENDATIONS']},status:'QUEUED'},take:5});
 for(const task of tasks){const workerId=randomUUID(),claimed=await db.automationTask.updateMany({where:{id:task.id,status:'QUEUED'},data:{status:'RUNNING',workerId,leaseUntil:new Date(Date.now()+300000)}});if(!claimed.count)continue;
  try{const request=task.request as {jobId?:string;channelId?:string;actorId?:string};if(task.kind==='THUMBNAIL'){
   invariant(process.env.PUBLISHING_ENABLED==='true','PUBLISHING_DISABLED','Xuất bản đang tắt.');const job=await db.publishingJob.findFirst({where:{id:request.jobId,project:{workspaceId:task.workspaceId,workspace:{archivedAt:null}}},include:{project:true,account:true}});invariant(job?.remoteId&&job.consentAt&&job.project.revision===job.revision&&job.project.thumbnailKey&&!job.account.disconnectedAt,'THUMBNAIL_CONSENT','Consent thumbnail không còn hợp lệ.');const member=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:task.workspaceId,userId:job.consentBy||''}}});invariant(member&&['OWNER','REVIEWER'].includes(member.role),'FORBIDDEN','Người duyệt đã mất quyền.');await new YouTubeAdapter(await accountToken(job.account.id)).thumbnail(job.remoteId,await readAsset(job.project.thumbnailKey));await db.automationTask.updateMany({where:{id:task.id,workerId,status:'RUNNING'},data:{status:'COMPLETED',leaseUntil:null}});
   }else{
    const member=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:task.workspaceId,userId:request.actorId||''}}});invariant(member&&['OWNER','EDITOR'].includes(member.role),'FORBIDDEN','Người yêu cầu đã mất quyền.');const project=await db.videoProject.findFirst({where:{id:task.projectId!,workspaceId:task.workspaceId,workspace:{archivedAt:null}}});invariant(project,'NOT_FOUND','Không tìm thấy ngữ cảnh chi phí.');const data=await analyticsData(task.workspaceId,request.channelId),provider=(await providersFor(task.workspaceId,'LLM'))[0],schema=z.object({summary:z.string().max(2000),suggestions:z.array(z.object({hypothesis:z.string().max(1000),evidencePostIds:z.array(z.string()).min(1),experiment:z.string().max(1000)})).min(1).max(5)});
    await paidStep({projectId:project.id,workspaceId:task.workspaceId,channelId:project.channelId,providerId:provider.id,key:task.key,category:'ANALYTICS',cents:provider.scriptCostCents},()=>providerSlot(provider,async()=>{const result=await new OpenAIAdapter(provider).structured('analytics_recommendations','Suggest testable hypotheses based only on supplied observed metrics. Do not infer causality, demographics or retention data not supplied. Cite evidencePostIds. Reply in Vietnamese.',data,schema);invariant(result.suggestions.every(s=>s.evidencePostIds.every(id=>data.some(p=>p.id===id))),'ANALYTICS_EVIDENCE','Đề xuất dẫn video ngoài dữ liệu.');const guard=await db.automationTask.updateMany({where:{id:task.id,status:'RUNNING',workerId,leaseUntil:{gt:new Date()}},data:{status:'COMPLETED',result:json(result),leaseUntil:null}});invariant(guard.count,'LEASE_LOST','Task đã mất lease.');return result;}));
   }
  }catch(e){await db.automationTask.updateMany({where:{id:task.id,workerId,status:'RUNNING'},data:{status:'FAILED',error:safeError(e),leaseUntil:null}});}
 }
 await db.automationTask.updateMany({where:{kind:{in:['THUMBNAIL','RECOMMENDATIONS']},status:'RUNNING',leaseUntil:{lt:new Date()}},data:{status:'FAILED',error:'Worker interrupted; reconcile before retry.',leaseUntil:null}});
}
