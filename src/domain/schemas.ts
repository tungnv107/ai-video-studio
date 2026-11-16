import {graphicSchema} from './graphics';
import { z } from 'zod';
const text = z.string().trim().min(1);
export const sourceSchema = z.object({ url: z.string().url().max(2000), title: text.max(300), excerpt: text.max(10000) });
export const sceneSchema = z.object({
  scene_id: text, scene_order: z.number().int().min(1), duration_seconds: z.number().min(1).max(900),
  narration_text: text.max(2500), visual_description: text.max(2000),
  image_generation_prompt: text.max(3000), video_generation_prompt: z.string().max(3000),
  camera_motion: z.enum(['zoom-in','zoom-out','static','pan-left','pan-right','pan-up','pan-down','parallax']), transition: z.enum(['cut','fade','template']), graphic:graphicSchema.nullable().optional(),
  on_screen_text: z.string().max(150),
  subtitle_segments: z.array(z.object({ text: text, start: z.number().min(0), end: z.number().positive() })),
  background_music_hint: z.string(), visual_asset_source: z.string()
});
export const rawScriptSchema = z.object({
  script_id: text, title: text.max(150), topic: text.max(500), target_audience: text,
  language: z.enum(['vi','en']), target_duration: z.number().int().min(10).max(900),
  tone: text, hook: text, full_narration: text.max(100000), scenes: z.array(sceneSchema).min(1).max(120),
  closing_cta: text, source_references: z.array(z.string().url()), compliance_flags: z.array(z.string()),
  estimated_cost: z.number().min(0)
});
export const scriptSchema = rawScriptSchema.superRefine((s, ctx) => {
  const total = s.scenes.reduce((n, scene) => n + scene.duration_seconds, 0);
  if (Math.abs(total - s.target_duration) > 1) ctx.addIssue({ code: 'custom', message: 'Tổng thời lượng scene phải bằng thời lượng mục tiêu (±1 giây).' });
  if (s.scenes.some((x,i) => x.scene_order !== i+1)) ctx.addIssue({ code: 'custom', message: 'Thứ tự scene phải liên tục từ 1.' });
  if (new Set(s.scenes.map(x=>x.scene_id)).size !== s.scenes.length) ctx.addIssue({ code:'custom', message:'Scene ID không được trùng.' });
  for (const scene of s.scenes) for (const seg of scene.subtitle_segments) {
    if (seg.end <= seg.start || seg.end > scene.duration_seconds) ctx.addIssue({ code:'custom',message:'Timestamp phụ đề ngoài scene.' });
  }
});
export type ScriptData = z.infer<typeof rawScriptSchema>;
export function sameScene(a:ScriptData['scenes'][number]|undefined,b:ScriptData['scenes'][number]|undefined){
  if(!a||!b)return a===b;
  const {graphic:graphicA,...restA}=a,{graphic:graphicB,...restB}=b;
  return JSON.stringify({...restA,graphic:graphicA??null})===JSON.stringify({...restB,graphic:graphicB??null});
}
// New provider responses include explicit null; saved scripts from older versions remain valid.
export const providerScriptSchema=rawScriptSchema.extend({scenes:z.array(sceneSchema.extend({graphic:graphicSchema.nullable()})).min(1).max(120)});
export const channelSchema = z.object({
  name: text.max(100), topic: text.max(500), description: z.string().max(2000).default(''),
  audience: text.max(200).default('Người xem 18–35 tuổi'), language: z.enum(['vi','en']).default('vi'),
  tone: text.max(200).default('Giáo dục, dễ hiểu'), mode: z.enum(['MANUAL','SEMI_AUTO','AUTO']).default('MANUAL'),
  budgetCents: z.number().int().min(0).max(1000000).default(2000), dedupeDays: z.union([z.literal(7),z.literal(30),z.literal(60),z.literal(90)]).default(30),
  voice: z.enum(['alloy','ash','coral','echo','fable','nova','onyx','sage','shimmer']).default('alloy'),
  template: text.max(80).default('modern-tech')
});
export const providerSchema = z.object({
  name: text.max(100), kind: z.enum(['OPENAI','OPENAI_COMPATIBLE','RUNWAY','ELEVENLABS','BRAVE']).default('OPENAI'),
  baseUrl: z.string().url().default('https://api.openai.com/v1'), apiKey: text.max(500),
  llmModel: text.max(100).default('gpt-4.1-mini'), imageModel: text.max(100).default('gpt-image-2.5-flare'), ttsModel: text.max(100).default('gpt-4o-mini-tts'),
  timeoutMs: z.number().int().min(1000).max(300000).default(120000),
  concurrency:z.number().int().min(1).max(20).default(1),priority:z.number().int().min(0).max(100).default(50),requestsPerMinute:z.number().int().min(1).max(1000).default(60),settings:z.object({embeddingModel:z.string().max(100).optional(),videoModel:z.enum(['gen4.5']).optional(),clipDuration:z.number().int().min(2).max(10).optional(),videoCostCents:z.number().int().min(1).max(10000).optional(),alignmentCostCents:z.number().int().min(1).max(10000).optional()}).default({}),
  scriptCostCents: z.number().int().min(1).max(10000).default(5),
  imageCostCents: z.number().int().min(1).max(10000).default(10),
  ttsCostCents: z.number().int().min(1).max(10000).default(3)
});
export const videoInputSchema = z.object({
  channelId: text, topic: text.max(500), targetDuration: z.number().int().min(10).max(900).default(45),
  aspectRatio: z.enum(['9:16','16:9','1:1']).default('9:16'), quality: z.enum(['ECONOMY','BALANCED','PREMIUM']).default('BALANCED'),
  campaignId:z.string().optional(),intent: z.enum(['SCRIPT','VIDEO','IDEAS']).default('VIDEO'), sources: z.array(sourceSchema).max(10).default([])
});
export const scheduleSchema = z.object({
  channelId: text, name: text.max(100), topic: text.max(500),
  campaignId:z.string().optional(),cron: z.string().max(100).optional(), runAt: z.string().datetime().optional(),
  timezone: text.refine(value=>{try{new Intl.DateTimeFormat('vi-VN',{timeZone:value});return true;}catch{return false;}},'Múi giờ không hợp lệ.').default('Asia/Ho_Chi_Minh'), endsAt: z.string().datetime().optional(),
  targetDuration: z.number().int().min(10).max(900).default(45),
  maxRuns: z.number().int().min(1).max(1000).default(30),
  publishDelayMinutes: z.number().int().min(15).max(43200).default(270),
  anchor:z.enum(['RESEARCH','PUBLISH']).default('RESEARCH'),
  productionDelayMinutes:z.number().int().min(0).max(43199).default(0),
  approvalBufferMinutes:z.number().int().min(1).max(43199).default(5)
}).refine(x => Boolean(x.cron) !== Boolean(x.runAt), 'Cần chọn cron hoặc thời điểm chạy một lần.')
  .refine(x=>x.productionDelayMinutes+x.approvalBufferMinutes<x.publishDelayMinutes,'Thời gian nghiên cứu và duyệt phải chừa thời gian sản xuất trước giờ đăng.');
export const ideaSchema = z.object({ ideas: z.array(z.object({
  title:text.max(150), problem:text.max(500), angle:text.max(500), hook:text.max(500), audience:text.max(200),
  channelFit:z.number().int().min(0).max(100),feasibility:z.number().int().min(0).max(100),feasibilityReason:text.max(500),
  sourceUrls:z.array(z.string().url()), priority:z.number().int().min(0).max(100)
})).min(1).max(10) });
