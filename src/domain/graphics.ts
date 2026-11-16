import {z} from 'zod';

export const graphicSchema=z.object({
 kind:z.enum(['BARS','STEPS','STAT']),title:z.string().trim().min(1).max(100),unit:z.string().max(20),
 items:z.array(z.object({label:z.string().trim().min(1).max(80),value:z.number().finite().min(0).max(1e12)})).min(1).max(6),
 sourceUrl:z.string().url().refine(url=>/^https?:\/\//.test(url),'Nguồn phải là URL HTTP/HTTPS.').nullable()
});
export type Graphic=z.infer<typeof graphicSchema>;
const xml=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export function graphicSvg(value:Graphic,width:number,height:number,style:{background:string;accent:string;font?:string}){
 const g=graphicSchema.parse(value),size=Math.round(Math.min(width*.045,height*.055)),left=width*.1,inner=width*.8;
 const wrap=(s:string,max:number)=>{const lines:string[]=[];for(const word of s.match(new RegExp(`.{1,${max}}(?:\\s|$)|.{1,${max}}`,'gu'))||[])lines.push(word.trim());return lines;};
 const text=(value:string,x:number,y:number,fontSize=size,color='#ffffff',max=32)=>wrap(value,max).map((line,i)=>`<text x="${x}" y="${y+i*fontSize*1.25}" font-size="${fontSize}" fill="${color}">${xml(line)}</text>`).join('');
 let body=text(g.title,left,height*.17,size*1.15,'#ffffff',Math.floor(inner/(size*1.15*.62)));
 const top=height*.32,bottom=height*.65,columns=width>height&&g.items.length>3?2:1,rows=Math.ceil(g.items.length/columns),row=(bottom-top)/rows,column=inner/columns,max=Math.max(1,...g.items.map(i=>i.value));
 if(g.kind==='STAT'){
  const item=g.items[0],number=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2,notation:item.value>=1e7?'compact':'standard'}).format(item.value)+' '+g.unit;body+=text(number,left,height*.44,Math.min(size*2.2,inner/(Math.max(number.length,1)*.62)),style.accent,50)+text(item.label,left,height*.56,size,'#ffffff',32);
 }else for(const [i,item] of g.items.entries()){
  const y=top+(i%rows)*row,x=left+Math.floor(i/rows)*column,span=column*(columns>1?.9:1);
  if(g.kind==='BARS'){
   const labelSize=Math.min(size*.85,row*.28,span*.62/(Math.ceil(item.label.length/2)*.62)),barHeight=Math.max(4,Math.min(size*.45,row*.17)),number=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2,notation:item.value>=1e7?'compact':'standard'}).format(item.value)+' '+g.unit;
   body+=text(item.label,x,y,labelSize,'#ffffff',Math.floor(span*.62/(labelSize*.62)))+`<text x="${x+span}" y="${y}" text-anchor="end" font-size="${Math.min(size*.85,row*.28,span*.32/(Math.max(number.length,1)*.62))}" fill="${style.accent}">${xml(number)}</text><rect x="${x}" y="${y+row*.55}" width="${span}" height="${barHeight}" rx="${barHeight/2}" fill="#ffffff" opacity=".12"/><rect x="${x}" y="${y+row*.55}" width="${span*item.value/max}" height="${barHeight}" rx="${barHeight/2}" fill="${style.accent}"/>`;
  }else{
   const radius=Math.min(size*.6,row*.2),labelSize=Math.min(size,row*.32,(span-radius*3)/(Math.ceil(item.label.length/2)*.62));body+=`<circle cx="${x+radius}" cy="${y+radius}" r="${radius}" fill="${style.accent}"/>`+text(String(i+1),x+radius*.65,y+radius*1.35,radius,'#111827',4)+text(item.label,x+radius*3,y+radius*.9,labelSize,'#ffffff',Math.floor((span-radius*3)/(labelSize*.62)));
  }
 }
 const source=g.sourceUrl?'Nguồn: '+new URL(g.sourceUrl).hostname.slice(0,55):'Chưa đính kèm nguồn · cần kiểm chứng';
 body+=text(source,left,height*.71,size*.5,'#cbd5e1',58);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${style.background}"/><g font-family="${xml(style.font||'DejaVu Sans')}">${body}</g></svg>`;
}
