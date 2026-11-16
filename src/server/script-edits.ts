import {Prisma} from '@prisma/client';
import {db} from './db';
import {Actor,authorize} from './auth';
import {canonicalHash} from './crypto';
import {saveScriptInTransaction} from './projects';
import {scriptSchema} from '../domain/schemas';
import {scriptEditRequestSchema,scriptEditResultSchema,validateScriptEdit} from '../domain/script-edits';
import {editableStatuses} from '../domain/workflow';
import {invariant} from '../domain/errors';

export async function requestScriptEdit(actor:Actor,projectId:string,value:unknown,idempotencyKey:string){
  authorize(actor);const request=scriptEditRequestSchema.parse(value);
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
    const key=actor.workspaceId+':script-edit:'+idempotencyKey;
    const previous=await tx.scriptEditJob.findUnique({where:{idempotencyKey:key}});
    if(previous){invariant(previous.projectId===projectId&&canonicalHash(previous.request)===canonicalHash(request),'IDEMPOTENCY_CONFLICT','Idempotency key đã dùng cho yêu cầu khác.',409);return previous;}
    const project=await tx.videoProject.findFirst({where:{id:projectId,workspaceId:actor.workspaceId,deletedAt:null},include:{script:true,scenes:true}});
    invariant(project?.script,'NOT_FOUND','Không tìm thấy kịch bản.',404);
    invariant(editableStatuses.includes(project.status),'BUSY','Đợi sản xuất hoàn tất trước khi yêu cầu AI sửa.',409);
    invariant(project.revision===request.expectedRevision,'VERSION_CONFLICT','Kịch bản đã thay đổi. Tải lại trước khi yêu cầu.',409);
    invariant(!await tx.scriptEditJob.findFirst({where:{projectId,status:{in:['QUEUED','RUNNING']}}}),'BUSY','Đang có yêu cầu AI sửa kịch bản.',409);
    const script=scriptSchema.parse(project.script.data),target=request.kind==='HOOKS'?1:request.kind==='SCENE'?request.sceneOrder:null;
    if(target)invariant(project.scenes.some(s=>s.sceneOrder===target&&!s.locked),'LOCKED_SCENE','Scene không tồn tại hoặc đang khóa.',409);
    if(request.kind==='RESIZE'){
      const unlocked=project.scenes.filter(s=>!s.locked),fixed=project.scenes.filter(s=>s.locked).reduce((n,s)=>n+s.duration,0);
      invariant(unlocked.length>0&&request.targetDuration>=fixed+unlocked.length,'LOCKED_DURATION','Thời lượng mới không đủ cho các scene đang khóa.',409);
      invariant(request.targetDuration!==script.target_duration,'SAME_DURATION','Chọn thời lượng khác bản hiện tại.');
    }
    const uncertain=await tx.costUsage.count({where:{projectId,category:'SCRIPT_EDIT',status:{in:['UNKNOWN','RESERVED']}}});
    invariant(!uncertain||request.allowAdditionalCost,'COST_CONFIRMATION','Lần sửa trước có chi phí chưa xác định. Cần đồng ý chi phí bổ sung.',409);
    const job=await tx.scriptEditJob.create({data:{projectId,workspaceId:actor.workspaceId,actorId:actor.userId,idempotencyKey:key,baseRevision:project.revision,request:request as Prisma.InputJsonValue}});
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'script.edit.request',entityId:job.id,details:{kind:request.kind,additionalCostConsent:request.allowAdditionalCost}}});
    return job;
  });
}
export async function listScriptEdits(actor:Actor,projectId:string){
  invariant(await db.videoProject.findFirst({where:{id:projectId,workspaceId:actor.workspaceId,deletedAt:null}}),'NOT_FOUND','Không tìm thấy video.',404);
  return db.scriptEditJob.findMany({where:{projectId,workspaceId:actor.workspaceId},orderBy:{createdAt:'desc'},take:20});
}
export async function applyScriptEdit(actor:Actor,projectId:string,jobId:string,index:number){
  authorize(actor);
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
    const job=await tx.scriptEditJob.findFirst({where:{id:jobId,projectId,workspaceId:actor.workspaceId}});
    invariant(job,'NOT_FOUND','Không tìm thấy đề xuất.',404);
    invariant(job.status==='READY','EDIT_STATE','Đề xuất đã hết hiệu lực hoặc chưa sẵn sàng.',409);
    const project=await tx.videoProject.findUniqueOrThrow({where:{id:projectId},include:{script:true,scenes:true,sources:true}});
    invariant(project.script&&project.revision===job.baseRevision,'VERSION_CONFLICT','Kịch bản đã đổi. Không thể áp dụng bản đề xuất cũ.',409);
    const result=validateScriptEdit({request:scriptEditRequestSchema.parse(job.request),script:scriptSchema.parse(project.script.data),lockedScenes:project.scenes.filter(s=>s.locked).map(s=>s.sceneOrder),sources:project.sources},scriptEditResultSchema.parse(job.result));
    invariant(Number.isInteger(index)&&index>=0&&index<result.proposals.length,'EDIT_VARIANT','Phương án không hợp lệ.');
    const updated=await saveScriptInTransaction(tx,actor,projectId,result.proposals[index].script,job.baseRevision,'AI edit: '+scriptEditRequestSchema.parse(job.request).kind);
    await tx.scriptEditJob.update({where:{id:jobId},data:{status:'APPLIED',appliedRevision:updated.revision}});
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'script.edit.apply',entityId:jobId,details:{proposal:index,revision:updated.revision}}});
    return updated;
  });
}
export async function dismissScriptEdit(actor:Actor,projectId:string,jobId:string){
  authorize(actor);
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
    const changed=await tx.scriptEditJob.updateMany({where:{id:jobId,projectId,workspaceId:actor.workspaceId,status:{in:['QUEUED','RUNNING','READY','FAILED']}},data:{status:'DISMISSED',leaseUntil:null}});
    invariant(changed.count,'EDIT_STATE','Đề xuất không còn có thể hủy.',409);return {ok:true};
  });
}
