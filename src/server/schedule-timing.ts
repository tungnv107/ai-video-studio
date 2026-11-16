import {nextRun} from '../domain/workflow';

type Timing={publishDelayMinutes:number;productionDelayMinutes:number;approvalBufferMinutes:number};
type Rule=Timing&{anchor:string;cron:string|null;timezone:string};

export function scheduleMilestones(researchAt:Date,rule:Timing){
  const publishAt=new Date(+researchAt+rule.publishDelayMinutes*60000);
  return {researchAt,productionAt:new Date(+researchAt+rule.productionDelayMinutes*60000),deadlineAt:new Date(+publishAt-rule.approvalBufferMinutes*60000),publishAt};
}
export function researchTime(anchorAt:Date,rule:Pick<Rule,'anchor'|'publishDelayMinutes'>){
  return new Date(+anchorAt-(rule.anchor==='PUBLISH'?rule.publishDelayMinutes*60000:0));
}
export function nextResearchRun(rule:Rule,after:Date){
  if(!rule.cron)return null;
  const offset=rule.anchor==='PUBLISH'?rule.publishDelayMinutes*60000:0;
  return new Date(+nextRun(rule.cron,rule.timezone,new Date(+after+offset))-offset);
}
