import {invariant} from '../domain/errors';
import type {Word} from './subtitles';
export function speechTiming(planned:number,audio:number,fps:number,fit:boolean,card=false){
  const tail=card?0:.15;
  if(!fit||card)return {duration:Math.ceil(Math.max(planned,audio+tail)*fps)/fps,tempo:1,audioDuration:audio};
  const duration=Math.round(planned*fps)/fps,available=duration-tail;
  invariant(available>0,'SCENE_DURATION','Cảnh quá ngắn để chứa lời đọc.');
  const tempo=Math.max(1,audio/available);
  invariant(tempo<=1.5,'NARRATION_TOO_LONG','Lời đọc quá dài để khớp cảnh mà vẫn rõ tiếng. Rút ngắn lời thoại hoặc chọn giữ nhịp đọc tự nhiên.');
  return {duration,tempo,audioDuration:audio/tempo};
}
export function retimeWords(words:Word[],tempo:number){return words.map(word=>({...word,start:word.start/tempo,end:word.end/tempo}));}
