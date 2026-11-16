import {db} from '../server/db';
import {productionQueue,deadQueue} from '../server/queue';
export async function checkDeadlines(workspaceId?:string,now=new Date()){
  const overdue=await db.videoProject.findMany({where:{...(workspaceId?{workspaceId}:{}),workspace:{archivedAt:null},deletedAt:null,deadlineAt:{lt:now},deadlineMissedAt:null,status:{not:'CANCELLED'},OR:[{completedAt:null},{completedAt:{gt:db.videoProject.fields.deadlineAt}}]},select:{id:true,workspaceId:true,title:true,deadlineAt:true,completedAt:true},take:100});
  for(const project of overdue)await db.$transaction(async tx=>{
    const changed=await tx.videoProject.updateMany({where:{id:project.id,deadlineMissedAt:null,completedAt:project.completedAt,status:{not:'CANCELLED'}},data:{deadlineMissedAt:project.deadlineAt}});
    if(changed.count)await tx.notification.create({data:{workspaceId:project.workspaceId,title:'Video quá hạn chuẩn bị',message:project.title+' chưa hoàn tất trước deadline. Kiểm tra tiến độ và giờ đăng dự kiến.'}});
  });
}
export async function reconcile(workspaceId?:string){
  const tenant=workspaceId?{workspaceId}:{};
  await checkDeadlines(workspaceId);
  const expired=await db.productionJob.findMany({where:{...tenant,status:'RUNNING',leaseUntil:{lt:new Date()}},take:100});
  for(const job of expired){
    const exhausted=job.attempts>=3;
    const changed=await db.productionJob.updateMany({where:{id:job.id,status:'RUNNING',leaseUntil:{lt:new Date()}},data:{status:exhausted?'FAILED':'QUEUED',workerId:null,leaseUntil:null,queueVersion:{increment:1},error:'Worker lease expired; recovered from DB'}});
    if(exhausted&&changed.count){
      await db.videoProject.update({where:{id:job.projectId},data:{status:'FAILED',lastError:'Worker mất kết nối quá 3 lần. Kiểm tra trước khi thử lại.'}});
      await deadQueue().add('lease-exhausted',{jobId:job.id},{jobId:job.id+'-lease-'+job.queueVersion});
    }
  }
  const jobs=await db.productionJob.findMany({where:{...tenant,status:'QUEUED',OR:[{availableAt:null},{availableAt:{lte:new Date()}}]},take:100,orderBy:{createdAt:'asc'}});
  for(const job of jobs)await productionQueue().add('produce',{jobId:job.id},{jobId:job.id+'-'+job.queueVersion});
}
