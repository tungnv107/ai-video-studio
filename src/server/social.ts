import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { Actor,authorize,audit } from './auth';
import { startOAuth,finishOAuth,accountToken,disconnectSocialAccount,Platform } from './oauth';
import { TikTokAdapter,platformFetch,tiktokChunks } from '../providers/social';
import { invariant } from '../domain/errors';
import { canonicalHash,decrypt } from './crypto';
import {readAsset} from './storage';
import {productionSettings} from '../domain/production-settings';
import {readOAuthApp,changeOAuthApp} from './oauth-apps';
export const publishSchema=z.object({
  projectId:z.string(),accountId:z.string(),revision:z.number().int(),title:z.string().min(1).max(100),
  description:z.string().max(4500).default(''),tags:z.array(z.string().max(50)).max(30).default([]),
  privacy:z.string().min(1),mode:z.enum(['DIRECT','UPLOAD']).default('DIRECT'),publishAt:z.string().datetime().optional(),
  disableComment:z.boolean().default(true),disableDuet:z.boolean().default(true),disableStitch:z.boolean().default(true),
  uploadThumbnail:z.boolean().default(false),synthetic:z.literal(true),madeForKids:z.boolean(),brandContent:z.boolean().default(false),brandOrganic:z.boolean().default(false),
  previewed:z.literal(true),consent:z.literal(true),musicRights:z.literal(true)
});
export async function socialRoute(request:NextRequest,path:string[],actor:Actor,getBody:()=>Promise<unknown>){
  const [resource,id,action]=path,method=request.method;
  if(resource==='integrations'){
    const platform=z.enum(['youtube','tiktok']).parse(id);
    if(action==='app'){
      const headers={'Cache-Control':'no-store'};
      if(method==='GET')return NextResponse.json(await readOAuthApp(actor,platform),{headers});
      if(method==='PUT'||method==='DELETE')return NextResponse.json(await changeOAuthApp(actor,platform,await getBody(),method==='DELETE'),{headers});
      invariant(false,'METHOD','Phương thức không hỗ trợ.',405);
    }
    if(action==='connect'&&method==='POST'){authorize(actor,['OWNER']);return NextResponse.json({url:await startOAuth(actor,platform)});}
    if(action==='callback'&&method==='GET'){
      authorize(actor,['OWNER']);const state=request.nextUrl.searchParams.get('state'),code=request.nextUrl.searchParams.get('code');invariant(state&&code,'OAUTH_CALLBACK','OAuth không trả code/state.');
      const account=await finishOAuth(actor,platform,state,code);await audit(actor,'oauth.connected',account.id);return NextResponse.redirect(config.appUrl+'/?view=connections');
    }
    const accountId=request.nextUrl.searchParams.get('accountId');invariant(accountId,'ACCOUNT','Cần accountId.');
    const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:actor.workspaceId,platform},include:{credential:true}});invariant(account,'NOT_FOUND','Không tìm thấy tài khoản.',404);
    if(action==='creator'&&method==='GET'&&platform==='tiktok')return NextResponse.json(await new TikTokAdapter(await accountToken(accountId)).creator());
    if(action==='disconnect'&&method==='POST'){
      authorize(actor,['OWNER']);
      const result=await disconnectSocialAccount(actor,platform,accountId);await audit(actor,'oauth.disconnected',accountId);return NextResponse.json(result);
    }
  }
  if(resource==='publishing'){
    authorize(actor,['OWNER','REVIEWER']);
    if(!id&&method==='POST'){
      invariant(process.env.PUBLISHING_ENABLED==='true','PUBLISHING_DISABLED','Xuất bản API chưa được bật. Bạn có thể tải MP4 và caption.',409);
      const data=publishSchema.parse(await getBody());
      const project=await db.videoProject.findFirst({where:{id:data.projectId,workspaceId:actor.workspaceId},include:{script:true}}),account=await db.socialAccount.findFirst({where:{id:data.accountId,workspaceId:actor.workspaceId,disconnectedAt:null}});
      invariant(project?.status==='APPROVED'&&project.outputKey&&project.revision===data.revision,'APPROVAL_REQUIRED','Cần duyệt đúng phiên bản video.',409);invariant(account,'ACCOUNT','Tài khoản chưa kết nối.',409);
      if(data.publishAt)invariant(new Date(data.publishAt)>new Date(Date.now()+60000),'PUBLISH_DATE','Thời điểm đăng phải ở tương lai.');
      if(account.platform==='youtube'){invariant(account.scopes.includes('https://www.googleapis.com/auth/youtube.upload'),'SCOPE','Thiếu quyền YouTube upload.',403);invariant(['public','private','unlisted'].includes(data.privacy),'PRIVACY','Quyền riêng tư YouTube không hợp lệ.');if(data.publishAt)invariant(data.privacy==='private','PRIVACY','Hẹn lịch YouTube cần private.');}
      else{
        invariant(!productionSettings(project.productionConfig).logoMediaId,'TIKTOK_BRANDING','Tạo phiên bản TikTok không có logo quảng bá, xem và duyệt lại trước khi gửi.',409);
        invariant(account.scopes.includes(data.mode==='DIRECT'?'video.publish':'video.upload'),'SCOPE','Thiếu quyền TikTok cần thiết.',403);
        if(data.mode==='DIRECT'){
          invariant(process.env.TIKTOK_DIRECT_POST_ENABLED==='true','DIRECT_POST_DISABLED','Ứng dụng chưa bật Direct Post.',409);
          const creator=await new TikTokAdapter(await accountToken(account.id)).creator();
          invariant(creator.privacy_level_options.includes(data.privacy),'PRIVACY','Chọn mức riêng tư từ creator_info mới.');
          invariant(Number((project.qaReport as {duration?:number}|null)?.duration||project.targetDuration)<=creator.max_video_post_duration_sec,'DURATION','Video vượt giới hạn TikTok.');
        }
      }
      const settings=data as unknown as Prisma.InputJsonValue,hash=canonicalHash({revision:data.revision,key:project.outputKey,settings,accountId:account.id});
      const prior=await db.publishingJob.findFirst({where:{projectId:project.id,socialAccountId:account.id,revision:data.revision,status:{notIn:['CANCELLED','FAILED']}}});invariant(!prior,'DUPLICATE_PUBLISH','Phiên bản này đã có yêu cầu đăng cho tài khoản.',409);
      const job=await db.publishingJob.create({data:{projectId:project.id,socialAccountId:account.id,revision:data.revision,idempotencyKey:hash,consentHash:hash,consentAt:new Date(),consentBy:actor.userId,settings,status:'READY_TO_PUBLISH',scheduledAt:account.platform==='tiktok'&&data.publishAt?new Date(data.publishAt):new Date()}});
      await audit(actor,'publishing.consent',job.id);return NextResponse.json({id:job.id,status:job.status},{status:202});
    }
    const job=await db.publishingJob.findFirst({where:{id,project:{workspaceId:actor.workspaceId}},include:{project:true,account:true}});invariant(job,'NOT_FOUND','Không tìm thấy publishing job.',404);
    if(method==='POST'&&action==='cancel'){invariant(['READY_TO_PUBLISH','AWAITING_APPROVAL'].includes(job.status),'REMOTE_IN_PROGRESS','Upload đã bắt đầu; quản lý trực tiếp trên nền tảng.',409);await db.publishingJob.update({where:{id},data:{status:'CANCELLED',consentAt:null}});return NextResponse.json({ok:true});}
    if(method==='POST'&&action==='reconcile'){
      invariant(job.status==='RECONCILIATION_REQUIRED','STATE','Chỉ đối soát công việc cần xử lý.',409);invariant(job.remoteId||job.uploadSession,'NO_REMOTE_REFERENCE','Chưa có remote ID/session; kiểm tra trực tiếp tài khoản.',409);
      let status=job.remoteId?'PLATFORM_PROCESSING':'READY_TO_PUBLISH';
      if(job.account.platform==='tiktok'&&job.remoteId){const remote=await new TikTokAdapter(await accountToken(job.account.id)).status(job.remoteId);invariant(remote.status!=='FAILED','REMOTE_FAILED','Nền tảng đã từ chối upload; giữ hồ sơ để kiểm tra và tạo consent mới.',409);if(remote.status==='PROCESSING_UPLOAD'){invariant(job.uploadSession&&job.project.outputKey,'UPLOAD_SESSION','Không có upload session.',409);const bytes=await readAsset(job.project.outputKey),offset=remote.uploaded_bytes;invariant(Number.isSafeInteger(offset)&&offset>=0&&(offset===bytes.length||tiktokChunks(bytes.length).chunks.some(c=>c.start===offset)),'UPLOAD_OFFSET','Nền tảng chưa trả offset hợp lệ; thử đối soát lại sau.',409);await db.automationTask.upsert({where:{key:'upload:'+id},create:{workspaceId:actor.workspaceId,projectId:job.projectId,kind:'UPLOAD',key:'upload:'+id,request:{offset}},update:{request:{offset}}});status=offset===bytes.length?'PLATFORM_PROCESSING':'READY_TO_PUBLISH';}}
      const changed=await db.publishingJob.updateMany({where:{id,status:'RECONCILIATION_REQUIRED'},data:{status,error:null}});invariant(changed.count,'STATE','Công việc đã đổi trạng thái.',409);await audit(actor,'publishing.reconciled',id);return NextResponse.json({ok:true,status});}
    if(method==='POST'&&action==='thumbnail'){invariant(job.account.platform==='youtube'&&job.remoteId&&job.project.thumbnailKey&&(job.settings as {uploadThumbnail?:boolean}).uploadThumbnail,'THUMBNAIL_CONSENT','Chưa có consent thumbnail cho video này.',409);const changed=await db.automationTask.updateMany({where:{key:'thumbnail:'+id,status:'FAILED'},data:{status:'QUEUED',error:null,leaseUntil:null}});invariant(changed.count,'STATE','Không có thumbnail bị lỗi để thử lại.',409);return NextResponse.json({ok:true});}
  }
  return NextResponse.json({error:{code:'NOT_FOUND',message:'Endpoint không tồn tại.'}},{status:404});
}
