import {it,expect} from 'vitest';
import {speechTiming,retimeWords} from '../../src/render/speech-timing';
it('keeps natural timing and cards unchanged, fitting only when explicitly selected',()=>{
  expect(speechTiming(10,12,30,false)).toMatchObject({tempo:1,duration:12.166666666666666});
  expect(speechTiming(2,2,30,true,true)).toEqual({tempo:1,duration:2,audioDuration:2});
  expect(speechTiming(10,8,30,true)).toEqual({tempo:1,duration:10,audioDuration:8});
});
it('fits the measured Vietnamese narration to three complete ten-second scenes',()=>{
  const timings=[10.512,10.944,12.96].map(audio=>speechTiming(10,audio,30,true));
  expect(timings.reduce((n,t)=>n+t.duration,0)).toBe(30);
  for(const t of timings){expect(t.tempo).toBeLessThanOrEqual(1.5);expect(t.audioDuration).toBeCloseTo(9.85);}
});
it('preserves aligned word content and relative timing without mutating the checkpoint',()=>{
  const words=[{text:'Xin',start:0,end:1},{text:'chào',start:1,end:2}];
  expect(retimeWords(words,1.25)).toEqual([{text:'Xin',start:0,end:.8},{text:'chào',start:.8,end:1.6}]);expect(words[1].end).toBe(2);
});
it('rejects excessive compression instead of clipping narration',()=>{
  expect(()=>speechTiming(10,20,30,true)).toThrow(/Rút ngắn lời thoại/);
});
