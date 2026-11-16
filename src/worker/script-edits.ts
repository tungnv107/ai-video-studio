import {productionSettings} from '../domain/production-settings';
import {providerSlot,providersFor} from '../server/provider-routing';
import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {db} from '../server/db';
import {paidStep} from '../server/budget';
import {scriptEditQueue,deadQueue} from '../server/queue';
import {OpenAIAdapter} from '../providers/openai';
import {scriptSchema} from '../domain/schemas';
import {scriptEditRequestSchema,validateScriptEdit} from '../domain/script-edits';
import {invariant,AppError,safeError} from '../domain/errors';

export async function runScriptEdit(id:string){
  const workerId=randomUUID();
  const claimed=await db.scriptEditJob.updateMany({where:{id,status:{in:['QUEUED','RUNNING']},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{status:'RUNNING',workerId,attempts:{increment:1},leaseUntil:new Date(Date.now()+120000)}});
  if(!claimed.count)return;
  const job=await db.scriptEditJob.findUniqueOrThrow({where:{id}});
  const heartbeat=setInterval(()=>void db.scriptEditJob.updateMany({where:{id,workerId,status:'RUNNING'},data:{leaseUntil:new Date(Date.now()+120000)}}).catch(()=>{}),20000);
  try{
    const project=await db.videoProject.findUniqueOrThrow({where:{id:job.projectId},include:{script:true,scenes:true,sources:true,channel:true}});
    invariant(project.script&&!project.deletedAt&&!project.channel.deletedAt,'NOT_FOUND','Kịch bản không còn tồn tại.',404);
    invariant(project.revision===job.baseRevision,'VERSION_CONFLICT','Kịch bản đã thay đổi trước khi AI bắt đầu.',409);
    const member=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:job.workspaceId,userId:job.actorId}}});
    invariant(member&&['OWNER','EDITOR'].includes(member.role),'FORBIDDEN','Người yêu cầu không còn quyền biên tập.',403);
    const settings=(await providersFor(job.workspaceId,'LLM',productionSettings(project.productionConfig||project.channel.settings).providerIds.LLM))[0];
    invariant(settings,'PROVIDER_MISSING','Cần cấu hình provider AI trước khi sửa kịch bản.',503);
    const input={request:scriptEditRequestSchema.parse(job.request),script:scriptSchema.parse(project.script.data),lockedScenes:project.scenes.filter(s=>s.locked).map(s=>s.sceneOrder),sources:project.sources};
    invariant(await db.scriptEditJob.findFirst({where:{id,workerId,status:'RUNNING',leaseUntil:{gt:new Date()}}}),'LEASE_LOST','Yêu cầu đã bị hủy hoặc mất lease.',409);
    await paidStep({projectId:project.id,workspaceId:project.workspaceId,channelId:project.channelId,providerId:settings.id,key:project.id+':edit:'+id,category:'SCRIPT_EDIT',cents:settings.scriptCostCents*(input.request.kind==='HOOKS'?3:1)},async()=>{
      const result=validateScriptEdit(input,await providerSlot(settings,()=>new OpenAIAdapter(settings).editScript(input)));
      await db.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${project.id}))`;
        const current=await tx.videoProject.findUniqueOrThrow({where:{id:project.id},include:{scenes:true}});
        invariant(current.revision===job.baseRevision&&!current.deletedAt&&current.status!=='CANCELLED','VERSION_CONFLICT','Bản gốc đã thay đổi. Đề xuất không được lưu.',409);
        validateScriptEdit({...input,lockedScenes:current.scenes.filter(s=>s.locked).map(s=>s.sceneOrder)},result);
        const guard=await tx.scriptEditJob.updateMany({where:{id,workerId,status:'RUNNING',leaseUntil:{gt:new Date()}},data:{status:'READY',result:result as unknown as Prisma.InputJsonValue,leaseUntil:null,error:null}});
        invariant(guard.count,'LEASE_LOST','Yêu cầu bị hủy hoặc worker mất quyền xử lý.',409);
        await tx.notification.create({data:{workspaceId:job.workspaceId,title:'Đề xuất sửa kịch bản đã sẵn sàng',message:project.title+' · xem trước và chọn áp dụng.'}});
      });return result;
    });
  }catch(error){
    const retryable=error instanceof AppError&&error.retryable&&job.attempts<3;
    await db.scriptEditJob.updateMany({where:{id,workerId,status:'RUNNING'},data:{status:retryable?'QUEUED':error instanceof AppError&&error.code==='VERSION_CONFLICT'?'STALE':'FAILED',leaseUntil:null,error:safeError(error)}});
    throw error;
  }finally{clearInterval(heartbeat);}
}
export async function reconcileScriptEdits(workspaceId?:string){
  const tenant=workspaceId?{workspaceId}:{};
  const expired=await db.scriptEditJob.findMany({where:{...tenant,status:'RUNNING',leaseUntil:{lt:new Date()}},take:100});
  for(const job of expired){
    const exhausted=job.attempts>=3;
    const changed=await db.scriptEditJob.updateMany({where:{id:job.id,status:'RUNNING',leaseUntil:{lt:new Date()}},data:{status:exhausted?'FAILED':'QUEUED',workerId:null,leaseUntil:null,queueVersion:{increment:1},error:'Worker lease expired'}});
    if(exhausted&&changed.count)await deadQueue().add('script-edit-lease',{scriptEditId:job.id},{jobId:'edit-'+job.id+'-'+job.queueVersion});
  }
  const jobs=await db.scriptEditJob.findMany({where:{...tenant,status:'QUEUED'},take:100,orderBy:{createdAt:'asc'}});
  for(const job of jobs)await scriptEditQueue().add('edit',{jobId:job.id},{jobId:job.id+'-'+job.queueVersion});
}
