import type {Prisma} from '@prisma/client';
import {db} from './db';
import {providersFor} from './provider-routing';
import {productionSettings} from '../domain/production-settings';
import {scriptSchema} from '../domain/schemas';
import {invariant} from '../domain/errors';

// Check local dependencies before spending on a script or missing scene assets.
// This does not claim to verify remote credentials/model access without a call.
export async function productionPreflight(project:Prisma.VideoProjectGetPayload<{include:{script:true;channel:true}}>){
  if(project.intent!=='VIDEO')return;
  const settings=productionSettings(project.productionConfig||project.channel.settings);
  const script=project.script?scriptSchema.parse(project.script.data):null;
  const assets=await db.generatedAsset.findMany({where:{projectId:project.id,revision:project.revision}});
  const scenes=script?.scenes||[{scene_order:1,graphic:null}];
  const missing=(order:number,kind:string)=>!assets.some(a=>a.sceneOrder===order&&a.kind===kind);
  const capabilities=new Set<string>();
  if(!script)capabilities.add('LLM');
  for(const scene of scenes){
    if(!scene.graphic&&!['TEXT_VIDEO','FOOTAGE','GRAPHICS'].includes(settings.visualMode)&&missing(scene.scene_order,'IMAGE'))capabilities.add('IMAGE');
    if(missing(scene.scene_order,'AUDIO'))capabilities.add('TTS');
    if(!scene.graphic&&['TEXT_VIDEO','IMAGE_VIDEO','HYBRID'].includes(settings.visualMode)&&(settings.visualMode!=='HYBRID'||scene.scene_order%2===1)&&missing(scene.scene_order,'VIDEO'))capabilities.add('VIDEO');
    const audio=assets.find(a=>a.sceneOrder===scene.scene_order&&a.kind==='AUDIO');
    if(settings.subtitle.alignment==='FORCED'&&!(audio?.metadata as {words?:unknown}|null)?.words)capabilities.add('ALIGNMENT');
  }
  if(settings.qa.contentReview&&!await db.automationTask.findFirst({where:{key:project.id+':r'+project.revision+':content-qa',status:'COMPLETED'}}))capabilities.add('LLM');
  for(const capability of capabilities)await providersFor(project.workspaceId,capability,settings.providerIds[capability as keyof typeof settings.providerIds]);
  for(const [id,kind,label] of [[settings.logoMediaId,'IMAGE','Logo'],[settings.musicMediaId,'AUDIO','Nhạc nền'],[settings.visualMode==='FOOTAGE'?settings.footageMediaId:undefined,'VIDEO','Footage']] as const){
    if(label==='Footage'&&settings.visualMode==='FOOTAGE')invariant(id,'FOOTAGE_REQUIRED','Chọn footage trước khi bắt đầu sản xuất.');
    if(id)invariant(await db.mediaItem.findFirst({where:{id,workspaceId:project.workspaceId,kind,deletedAt:null}}),'MEDIA_MISSING',label+' không còn khả dụng trong workspace.');
  }
}
