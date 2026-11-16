import { db } from './db';
import { AppError } from '../domain/errors';
export async function paidStep<T>(input:{projectId:string;workspaceId:string;channelId:string;providerId:string;key:string;category:string;cents:number},work:()=>Promise<T>):Promise<T>{
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.channelId}))`;
    const project=await tx.videoProject.findFirst({where:{id:input.projectId,workspaceId:input.workspaceId,channelId:input.channelId,workspace:{archivedAt:null}}});if(!project)throw new AppError('BUDGET_SCOPE','Ngữ cảnh ngân sách không hợp lệ.',403);
    if(project.campaignId){const campaign=await tx.campaign.findUnique({where:{id:project.campaignId}});if(!campaign||campaign.status==='PAUSED')throw new AppError('CAMPAIGN_PAUSED','Chiến dịch đã tạm dừng hoặc kết thúc.',409);const total=await tx.costUsage.aggregate({where:{project:{campaignId:campaign.id},status:{in:['COMPLETED','RESERVED','UNKNOWN']}},_sum:{amountCents:true}});if((total._sum.amountCents||0)+input.cents>campaign.budgetCents)throw new AppError('CAMPAIGN_BUDGET','Ngân sách chiến dịch không đủ.',409);}
    const existing=await tx.costUsage.findUnique({where:{idempotencyKey:input.key}});
    if(existing && ['RESERVED','UNKNOWN','COMPLETED'].includes(existing.status)) throw new AppError('COST_RECONCILIATION','Bước này đã có chi phí/kết quả chưa khôi phục. Kiểm tra trước khi cho phép gọi lại.',409);
    const channel=await tx.contentChannel.findUniqueOrThrow({where:{id:input.channelId}});
    const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
    const spent=await tx.costUsage.aggregate({where:{project:{channelId:input.channelId},createdAt:{gte:month},status:{in:['RESERVED','UNKNOWN','COMPLETED']}},_sum:{amountCents:true}});
    if((spent._sum.amountCents||0)+input.cents>channel.budgetCents) throw new AppError('BUDGET_EXCEEDED','Ngân sách kênh không đủ. Cập nhật ngân sách trước khi chạy lại.',409);
    await tx.costUsage.upsert({where:{idempotencyKey:input.key},create:{projectId:input.projectId,workspaceId:input.workspaceId,idempotencyKey:input.key,category:input.category,amountCents:input.cents,providerId:input.providerId},update:{status:'RESERVED',amountCents:input.cents}});
  });
  try{
    const output=await work();
    await db.costUsage.update({where:{idempotencyKey:input.key},data:{status:'COMPLETED'}});return output;
  }catch(error){
    // A request timeout or invalid successful payload can still be billable. Never refund it silently.
    const rejected=error instanceof AppError && ['PROVIDER_REJECTED','PROVIDER_RATE_LIMIT','CAPABILITY'].includes(error.code);
    await db.costUsage.update({where:{idempotencyKey:input.key},data:{status:['RENDER','STORAGE'].includes(input.category)?'COMPLETED':rejected?'REJECTED':'UNKNOWN'}});
    throw error;
  }
}
