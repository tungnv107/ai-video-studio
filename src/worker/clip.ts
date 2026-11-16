import {productionSettings} from '../domain/production-settings';
import type {VideoProject} from '@prisma/client';
import {db} from '../server/db';
import {providersFor,providerSlot} from '../server/provider-routing';
import {paidStep} from '../server/budget';
import {MediaAdapter} from '../providers/media';
import {safeFetch} from '../server/safe-fetch';
import {putAsset} from '../server/storage';
import {AppError,invariant} from '../domain/errors';
export async function generateClip(project:VideoProject,revision:number,sceneOrder:number,prompt:string,image:Buffer|undefined,signal:AbortSignal,assertLease:()=>Promise<void>){
 const key=`${project.id}:r${revision}:s${sceneOrder}:video`;let task=await db.automationTask.findUnique({where:{key}});const providerId=(task?.request as {providerId?:string}|null)?.providerId;
 const provider=providerId?await db.aIProvider.findFirst({where:{id:providerId,workspaceId:project.workspaceId,enabled:true}}):(await providersFor(project.workspaceId,'VIDEO',productionSettings(project.productionConfig).providerIds.VIDEO))[0];invariant(provider,'PROVIDER_MISSING','Provider clip không còn hoạt động.',503);const adapter=new MediaAdapter(provider);
 if(!task)task=await db.automationTask.create({data:{workspaceId:project.workspaceId,projectId:project.id,kind:'VIDEO',key,request:{providerId:provider.id},status:'QUEUED'}});
 if(!task.remoteId){const taskId=task.id;await assertLease();await paidStep({projectId:project.id,workspaceId:project.workspaceId,channelId:project.channelId,providerId:provider.id,key,category:'VIDEO',cents:(provider.settings as {videoCostCents?:number}).videoCostCents||100},async()=>providerSlot(provider,async()=>{const remoteId=await adapter.start(prompt,project.aspectRatio,image);await db.automationTask.update({where:{id:taskId},data:{remoteId,status:'RUNNING'}});}));task=await db.automationTask.findUniqueOrThrow({where:{id:task.id}});}
 const deadline=Date.now()+10*60000;
 while(Date.now()<deadline){signal.throwIfAborted();await assertLease();const status=await providerSlot(provider,()=>adapter.status(task!.remoteId!));if(status.status==='SUCCEEDED'){invariant(status.output?.[0],'VIDEO_OUTPUT','Provider không trả clip.',502);const hosts=(process.env.GENERATED_MEDIA_ALLOWED_HOSTS||'').split(',').map(s=>s.trim());const r=await safeFetch(status.output[0],{hosts,maxBytes:250_000_000,mime:/video\/mp4|application\/octet-stream/});await assertLease();const key=`${project.workspaceId}/${project.id}/r${revision}/scene-${sceneOrder}.mp4`;await putAsset(key,r.bytes,'video/mp4');const asset=await db.generatedAsset.upsert({where:{projectId_revision_sceneOrder_kind:{projectId:project.id,revision,sceneOrder,kind:'VIDEO'}},create:{projectId:project.id,workspaceId:project.workspaceId,revision,sceneOrder,kind:'VIDEO',storageKey:key,mimeType:'video/mp4',bytes:r.bytes.length,metadata:{remoteId:task.remoteId}},update:{}});await db.automationTask.update({where:{id:task.id},data:{status:'COMPLETED'}});return asset;}
  if(['FAILED','CANCELLED'].includes(status.status)){await db.automationTask.update({where:{id:task.id},data:{status:'FAILED',error:status.failureCode||status.status}});throw new AppError('VIDEO_FAILED','Tạo clip thất bại. Remote task được giữ để đối soát.',502);}
  await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new AppError('LEASE_LOST','Công việc đã hủy.',409));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},5000);signal.addEventListener('abort',abort,{once:true});});
 }
 throw new AppError('VIDEO_PENDING','Clip vẫn đang xử lý; lần tiếp theo tiếp tục kiểm tra task hiện có.',503,true);
}
