import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {runMedia,renderVideo} from '../src/render/ffmpeg';
const directory=path.resolve('artifacts/render-smoke');await mkdir(directory,{recursive:true});
const scenes=[];
for(let i=0;i<2;i++){
  const image=path.join(directory,'input-'+i+'.png'),audio=path.join(directory,'input-'+i+'.mp3');
  await sharp(Buffer.from(`<svg width="540" height="960"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${i?'#321c60':'#123e55'}"/><stop offset="1" stop-color="#07141e"/></linearGradient></defs><rect width="540" height="960" fill="url(#g)"/><circle cx="270" cy="400" r="155" fill="none" stroke="#4de0bf" stroke-width="3"/><text x="270" y="400" text-anchor="middle" fill="white" font-family="Arial" font-size="30">RENDER SMOKE TEST</text><text x="270" y="450" text-anchor="middle" fill="#4de0bf" font-family="Arial" font-size="20">TEST FIXTURE • NOT AI OUTPUT</text></svg>`)).png().toFile(image);
  await runMedia('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency='+String(i?523:440)+':duration=2','-c:a','libmp3lame',audio]);
  scenes.push({image,audio,text:i?'Đồng bộ âm thanh và phụ đề thành công.':'Kiểm thử phụ đề tiếng Việt: sáng tạo mỗi ngày.',duration:2.5,motion:'zoom-in'});
}
const result=await renderVideo({scenes,directory,aspect:'9:16',targetDuration:5,widthOverride:Number(process.env.SMOKE_WIDTH||270),fps:24});
await writeFile(path.join(directory,'verification.json'),JSON.stringify({testFixture:true,notLiveAI:true,...result.qa,probe:result.info},null,2));
if(!result.qa.passed)throw new Error('Render QA failed');
console.log(JSON.stringify({passed:true,artifact:'artifacts/render-smoke/final.mp4',duration:result.duration,resolution:result.info.streams.find(s=>s.codec_type==='video'),qa:result.qa.score}));
