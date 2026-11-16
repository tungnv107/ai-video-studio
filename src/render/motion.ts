export function motionFilter(motion:string|undefined,width:number,height:number,fps:number,duration:number){
 const frames=Math.max(1,Math.round(duration*fps)-1),progress=`min(on/${frames},1)`,centerX='iw/2-iw/zoom/2',centerY='ih/2-ih/zoom/2';
 let zoom=motion==='static'?'1':motion==='zoom-out'?`1.08-0.08*${progress}`:`1+0.08*${progress}`,x=centerX,y=centerY;
 if(motion?.startsWith('pan-')){zoom='1.12';if(motion==='pan-left')x=`(iw-iw/zoom)*(1-${progress})`;if(motion==='pan-right')x=`(iw-iw/zoom)*${progress}`;if(motion==='pan-up')y=`(ih-ih/zoom)*(1-${progress})`;if(motion==='pan-down')y=`(ih-ih/zoom)*${progress}`;}
 const crop=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
 return `${crop},zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p`;
}
export function parallaxFilter(width:number,height:number,fps:number,duration:number){
 // Two explicit planes: a softly blurred moving backdrop and a floating image card.
 // This is a layout effect, not inferred depth or automatic subject segmentation.
 const foregroundWidth=Math.floor(width*.86/2)*2,foregroundHeight=Math.floor(height*.86/2)*2;
 return `[0:v]split=2[back][front];[back]${motionFilter('pan-right',width,height,fps,duration)},gblur=sigma=12[background];[front]scale=${foregroundWidth}:${foregroundHeight}:force_original_aspect_ratio=decrease,fps=${fps},setsar=1[foreground];[background][foreground]overlay=x='(W-w)/2+W*0.02*sin(t*1.2)':y='(H-h)/2+H*0.012*cos(t*1.2)':shortest=1,format=yuv420p[visual]`;
}
