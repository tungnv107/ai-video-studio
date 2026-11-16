import {graphicSvg,type Graphic} from '../domain/graphics';
import {motionFilter,parallaxFilter} from './motion';
import {speechTiming,retimeWords} from './speech-timing';
import { spawn } from 'node:child_process';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AppError,invariant } from '../domain/errors';
import sharp from 'sharp';
import {productionSettings,ProductionSettings} from '../domain/production-settings';
import { cuesForScenes,alignedCues,Word,Cue,toAss,toSrt,toVtt } from './subtitles';
const localRequire=process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(),'package.json'));
export function binary(kind:'ffmpeg'|'ffprobe'):string{
  const configured=process.env[kind.toUpperCase()+'_PATH']; if(configured) return configured;
  if(process.platform==='win32'){ try{return kind==='ffmpeg'?localRequire('ffmpeg-static'):localRequire('ffprobe-static').path;}catch{} }
  return kind;
}
export function runMedia(kind:'ffmpeg'|'ffprobe',args:string[],cwd?:string,signal?:AbortSignal,captureStderr=false):Promise<string>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary(kind),args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let out='',err='';const timer=setTimeout(()=>child.kill(),Number(process.env.RENDER_TIMEOUT_MS||900000));
    child.stdout.on('data',chunk=>{out=(out+chunk.toString()).slice(-2_000_000);});
    child.stderr.on('data',chunk=>{err=(err+chunk.toString()).slice(-10000);});
    child.on('error',()=>{clearTimeout(timer);reject(new AppError('MEDIA_EXEC','Không khởi chạy được '+kind+'. Kiểm tra đường dẫn binary.',503));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new AppError('MEDIA_FAILED',kind+' thất bại: '+err.slice(-1500),500));else resolve(captureStderr?err:out);});
  });
}
export type Probe={streams:{codec_type:string;codec_name:string;width?:number;height?:number}[];format:{duration:string;size:string}};
export async function probe(file:string):Promise<Probe>{return JSON.parse(await runMedia('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));}
export type RenderInput={image:string;audio:string;text:string;duration:number;motion?:string;video?:string;words?:Word[];graphic?:Graphic|null;transition?:'cut'|'fade'|'template';card?:boolean;onScreenText?:string};
export function qaProbe(info:Probe,width:number,height:number,target:number){
  const v=info.streams.find(x=>x.codec_type==='video'),a=info.streams.find(x=>x.codec_type==='audio');
  const checks=[{name:'Video H.264',pass:v?.codec_name==='h264'},{name:'Âm thanh AAC',pass:a?.codec_name==='aac'},{name:'Độ phân giải',pass:v?.width===width&&v?.height===height},{name:'Thời lượng',pass:Math.abs(Number(info.format.duration)-target)<=Math.max(1,target*.03)},{name:'File có dữ liệu',pass:Number(info.format.size)>1000}];
  return {score:checks.every(x=>x.pass)?100:Math.round(checks.filter(x=>x.pass).length/checks.length*100),passed:checks.every(x=>x.pass),checks};
}
function xml(s:string){return s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));}
export async function titleCard(text:string,width:number,height:number,settings:ProductionSettings){const words=text.split(/\s+/),lines:string[]=[];for(const word of words){if(!lines.length||lines[lines.length-1].length+word.length>24)lines.push(word);else lines[lines.length-1]+=' '+word;}const size=Math.round(width*.06);return sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${settings.background}"/><rect x="${width*.1}" y="${height*.3}" width="${width*.16}" height="${height*.008}" fill="${settings.accent}"/>${lines.map((line,i)=>`<text x="${width*.1}" y="${height*.4+i*size*1.4}" font-family="DejaVu Sans" font-size="${size}" fill="#fff">${xml(line)}</text>`).join('')}</svg>`)).png().toBuffer();}
export async function renderVideo(input:{scenes:RenderInput[];directory:string;aspect:string;targetDuration:number;signal?:AbortSignal;widthOverride?:number;fps?:number;settings?:ProductionSettings;logo?:string;music?:string;title?:string}){
 await mkdir(input.directory,{recursive:true});const settings=input.settings||productionSettings({}),dims:Record<string,[number,number]>={'9:16':[1080,1920],'16:9':[1920,1080],'1:1':[1080,1080]};let [width,height]=dims[input.aspect]||dims['9:16'];if(input.widthOverride){height=Math.round(height*input.widthOverride/width/2)*2;width=input.widthOverride;}const fps=input.fps||settings.fps,scenes=input.scenes.map(s=>({...s}));
 for(const which of ['intro','outro'] as const)if(settings[which]){const image=path.join(input.directory,which+'.png'),audio=path.join(input.directory,which+'.wav');await writeFile(image,await titleCard(settings[which],width,height,settings));await runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(settings.cardDuration),audio],input.directory,input.signal);const card:RenderInput={image,audio,text:'',duration:settings.cardDuration,motion:'static',card:true};if(which==='intro')scenes.unshift(card);else scenes.push(card);}
 for(const [i,scene] of scenes.entries())if(scene.graphic){scene.image=path.join(input.directory,'graphic-'+i+'.png');scene.video=undefined;scene.onScreenText=undefined;scene.motion='static';await sharp(Buffer.from(graphicSvg(scene.graphic,width,height,{...settings,font:settings.subtitle.font}))).png().toFile(scene.image);}
 const transitions=scenes.map(s=>s.transition&&s.transition!=='template'?s.transition:settings.transition);
 const actual:number[]=[],audioLengths:number[]=[],speechTempos:number[]=[];
 for(let i=0;i<scenes.length;i++){
  input.signal?.throwIfAborted();const scene=scenes[i],info=await probe(scene.audio);invariant(info.streams.some(s=>s.codec_type==='audio'),'MISSING_AUDIO','Scene thiếu track lời thoại.');const audioDuration=Number(info.format.duration);invariant(Number.isFinite(audioDuration)&&audioDuration>0,'AUDIO_DURATION','Thời lượng lời thoại không hợp lệ.');
  const timing=speechTiming(scene.duration,audioDuration,fps,settings.narrationTiming==='FIT_SCENES',scene.card),{duration,tempo}=timing;
  audioLengths.push(timing.audioDuration);actual.push(duration);speechTempos.push(tempo);if(scene.words&&tempo!==1)scene.words=retimeWords(scene.words,tempo);
  const visual=scene.video?`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1,format=yuv420p`:motionFilter(scene.motion,width,height,fps,duration)+(scene.graphic?',fade=t=in:st=0:d=0.35':'');
  const parallax=!scene.video&&scene.motion==='parallax',filterArgs=parallax?['-filter_complex_threads','1','-filter_complex',parallaxFilter(width,height,fps,duration),'-map','[visual]']:['-map','0:v:0','-vf',visual];
  await runMedia('ffmpeg',['-hide_banner','-loglevel','error','-y',...(scene.video?['-stream_loop','-1']:['-loop','1']),'-i',scene.video||scene.image,'-i',scene.audio,...filterArgs,'-map','1:a:0','-af',(tempo!==1?`atempo=${tempo.toFixed(8)},`:'')+'apad,loudnorm=I=-16:TP=-1.5:LRA=11','-t',String(duration),'-r',String(fps),'-c:v','libx264','-preset','veryfast','-crf','21','-threads','2','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',`scene-${i}.mp4`],input.directory,input.signal);
 }
 let offset=0;const cues:Cue[]=[],overlays:Cue[]=[];for(let i=0;i<scenes.length;i++){const scene=scenes[i];if(scene.text){if(scene.words)cues.push(...alignedCues(scene.words,offset));else cues.push(...cuesForScenes([{text:scene.text,duration:Math.min(audioLengths[i],actual[i])}]).map(c=>({...c,start:c.start+offset,end:c.end+offset})));}if(scene.onScreenText)overlays.push({start:offset+.15,end:offset+Math.min(actual[i]-.1,6),text:scene.onScreenText});offset+=actual[i];}const duration=offset;
 await writeFile(path.join(input.directory,'subtitles.ass'),toAss(cues,width,height,undefined,settings.subtitle,overlays));await writeFile(path.join(input.directory,'subtitles.srt'),toSrt(cues));await writeFile(path.join(input.directory,'subtitles.vtt'),toVtt(cues));
 const base=['-hide_banner','-loglevel','error','-y'];
 if(transitions.slice(0,-1).includes('fade')&&scenes.length>1){
  const filters:string[]=[],joinArgs=[...base],overlap=.35;let elapsed=0;
  for(let i=0;i<scenes.length;i++){joinArgs.push('-i',`scene-${i}.mp4`);filters.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS${i<scenes.length-1&&transitions[i]==='fade'?`,tpad=stop_mode=clone:stop_duration=${overlap}`:''}[v${i}]`);}
  let last='v0';for(let i=1;i<scenes.length;i++){elapsed+=actual[i-1];if(transitions[i-1]==='fade')filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${overlap}:offset=${elapsed}[x${i}]`);else filters.push(`[${last}][v${i}]concat=n=2:v=1:a=0,fps=${fps},settb=AVTB[x${i}]`);last='x'+i;}
  filters.push(scenes.map((_,i)=>`[${i}:a]`).join('')+`concat=n=${scenes.length}:v=0:a=1[a]`);
  await runMedia('ffmpeg',[...joinArgs,'-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map',`[${last}]`,'-map','[a]','-t',String(duration),'-c:v','libx264','-preset','veryfast','-threads','2','-c:a','aac','joined.mp4'],input.directory,input.signal);
 }else{await writeFile(path.join(input.directory,'concat.txt'),scenes.map((_,i)=>`file 'scene-${i}.mp4'`).join('\n'));await runMedia('ffmpeg',[...base,'-f','concat','-safe','1','-i','concat.txt','-c','copy','joined.mp4'],input.directory,input.signal);}
 const finish=[...base,'-i','joined.mp4'],filters=['[0:v]ass=subtitles.ass[sub]'];let video='sub',audio='0:a',idx=1;
 if(input.logo){finish.push('-loop','1','-i',input.logo);filters.push(`[${idx}:v]scale=${Math.round(width*.14/2)*2}:-1[logo]`,`[sub][logo]overlay=W-w-${Math.round(width*.06)}:${Math.round(height*.06)}:shortest=1[branded]`);video='branded';idx++;}
 if(input.music){finish.push('-stream_loop','-1','-i',input.music);filters.push('[0:a]asplit=2[speech][side]',`[${idx}:a]volume=${settings.musicVolume}[music]`,'[music][side]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=250[duck]','[speech][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.891[mixed]');audio='[mixed]';}
 await runMedia('ffmpeg',[...finish,'-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map',`[${video}]`,'-map',audio,'-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-c:a','aac','-movflags','+faststart','final.mp4'],input.directory,input.signal);
 const output=path.join(input.directory,'final.mp4'),info=await probe(output),qa=qaProbe(info,width,height,duration);
 await runMedia('ffmpeg',['-v','error','-i',output,'-f','null','-'],input.directory,input.signal);
 const analysis=await runMedia('ffmpeg',['-hide_banner','-i',output,'-vf','blackdetect=d=0.15:pix_th=0.10','-af','silencedetect=n=-45dB:d=0.5,volumedetect','-f','null','-'],input.directory,input.signal,true);
 const narrationAnalysis=await runMedia('ffmpeg',['-hide_banner','-i','joined.mp4','-vn','-af','silencedetect=n=-45dB:d=0.5,volumedetect','-f','null','-'],input.directory,input.signal,true);let cursor=0;const cardRanges=scenes.flatMap((scene,i)=>{const start=cursor;cursor+=actual[i];return scene.card?[{start,end:cursor}]:[];});const black=Array.from(analysis.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)).reduce((sum,m)=>{const start=Number(m[1]),end=Number(m[2]),intentional=cardRanges.reduce((n,r)=>n+Math.max(0,Math.min(end,r.end)-Math.max(start,r.start)),0);return sum+Math.max(0,end-start-intentional);},0),silence=Array.from(narrationAnalysis.matchAll(/silence_duration: ([\d.]+)/g)).reduce((n,m)=>n+Number(m[1]),0),speechMax=Number(narrationAnalysis.match(/max_volume: (-?[\d.]+) dB/)?.[1]??NaN),maxVolume=Number(analysis.match(/max_volume: (-?[\d.]+) dB/)?.[1]??NaN),cards=scenes.filter(s=>s.card).length*settings.cardDuration;
 qa.checks.push({name:'Sai lệch so với mục tiêu ≤ 20%',pass:Math.abs(duration-input.targetDuration-cards)<=Math.max(2,input.targetDuration*.2)},{name:'Không có đoạn đen dài',pass:black/duration<=settings.qa.maxBlackRatio},{name:'Lời thoại không có khoảng lặng quá mức',pass:Math.max(0,silence-cards)/Math.max(1,duration-cards)<=settings.qa.maxSilenceRatio},{name:'Lời thoại có tín hiệu',pass:Number.isFinite(speechMax)&&speechMax>-50},{name:'Âm lượng không clipping',pass:Number.isFinite(maxVolume)&&maxVolume<0},{name:'Phụ đề trong timeline',pass:cues.every(c=>c.start>=0&&c.end>c.start&&c.end<=duration+.05)},{name:'Tốc độ đọc phụ đề',pass:cues.every(c=>c.text.length/(c.end-c.start)<=settings.qa.maxCharactersPerSecond)});
 qa.score=Math.round(qa.checks.filter(c=>c.pass).length/qa.checks.length*100);qa.passed=Number.isFinite(speechMax)&&speechMax>-50&&qa.checks.slice(0,6).every(c=>c.pass)&&qa.score>=settings.qa.minimumScore;if(!qa.passed)qa.score=Math.min(84,qa.score);
 await runMedia('ffmpeg',[...base,'-ss',String(settings.intro?settings.cardDuration+.5:.5),'-i',output,'-frames:v','1','thumbnail.jpg'],input.directory,input.signal);
 let thumbnail=await readFile(path.join(input.directory,'thumbnail.jpg'));
 if(settings.thumbnailTitle&&input.title){const title=input.title.slice(0,90),lines=title.match(/.{1,24}(?:\s|$)|.{1,24}/gu)||[title];const size=Math.round(width*.055),top=height*.65;const overlay=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect y="${top-60}" width="100%" height="${height-top+60}" fill="#000" opacity=".7"/>${lines.map((t,i)=>`<text x="${width*.08}" y="${top+i*size*1.3}" font-family="DejaVu Sans" font-weight="bold" font-size="${size}" fill="#fff">${xml(t)}</text>`).join('')}</svg>`);thumbnail=await sharp(thumbnail).composite([{input:overlay}]).jpeg({quality:90}).toBuffer();}
 return {video:await readFile(output),srt:await readFile(path.join(input.directory,'subtitles.srt')),vtt:await readFile(path.join(input.directory,'subtitles.vtt')),thumbnail,qa:{...qa,measurements:{blackSeconds:black,silenceSeconds:silence,maxVolumeDb:maxVolume,speechTempos},alignment:scenes.every(s=>s.card||s.words)?'FORCED':'PROPORTIONAL'},info,duration};
}
