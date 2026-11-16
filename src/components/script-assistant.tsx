'use client';
import {useCallback,useEffect,useState} from 'react';
import {Sparkles,LoaderCircle,Check,RefreshCw} from 'lucide-react';
import {ScriptData} from '@/domain/schemas';
import {ScriptEditResult,ScriptEditRequest} from '@/domain/script-edits';
import {clientApi} from './client-api';
type Job={id:string;status:string;baseRevision:number;request:ScriptEditRequest;result:ScriptEditResult|null;error:string|null;appliedRevision:number|null};
const states:Record<string,string>={QUEUED:'Đang xếp hàng',RUNNING:'AI đang biên tập',READY:'Sẵn sàng xem trước',FAILED:'Cần xử lý',STALE:'Bản gốc đã đổi',APPLIED:'Đã áp dụng',DISMISSED:'Đã bỏ qua'};
export default function ScriptAssistant({projectId,revision,script,lockedScenes,dirty,canEdit,onApplied}:{projectId:string;revision:number;script:ScriptData;lockedScenes:number[];dirty:boolean;canEdit:boolean;onApplied:()=>Promise<void>}){
  const [jobs,setJobs]=useState<Job[]>([]),[kind,setKind]=useState('SCENE'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{try{setJobs(await clientApi<Job[]>('scripts/'+projectId+'/edits'));}catch(e){setError((e as Error).message);}},[projectId]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),3000);return()=>clearInterval(timer);},[load]);
  async function perform(work:()=>Promise<unknown>){setBusy(true);setError('');try{await work();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const active=jobs.some(j=>['QUEUED','RUNNING'].includes(j.status));
  return <section className="assistant-panel" aria-label="Trợ lý biên tập AI"><div className="section-heading"><h3><Sparkles size={17}/> Trợ lý biên tập AI</h3><button className="icon-button" aria-label="Làm mới đề xuất" onClick={()=>void load()}><RefreshCw size={15}/></button></div>
    <p className="muted">AI đề xuất trên phiên bản đã lưu. Xem trước và chọn áp dụng để tạo phiên bản mới; video cũ sẽ cần dựng và duyệt lại.</p>
    {dirty&&<p className="note">Lưu các chỉnh sửa hiện tại trước khi yêu cầu hoặc áp dụng AI.</p>}
    {canEdit&&<form className="form-grid" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void perform(()=>clientApi('scripts/'+projectId+'/edits','POST',{kind,expectedRevision:revision,instruction:f.get('instruction'),allowAdditionalCost:f.get('additionalCost')==='on',...(kind==='SCENE'?{sceneOrder:Number(f.get('sceneOrder'))}:{}),...(kind==='RESIZE'?{targetDuration:Number(f.get('targetDuration'))}:{})}));}}>
      <div className="form-row"><label>Thao tác AI<select aria-label="Thao tác AI" value={kind} onChange={e=>setKind(e.target.value)}><option value="SCENE">Viết lại một scene</option><option value="HOOKS">Tạo 3 hook mở đầu</option><option value="RESIZE">Đổi thời lượng kịch bản</option></select></label>
        {kind==='SCENE'?<label>Scene cần viết lại<select name="sceneOrder" aria-label="Scene cần viết lại" defaultValue="" required><option value="" disabled>Chọn scene chưa khóa</option>{script.scenes.map(s=><option key={s.scene_id} value={s.scene_order} disabled={lockedScenes.includes(s.scene_order)}>Scene {s.scene_order}{lockedScenes.includes(s.scene_order)?' · Đã khóa':''}</option>)}</select></label>:kind==='RESIZE'?<label>Thời lượng mới (giây)<input aria-label="Thời lượng mới (giây)" name="targetDuration" type="number" min={10} max={900} defaultValue={Math.min(900,script.target_duration+15)} required/></label>:<p className="note">Scene đầu phải mở khóa. Ngân sách giữ trước bằng 3 lần mức kịch bản của provider.</p>}
      </div><label>Yêu cầu biên tập<textarea aria-label="Yêu cầu biên tập" name="instruction" rows={2} maxLength={2000} placeholder="Ví dụ: diễn đạt dễ hiểu hơn, giữ nguyên dữ kiện…"/></label>
      {jobs.length>0&&<label className="checkbox"><input name="additionalCost" type="checkbox"/>Tôi đồng ý chi phí bổ sung nếu lần trước chưa xác định kết quả.</label>}
      <button className="button primary" disabled={busy||active||dirty||(kind==='HOOKS'&&lockedScenes.includes(1))}>{busy||active?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>}Tạo đề xuất AI</button>
    </form>}
    {error&&<p role="alert" className="error-text">{error}</p>}
    <div className="proposal-list">{jobs.map(job=><article className="proposal-job" key={job.id}><div className="section-heading"><strong>{states[job.status]||job.status}</strong><small>Gốc v{job.baseRevision}{job.appliedRevision?' → v'+job.appliedRevision:''}</small></div>{job.error&&<p className="error-text">{job.error}</p>}
      {job.status==='READY'&&job.result?.proposals.map((proposal,i)=><details key={i} className="proposal"><summary>{proposal.label} · {proposal.script.target_duration}s</summary><div className="proposal-preview"><p><b>Hook:</b> {proposal.script.hook}</p>{proposal.script.scenes.map(scene=><div className="proposal-scene" key={scene.scene_id}><strong>Scene {scene.scene_order} · {scene.duration_seconds}s</strong><p>{scene.narration_text}</p><small>Hình ảnh: {scene.image_generation_prompt}</small></div>)}<p className="muted">{proposal.script.compliance_flags.join(' · ')}</p><button className="button primary" disabled={!canEdit||busy||dirty||revision!==job.baseRevision} onClick={()=>void perform(async()=>{await clientApi('scripts/'+projectId+'/edits','PATCH',{jobId:job.id,proposal:i});await onApplied();})}><Check size={15}/>Áp dụng phương án {i+1}</button></div></details>)}
      {canEdit&&['QUEUED','RUNNING','READY','FAILED'].includes(job.status)&&<button className="text-button" disabled={busy} onClick={()=>void perform(()=>clientApi('scripts/'+projectId+'/edits','DELETE',{jobId:job.id}))}>Bỏ đề xuất</button>}
    </article>)}</div>
  </section>;
}
