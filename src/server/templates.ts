import {productionSettings} from '../domain/production-settings';
export const templates = [
  {slug:'modern-tech',name:'Modern Technology',color:'#47ddca',background:'#11192e'},
  {slug:'educational',name:'Educational Explainer',color:'#60a5fa',background:'#12243a'},
  {slug:'documentary',name:'Documentary',color:'#d1b78f',background:'#292723'},
  {slug:'news-brief',name:'News Brief',color:'#ef6868',background:'#261c27'},
  {slug:'cinematic',name:'Cinematic Storytelling',color:'#a78bfa',background:'#211c33'},
  {slug:'minimal',name:'Minimal Knowledge',color:'#94a3b8',background:'#1c2433'},
  {slug:'dynamic',name:'Dynamic Short Video',color:'#fbbf24',background:'#30291a'}
].map((t,i)=>({...t,...productionSettings({accent:t.color,background:t.background,transition:i===2||i===4?'fade':'cut',fps:i===2||i===4?24:30,subtitle:{font:i===2?'DejaVu Serif':i===5?'DejaVu Sans Mono':'DejaVu Sans',size:i===6?.065:.05,color:'#ffffff',highlightColor:t.color,bottom:.2}})}));
