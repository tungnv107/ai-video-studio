import type {ProductionSettings} from '../domain/production-settings';
export type Word={start:number;end:number;text:string};
export type Cue={start:number;end:number;text:string;words?:Word[]};
export function alignedCues(words:Word[],offset=0):Cue[]{const cues:Cue[]=[];for(let i=0;i<words.length;i+=7){const group=words.slice(i,i+7).map(w=>({...w,start:w.start+offset,end:w.end+offset}));cues.push({start:group[0].start,end:group[group.length-1].end,text:group.map(w=>w.text).join(' '),words:group});}return cues;}
export function cuesForScenes(scenes:{text:string;duration:number}[]):Cue[]{
  let offset=0; const cues:Cue[]=[];
  for(const scene of scenes){
    const words=scene.text.trim().split(/\s+/u), chunks:string[][]=[];
    for(let i=0;i<words.length;i+=7) chunks.push(words.slice(i,i+7));
    let used=0;
    for(const chunk of chunks){ const start=offset+scene.duration*used/words.length; used+=chunk.length; cues.push({start,end:offset+scene.duration*used/words.length,text:chunk.join(' ')}); }
    offset+=scene.duration;
  }
  return cues;
}
export function stamp(sec:number,format:'srt'|'vtt'|'ass'){
  const ticks=Math.round(sec*(format==='ass'?100:1000)),base=format==='ass'?100:1000;
  const s=Math.floor(ticks/base),h=Math.floor(s/3600),m=Math.floor(s%3600/60);
  return (format==='ass'?String(h):String(h).padStart(2,'0'))+':'+String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+(format==='srt'?',':'.')+String(ticks%base).padStart(format==='ass'?2:3,'0');
}
export function toSrt(cues:Cue[]){return cues.map((c,i)=>`${i+1}\n${stamp(c.start,'srt')} --> ${stamp(c.end,'srt')}\n${c.text}\n`).join('\n');}
export function toVtt(cues:Cue[]){return 'WEBVTT\n\n'+cues.map(c=>`${stamp(c.start,'vtt')} --> ${stamp(c.end,'vtt')}\n${c.text}\n`).join('\n');}
export function escapeAss(text:string){return text.replace(/\\/g,'').replace(/[{}]/g,'').replace(/\r?\n/g,'\\N');}
export function toAss(cues:Cue[],width:number,height:number,accent='&H00FFFFFF',style?:ProductionSettings['subtitle'],overlays:Cue[]=[]){
  const color=(s:string)=>'&H00'+s.slice(5,7)+s.slice(3,5)+s.slice(1,3);
  if(style)accent=color(style.highlight?style.highlightColor:style.color);
  const size=Math.round(style?width*style.size:width/(width<height?18:30)), margin=Math.round(width*(style?.margin||.09)), bottom=Math.round(height*(style?.bottom||.2));
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style?.font||'DejaVu Sans'},${size},${accent},${style?color(style.color):'&H00FFFFFF'},&H00202020,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,${margin},${margin},${bottom},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+cues.map(c=>{let text=escapeAss(c.text);if(style?.highlight&&c.words){let end=c.start;text=c.words.map(w=>{const gap=Math.max(0,Math.round((w.start-end)*100));end=w.end;return (gap?`{\\k${gap}}`:'')+`{\\kf${Math.max(1,Math.round((w.end-w.start)*100))}}`+escapeAss(w.text);}).join(' ');}return `Dialogue: 0,${stamp(c.start,'ass')},${stamp(c.end,'ass')},Default,,0,0,0,,${text}`;}).join('\n')+'\n'+overlays.map(c=>`Dialogue: 1,${stamp(c.start,'ass')},${stamp(c.end,'ass')},Default,,${margin},${margin},0,,{\\an8\\pos(${Math.round(width/2)},${Math.round(height*.16)})\\fs${Math.round(width*.045)}\\fad(250,250)}${escapeAss(c.text)}`).join('\n');
}
