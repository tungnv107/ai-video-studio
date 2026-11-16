import {it,expect} from 'vitest';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {runMedia,probe,renderVideo} from '../../src/render/ffmpeg';
import {productionSettings} from '../../src/domain/production-settings';
it('renders overlong cached narration to the requested duration without another TTS call or modifying source audio',async()=>{
  const directory=path.resolve('artifacts/audit-speech-render');await mkdir(directory,{recursive:true});
  const image=path.join(directory,'image.png'),audio=path.join(directory,'source.mp3');
  await sharp({create:{width:270,height:480,channels:3,background:'#417c84'}}).png().toFile(image);
  await runMedia('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',audio]);
  const original=await readFile(audio),result=await renderVideo({directory,aspect:'9:16',targetDuration:5,widthOverride:270,settings:productionSettings({narrationTiming:'FIT_SCENES'}),scenes:[{image,audio,text:'Xin chào.',duration:2.5},{image,audio,text:'Tạm biệt.',duration:2.5}]});
  expect(result.duration).toBe(5);expect(Number(result.info.format.duration)).toBeCloseTo(5,1);expect(result.qa.passed).toBe(true);
  expect(result.qa.measurements.speechTempos.every(t=>t>1&&t<=1.5)).toBe(true);
  expect(await readFile(audio)).toEqual(original);expect(Number((await probe(audio)).format.duration)).toBeGreaterThan(3);
  expect(result.srt.toString()).toContain('00:00:04,850');
});
