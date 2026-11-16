import {z} from 'zod';
import {rawScriptSchema,scriptSchema,ScriptData,sameScene} from './schemas';
import {invariant} from './errors';

const common={expectedRevision:z.number().int().positive(),instruction:z.string().trim().max(2000).default(''),allowAdditionalCost:z.boolean().default(false)};
export const scriptEditRequestSchema=z.discriminatedUnion('kind',[
  z.object({...common,kind:z.literal('SCENE'),sceneOrder:z.number().int().min(1).max(120)}),
  z.object({...common,kind:z.literal('HOOKS')}),
  z.object({...common,kind:z.literal('RESIZE'),targetDuration:z.number().int().min(10).max(900)})
]);
export type ScriptEditRequest=z.infer<typeof scriptEditRequestSchema>;
export const scriptEditResultSchema=z.object({proposals:z.array(z.object({label:z.string().min(1).max(120),script:rawScriptSchema})).min(1).max(3)});
export type ScriptEditResult=z.infer<typeof scriptEditResultSchema>;
export type ScriptEditInput={request:ScriptEditRequest;script:ScriptData;lockedScenes:number[];sources:{url:string;title:string;excerpt:string}[]};

// Only the requested portions may change. Metadata and provenance remain tied to the saved script.
export function validateScriptEdit(input:ScriptEditInput,value:unknown):ScriptEditResult{
  const result=scriptEditResultSchema.parse(value),base=scriptSchema.parse(input.script),request=input.request;
  invariant(result.proposals.length===(request.kind==='HOOKS'?3:1),'EDIT_VARIANTS','Số phương án AI không đúng yêu cầu.');
  const duration=request.kind==='RESIZE'?request.targetDuration:base.target_duration;
  for(const proposal of result.proposals){
    const candidate=scriptSchema.parse(proposal.script);
    invariant(candidate.target_duration===duration,'EDIT_DURATION','AI trả sai thời lượng yêu cầu.');
    invariant(candidate.scenes.length===base.scenes.length&&candidate.scenes.every((s,i)=>s.scene_id===base.scenes[i].scene_id),'EDIT_STRUCTURE','AI đã thay đổi cấu trúc scene.');
    for(const scene of candidate.scenes){
      const old=base.scenes[scene.scene_order-1];
      const editable=request.kind==='RESIZE'||scene.scene_order===(request.kind==='SCENE'?request.sceneOrder:1);
      if(input.lockedScenes.includes(scene.scene_order)||!editable)invariant(sameScene(scene,old),'LOCKED_SCENE','AI đã thay đổi scene bị khóa hoặc ngoài phạm vi.');
      if(request.kind!=='RESIZE')invariant(scene.duration_seconds===old.duration_seconds,'EDIT_DURATION','Viết lại scene không được thay đổi thời lượng.');
    }
    const allowed=new Set(input.sources.map(s=>s.url));
    invariant(candidate.source_references.every(url=>allowed.has(url)||base.source_references.includes(url)),'SOURCE_HALLUCINATION','AI trả nguồn ngoài dữ liệu đầu vào.');
    invariant(candidate.scenes.every(s=>!s.graphic?.sourceUrl||allowed.has(s.graphic.sourceUrl)||base.scenes.some(old=>old.graphic?.sourceUrl===s.graphic?.sourceUrl)),'SOURCE_HALLUCINATION','AI trả nguồn biểu đồ ngoài dữ liệu đầu vào.');
    invariant(candidate.scenes.every((s,i)=>!s.graphic||s.graphic.kind==='STEPS'||!!s.graphic.sourceUrl||JSON.stringify(s.graphic)===JSON.stringify(base.scenes[i].graphic)),'CHART_SOURCE','Số liệu mới do AI biên tập cần nguồn.');
    if(request.kind==='HOOKS')invariant(candidate.hook.length<=500&&candidate.scenes[0].narration_text.includes(candidate.hook),'EDIT_HOOK','Hook cần xuất hiện trong lời thoại scene đầu.');
    proposal.script=scriptSchema.parse({...base,scenes:candidate.scenes,target_duration:duration,
      hook:!input.lockedScenes.includes(1)&&(request.kind==='HOOKS'||request.kind==='RESIZE'||(request.kind==='SCENE'&&request.sceneOrder===1))?candidate.hook:base.hook,
      full_narration:candidate.scenes.map(s=>s.narration_text).join(' '),
      compliance_flags:[...new Set([...base.compliance_flags,...candidate.compliance_flags,'HUMAN_FACT_REVIEW',...(!input.sources.length?['UNVERIFIED_FACTS']:[])])]
    });
  }
  if(request.kind==='HOOKS')invariant(new Set(result.proposals.map(p=>p.script.hook.trim().toLowerCase())).size===3,'EDIT_VARIANTS','Các hook phải khác nhau.');
  return result;
}
