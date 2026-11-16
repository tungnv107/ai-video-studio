import {db} from './db';
import {productionSettings} from '../domain/production-settings';
import {scriptSchema} from '../domain/schemas';
import {invariant} from '../domain/errors';
export async function estimateProject(workspaceId:string,id:string){
 const p=await db.videoProject.findFirst({where:{id,workspaceId},include:{channel:true,script:true,assets:true}});invariant(p,'NOT_FOUND','Không tìm thấy video.',404);
 const config=productionSettings(p.productionConfig||p.channel.settings),scenes=p.script?scriptSchema.parse(p.script.data).scenes.length:Math.max(3,Math.ceil(p.targetDuration/12));
 const providers=await db.aIProvider.findMany({where:{workspaceId,enabled:true},orderBy:{priority:'asc'}}),llm=providers.find(p=>p.id===config.providerIds.LLM)||providers.find(p=>['OPENAI','OPENAI_COMPATIBLE'].includes(p.kind)),ai=providers.find(p=>p.id===config.providerIds.IMAGE)||providers.find(p=>p.kind==='OPENAI'),tts=providers.find(p=>p.id===config.providerIds.TTS)||providers.find(p=>p.kind==='OPENAI'),video=providers.find(p=>p.id===config.providerIds.VIDEO)||providers.find(p=>p.kind==='RUNWAY'),align=providers.find(p=>p.id===config.providerIds.ALIGNMENT)||providers.find(p=>p.kind==='ELEVENLABS');
 const scriptScenes=p.script?scriptSchema.parse(p.script.data).scenes:null,visualOrders=scriptScenes?scriptScenes.filter(s=>!s.graphic).map(s=>s.scene_order):Array.from({length:scenes},(_,i)=>i+1);
 const remaining=(kind:string)=>{const orders=kind==='AUDIO'?Array.from({length:scenes},(_,i)=>i+1):kind==='VIDEO'&&config.visualMode==='HYBRID'?visualOrders.filter(n=>n%2===1):visualOrders;return orders.filter(n=>!p.assets.some(a=>a.revision===p.revision&&a.kind===kind&&a.sceneOrder===n)).length;};
 const items:{category:string;cents:number|null;basis:string}[]=[{category:'LLM',cents:p.script?0:llm?.scriptCostCents??null,basis:'Kịch bản'}];
 if(!['FOOTAGE','GRAPHICS','TEXT_VIDEO'].includes(config.visualMode))items.push({category:'IMAGE',cents:remaining('IMAGE')===0?0:ai?remaining('IMAGE')*ai.imageCostCents:null,basis:'Ảnh còn thiếu'});
 items.push({category:'TTS',cents:remaining('AUDIO')===0?0:tts?remaining('AUDIO')*tts.ttsCostCents:null,basis:'Audio còn thiếu'});
 if(['TEXT_VIDEO','IMAGE_VIDEO','HYBRID'].includes(config.visualMode))items.push({category:'VIDEO',cents:remaining('VIDEO')===0?0:video?remaining('VIDEO')*((video.settings as {videoCostCents?:number}).videoCostCents||100):null,basis:'Clip còn thiếu'});
 if(config.subtitle.alignment==='FORCED')items.push({category:'ALIGNMENT',cents:align?scenes*((align.settings as {alignmentCostCents?:number}).alignmentCostCents||3):null,basis:'Căn lời đọc'});
 const extra=(config.researchEnabled?5:0)+(config.semanticDedupe?1:0)+(config.qa.contentReview?1:0);if(extra)items.push({category:'RESEARCH_QA',cents:llm?extra*llm.scriptCostCents:null,basis:'Dự phòng nghiên cứu / QA'});
 const renderRate=Number(process.env.RENDER_COST_CENTS_PER_MINUTE||0),storageRate=Number(process.env.STORAGE_COST_CENTS_PER_GB_MONTH||0),bytes=Math.ceil(p.targetDuration*8_000_000/8);
 items.push({category:'RENDER',cents:Math.ceil(p.targetDuration/60*renderRate),basis:'Đơn giá vận hành do quản trị cấu hình / phút video'},{category:'STORAGE',cents:Math.ceil(bytes/1e9*storageRate),basis:'Một tháng lưu MP4 ở giả định 8 Mbps; chưa gồm assets'});
 const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);const spent=await db.costUsage.aggregate({where:{project:{channelId:p.channelId},createdAt:{gte:month},status:{in:['COMPLETED','RESERVED','UNKNOWN']}},_sum:{amountCents:true}}),available=Math.max(0,p.channel.budgetCents-(spent._sum.amountCents||0));
 return {items,scenes,estimated:!p.script,totalCents:items.every(i=>i.cents!==null)?items.reduce((n,i)=>n+i.cents!,0):null,availableCents:available,currency:'USD',disclaimer:'Ước tính theo đơn giá cấu hình, chưa phải hóa đơn; retry, fallback, storage assets và sử dụng model có thể khác.'};
}
