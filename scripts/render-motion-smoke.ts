import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {renderVideo,runMedia,type RenderInput} from '../src/render/ffmpeg';
import {productionSettings} from '../src/domain/production-settings';
const full=process.env.RENDER_FULL_RES==='true',root=path.resolve('artifacts/render-motion'+(full?'-hd':''));await mkdir(root,{recursive:true});
const image=path.join(root,'fixture.png'),audio=path.join(root,'fixture.wav');
await sharp(Buffer.from('<svg width="1080" height="1920"><defs><linearGradient id="g"><stop stop-color="#4338ca"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="240" cy="450" r="210" fill="#fbbf24"/><circle cx="800" cy="1100" r="280" fill="#7dd3fc"/><text x="90" y="850" fill="white" font-size="75" font-family="DejaVu Sans">TEST MOTION</text></svg>')).png().toFile(image);
await runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2.8','-c:a','pcm_s16le',audio]);
const scenes:RenderInput[]=[
 {image,audio,text:'Kiểm thử chuyển động',duration:3,motion:'pan-left',transition:'cut'},
 {image,audio,text:'Kiểm thử hai lớp',duration:3,motion:'parallax',transition:'fade'},
 {image,audio,text:'Số liệu thử nghiệm',duration:3,transition:'cut',graphic:{kind:'BARS',title:'SỐ LIỆU FIXTURE',unit:'mẫu',items:[{label:'Phương án A',value:35},{label:'Phương án B',value:70},{label:'Phương án C',value:50}],sourceUrl:null}},
 {image,audio,text:'Các bước thử nghiệm',duration:3,transition:'fade',graphic:{kind:'STEPS',title:'QUY TRÌNH KIỂM THỬ',unit:'',items:[{label:'Chuẩn bị dữ liệu',value:1},{label:'Kiểm tra tiếng Việt',value:2},{label:'Đọc kết quả',value:3}],sourceUrl:null}},
 {image,audio,text:'Chỉ là số liệu thử',duration:3,graphic:{kind:'STAT',title:'THẺ SỐ LIỆU',unit:'mẫu',items:[{label:'Dữ liệu mô phỏng kiểm thử',value:120}],sourceUrl:null}}
];
const results=[];
for(const [aspect,fps,width] of [['9:16',24,540],['16:9',25,640],['1:1',30,480]] as const){
 if(process.env.RENDER_SMOKE_ASPECT&&process.env.RENDER_SMOKE_ASPECT!==aspect)continue;
 const directory=path.join(root,aspect.replace(':','x')),result=await renderVideo({scenes,directory,aspect,targetDuration:15,widthOverride:full?undefined:width,settings:productionSettings({fps,subtitle:{size:.04}})});
 for(const [name,at] of [['pan',1],['parallax',4],['bars',7.5],['steps',10.5],['stat',13.5]] as const)await runMedia('ffmpeg',['-v','error','-y','-ss',String(at),'-i',path.join(directory,'final.mp4'),'-frames:v','1',path.join(directory,name+'.jpg')]);
 // Confirm the moving scene really changes over time, beyond metadata/probe checks.
 const samples:Buffer[]=[];for(const [name,at] of [['start',.2],['end',2.6]] as const){const file=path.join(directory,name+'.png');await runMedia('ffmpeg',['-v','error','-y','-ss',String(at),'-i',path.join(directory,'scene-0.mp4'),'-frames:v','1',file]);samples.push(await sharp(await readFile(file)).resize(64,64).raw().toBuffer());}
 const difference=samples[0].reduce((n,v,i)=>n+Math.abs(v-samples[1][i]),0)/samples[0].length;
 if(difference<1)throw new Error('Pan frames did not move');
 results.push({aspect,fps,fixture:true,fullResolution:full,duration:result.duration,motionDifference:difference,...result.qa,probe:result.info});
 if(!result.qa.passed)throw new Error('Motion/graphics QA failed: '+JSON.stringify(results.at(-1)));
}
await writeFile(path.join(root,'verification.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({aspect:r.aspect,score:r.score,duration:r.duration,motionDifference:r.motionDifference}))));
