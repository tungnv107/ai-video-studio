import { Prisma } from '@prisma/client';
import { db } from '../server/db';
import { accountToken } from '../server/oauth';
import { publishSchema } from '../server/social';
import { decrypt,encrypt,canonicalHash } from '../server/crypto';
import { readAsset } from '../server/storage';
import { YouTubeAdapter,TikTokAdapter,youtubeState } from '../providers/social';
import { invariant,safeError } from '../domain/errors';
import { log } from '../server/logger';
export async function tickPublishing(){
  if(process.env.PUBLISHING_ENABLED!=='true')return;
  // An interrupted upload is never restarted without inspecting its recorded remote/session state.
  await db.publishingJob.updateMany({where:{status:'UPLOADING',updatedAt:{lt:new Date(Date.now()-15*60000)}},data:{status:'RECONCILIATION_REQUIRED',error:'Worker bị gián đoạn. Đối soát upload trước khi tiếp tục.'}});
  const ready=await db.publishingJob.findMany({where:{status:'READY_TO_PUBLISH',scheduledAt:{lte:new Date()}},take:10,include:{project:true,account:true}});
  for(const job of ready){
    const claimed=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${job.project.workspaceId}))`;if(!await tx.workspace.findFirst({where:{id:job.project.workspaceId,archivedAt:null}}))return {count:0};return tx.publishingJob.updateMany({where:{id:job.id,status:'READY_TO_PUBLISH'},data:{status:'UPLOADING'}});});if(!claimed.count)continue;
    try{
      const data=publishSchema.parse(job.settings),membership=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:job.project.workspaceId,userId:job.consentBy||''}}});
      invariant(membership&&['OWNER','REVIEWER'].includes(membership.role),'CONSENT_REVOKED','Người phê duyệt không còn quyền xuất bản.',403);
      invariant(job.consentAt&&!job.account.disconnectedAt&&job.project.status==='APPROVED'&&job.project.outputKey&&job.project.revision===job.revision,'STALE_CONSENT','Consent/phiên bản/tài khoản không còn hợp lệ.',409);
      invariant(job.consentHash===canonicalHash({revision:job.revision,key:job.project.outputKey,settings:job.settings,accountId:job.account.id}),'CONSENT_HASH','Nội dung hoặc thiết lập đã thay đổi sau khi đồng ý.',409);
      const bytes=await readAsset(job.project.outputKey),token=await accountToken(job.account.id);
      if(job.account.platform==='youtube'){
        const api=new YouTubeAdapter(token);let session=job.uploadSession?decrypt(job.uploadSession):null;
        if(!session){
          session=await api.initialize(data,bytes.length);
          await db.publishingJob.update({where:{id:job.id},data:{uploadSession:encrypt(session)}});
        }
        await accountToken(job.account.id); // Re-check revocation immediately before the external write.
        const uploaded=await api.resume(session,bytes);invariant(uploaded.id,'REMOTE_ID','YouTube chưa trả video ID.',502);
        await db.publishingJob.update({where:{id:job.id},data:{remoteId:uploaded.id,status:'PLATFORM_PROCESSING',error:null}});
        if(data.uploadThumbnail&&job.project.thumbnailKey)await db.automationTask.upsert({where:{key:'thumbnail:'+job.id},create:{workspaceId:job.project.workspaceId,projectId:job.project.id,kind:'THUMBNAIL',key:'thumbnail:'+job.id,request:{jobId:job.id}},update:{}});
      }else{
        const api=new TikTokAdapter(token),creator=data.mode==='DIRECT'?await api.creator():undefined;
        if(creator)invariant(Number((job.project.qaReport as {duration?:number}|null)?.duration||job.project.targetDuration)<=creator.max_video_post_duration_sec,'TIKTOK_DURATION','Video vượt giới hạn tài khoản.');
        const initialized=job.remoteId&&job.uploadSession?{publish_id:job.remoteId,upload_url:decrypt(job.uploadSession)}:await api.initialize({...data,size:bytes.length},creator);
        await db.publishingJob.update({where:{id:job.id},data:{remoteId:initialized.publish_id,uploadSession:encrypt(initialized.upload_url)}});
        const progress=await db.automationTask.upsert({where:{key:'upload:'+job.id},create:{workspaceId:job.project.workspaceId,projectId:job.project.id,kind:'UPLOAD',key:'upload:'+job.id,request:{offset:0}},update:{}});
        await accountToken(job.account.id);await api.upload(initialized.upload_url,bytes,(progress.request as {offset:number}).offset,async offset=>{await db.automationTask.update({where:{id:progress.id},data:{request:{offset},status:offset===bytes.length?'COMPLETED':'RUNNING'}});});
        await db.publishingJob.update({where:{id:job.id},data:{status:'PLATFORM_PROCESSING',error:null}});
      }
    }catch(error){await db.publishingJob.update({where:{id:job.id},data:{status:'RECONCILIATION_REQUIRED',error:safeError(error)}});}
  }
  const pending=await db.publishingJob.findMany({where:{status:{in:['PLATFORM_PROCESSING','PLATFORM_SCHEDULED','AWAITING_USER_POST']},remoteId:{not:null},updatedAt:{lt:new Date(Date.now()-30000)}},take:30,include:{project:true,account:true}});
  for(const job of pending)try{
    const token=await accountToken(job.account.id);let state:string,publicId:string|undefined,url:string|undefined,raw:unknown;
    if(job.account.platform==='youtube'){
      const remote=await new YouTubeAdapter(token).status(job.remoteId!);raw=remote;state=youtubeState(remote);
      if(state==='PUBLISHED'){publicId=job.remoteId!;url='https://www.youtube.com/watch?v='+publicId;}
    }else{
      const remote=await new TikTokAdapter(token).status(job.remoteId!);raw=remote;
      const ids=remote.publicaly_available_post_id||[];
      state=remote.status==='FAILED'?'FAILED':remote.status==='SEND_TO_USER_INBOX'?'AWAITING_USER_POST':remote.status==='PUBLISH_COMPLETE'?(ids.length?'PUBLISHED':'POSTED_NONPUBLIC'):'PLATFORM_PROCESSING';
      if(ids.length){publicId=String(ids[0]);url='https://www.tiktok.com/player/v1/'+publicId;}
    }
    await db.publishingJob.update({where:{id:job.id},data:{status:state}});
    if(publicId&&url){
      const post=await db.publishedPost.upsert({where:{publishingJobId:job.id},create:{publishingJobId:job.id,remoteId:publicId,url,publishedAt:new Date()},update:{}});
      const statistics=(raw as {statistics?:{viewCount?:string;likeCount?:string;commentCount?:string}}).statistics;
      await db.platformMetricSnapshot.create({data:{postId:post.id,views:statistics?.viewCount?BigInt(statistics.viewCount):null,likes:statistics?.likeCount?BigInt(statistics.likeCount):null,comments:statistics?.commentCount?BigInt(statistics.commentCount):null,raw:raw as Prisma.InputJsonValue}});
      await db.notification.create({data:{workspaceId:job.project.workspaceId,title:'Nền tảng xác nhận đã công khai',message:job.project.title}});
    }
  }catch{log.warn({publishingJobId:job.id},'publishing_status_check_failed');}
}
