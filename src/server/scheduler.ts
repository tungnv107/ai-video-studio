import {productionSettings} from '../domain/production-settings';
import {variantSchema,variantIndex} from './analytics';
import { db } from './db';
import {scheduleMilestones,nextResearchRun} from './schedule-timing';
import { topicHash } from '../domain/workflow';
export async function tickSchedules(now=new Date(),workspaceId?:string){
  return db.$transaction(async tx=>{
    const lock=await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(7192501) AS locked`;
    if(!lock[0]?.locked) return 0;
    const rules=await tx.scheduleRule.findMany({where:{enabled:true,workspace:{archivedAt:null},nextRunAt:{lte:now},...(workspaceId?{workspaceId}:{})},include:{channel:true},take:50,orderBy:{nextRunAt:'asc'}});
    let count=0;
    for(const rule of rules){
      if(rule.runCount>=rule.maxRuns || (rule.endsAt&&rule.nextRunAt!>rule.endsAt)||rule.channel.deletedAt){
        await tx.scheduleRule.update({where:{id:rule.id},data:{enabled:false,nextRunAt:null}});continue;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rule.channelId}))`;
      let topic=rule.topic;
      if(rule.campaignId){const campaign=await tx.campaign.findFirst({where:{id:rule.campaignId,workspaceId:rule.workspaceId,channelId:rule.channelId}});if(!campaign||campaign.status==='COMPLETED'||campaign.endsAt<now){await tx.scheduleRule.update({where:{id:rule.id},data:{enabled:false,nextRunAt:null}});continue;}if(campaign.status!=='ACTIVE'||campaign.startsAt>now)continue;const videos=await tx.videoProject.findMany({where:{campaignId:campaign.id,deletedAt:null},select:{topicHash:true}}),spent=await tx.costUsage.aggregate({where:{project:{campaignId:campaign.id},status:{in:['COMPLETED','RESERVED','UNKNOWN']}},_sum:{amountCents:true}});const fresh=campaign.topics.find(t=>!videos.some(v=>v.topicHash===topicHash(t)));if(videos.length>=campaign.maxVideos||!fresh||(spent._sum.amountCents||0)>=campaign.budgetCents){await tx.campaign.update({where:{id:campaign.id},data:{status:'COMPLETED'}});await tx.scheduleRule.update({where:{id:rule.id},data:{enabled:false,nextRunAt:null}});continue;}topic=fresh;}
      const experiment=await tx.experiment.findFirst({where:{workspaceId:rule.workspaceId,channelId:rule.channelId,status:'ACTIVE'}}),variants=experiment?variantSchema.array().parse(experiment.variants):[],variant=variants.length?variants[variantIndex(rule.id+':'+rule.nextRunAt!.toISOString(),variants.length)]:null;
      const when=rule.nextRunAt!,occurrence=await tx.scheduledOccurrence.findUnique({where:{scheduleId_scheduledFor:{scheduleId:rule.id,scheduledFor:when}}});
      if(!occurrence){
        // Each occurrence requests a fresh angle; the model receives prior titles for this channel.
        const project=await tx.videoProject.create({data:{workspaceId:rule.workspaceId,channelId:rule.channelId,title:topic,topic,topicHash:topicHash(topic),campaignId:rule.campaignId,productionConfig:variant?.settings||productionSettings(rule.channel.settings),experimentId:experiment?.id,variant:variant?.label,targetDuration:rule.targetDuration,intent:rule.channel.mode==='MANUAL'?'SCRIPT':'VIDEO',status:'SCHEDULED',scheduledAt:when,productionAt:scheduleMilestones(when,rule).productionAt,deadlineAt:scheduleMilestones(when,rule).deadlineAt,publishAt:scheduleMilestones(when,rule).publishAt,jobs:{create:{idempotencyKey:'schedule:'+rule.id+':'+when.toISOString()}},occurrence:{create:{scheduleId:rule.id,scheduledFor:when}}}});
        await tx.auditLog.create({data:{workspaceId:rule.workspaceId,action:'schedule.trigger',entityId:project.id}});count++;
      }
      // Bounded catch-up: produce one missed run, then advance after now to avoid a spending burst.
      const next=nextResearchRun(rule,now);
      const enabled=!!next && rule.runCount+1<rule.maxRuns && (!rule.endsAt||next<=rule.endsAt);
      await tx.scheduleRule.update({where:{id:rule.id},data:{runCount:{increment:occurrence?0:1},nextRunAt:enabled?next:null,enabled}});
    }
    return count;
  });
}
