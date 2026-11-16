import {describe,it,expect} from 'vitest';
import {nextResearchRun,researchTime,scheduleMilestones} from '../../src/server/schedule-timing';
import {scheduleSchema,ideaSchema} from '../../src/domain/schemas';
const rule={anchor:'PUBLISH',cron:'0 12 * * *',timezone:'Asia/Ho_Chi_Minh',publishDelayMinutes:270,productionDelayMinutes:30,approvalBufferMinutes:30};
describe('Schedule preparation and idea contracts',()=>{
 it('works backwards from publishing time and reserves the approval buffer',()=>{
  const research=researchTime(new Date('2026-11-17T05:00:00Z'),rule),plan=scheduleMilestones(research,rule);
  expect(research.toISOString()).toBe('2026-11-17T00:30:00.000Z');
  expect(plan.productionAt.toISOString()).toBe('2026-11-17T01:00:00.000Z');
  expect(plan.deadlineAt.toISOString()).toBe('2026-11-17T04:30:00.000Z');
  expect(plan.publishAt.toISOString()).toBe('2026-11-17T05:00:00.000Z');
 });
 it('advances by the cron anchor and skips a preparation window that has already started',()=>{
  expect(nextResearchRun(rule,new Date('2026-11-17T00:00:00Z'))?.toISOString()).toBe('2026-11-17T00:30:00.000Z');
  expect(nextResearchRun(rule,new Date('2026-11-17T01:00:00Z'))?.toISOString()).toBe('2026-11-18T00:30:00.000Z');
 });
 it('preserves a local publishing hour across the DST boundary',()=>{
  const ny={...rule,timezone:'America/New_York'},before=nextResearchRun(ny,new Date('2026-10-31T00:00:00Z'))!,after=nextResearchRun(ny,new Date('2026-11-01T00:00:00Z'))!;
  expect(+after-+before).toBe(25*3600000);
  expect(new Intl.DateTimeFormat('en-US',{timeZone:ny.timezone,hour:'numeric',hour12:false}).format(scheduleMilestones(after,ny).publishAt)).toBe('12');
 });
 it('rejects an impossible production window while keeping legacy inputs compatible',()=>{
  const input={channelId:'channel',name:'Test',topic:'Test',cron:'0 12 * * *'};
  expect(scheduleSchema.parse({...input,publishDelayMinutes:15}).productionDelayMinutes).toBe(0);
  expect(scheduleSchema.safeParse({...input,productionDelayMinutes:240,approvalBufferMinutes:30}).success).toBe(false);
 });
 it('rejects missing idea assessments and scores outside their bounds',()=>{
  expect(ideaSchema.safeParse({ideas:[{title:'Idea',angle:'Angle',hook:'Hook',priority:80,sourceUrls:[]}]}).success).toBe(false);
  expect(ideaSchema.safeParse({ideas:[{title:'Idea',problem:'Problem',angle:'Angle',hook:'Hook',audience:'Audience',channelFit:101,feasibility:80,feasibilityReason:'Reason',priority:80,sourceUrls:[]}]}).success).toBe(false);
 });
});
