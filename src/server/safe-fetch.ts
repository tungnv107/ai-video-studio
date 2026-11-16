import {lookup} from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import {invariant} from '../domain/errors';
export function publicAddress(address:string){try{const ip=ipaddr.process(address);return ip.range()==='unicast';}catch{return false;}}
export async function safeFetch(value:string,options:{hosts:string[];maxBytes?:number;mime?:RegExp},redirects=0):Promise<{url:string;bytes:Buffer;mime:string}>{
 const url=new URL(value);invariant(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&options.hosts.includes(url.hostname),'SOURCE_HOST','Chỉ tải HTTPS từ host trong danh sách quản trị viên cho phép.');
 const addresses=await lookup(url.hostname,{all:true,verbatim:true});invariant(addresses.length&&addresses.every(a=>publicAddress(a.address)),'SOURCE_ADDRESS','Nguồn trỏ tới địa chỉ nội bộ hoặc không công khai.');
 const first=addresses[0],max=options.maxBytes||2_000_000;
 const result=await new Promise<{status:number;location?:string;mime:string;bytes:Buffer}>((resolve,reject)=>{
  const req=https.get(url,{family:first.family,lookup:(_host,_opts,callback)=>callback(null,first.address,first.family),agent:false,headers:{'User-Agent':'VideoStudio-Research/1.0','Accept-Encoding':'identity'}},res=>{
   const mime=String(res.headers['content-type']||'');if([301,302,303,307,308].includes(res.statusCode||0)){res.resume();resolve({status:res.statusCode!,location:res.headers.location,mime,bytes:Buffer.alloc(0)});return;}
   if(Number(res.headers['content-length']||0)>max){req.destroy(new Error('SOURCE_SIZE'));return;}
   let length=0;const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>max)req.destroy(new Error('SOURCE_SIZE'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode||0,mime,bytes:Buffer.concat(chunks)}));
  });const timer=setTimeout(()=>req.destroy(new Error('SOURCE_TIMEOUT')),20000);req.on('error',reject);req.on('close',()=>clearTimeout(timer));
 });
 if(result.location){invariant(redirects<3,'SOURCE_REDIRECT','Nguồn chuyển hướng quá nhiều.');return safeFetch(new URL(result.location,url).href,options,redirects+1);}
 invariant(result.status>=200&&result.status<300,'SOURCE_HTTP','Không tải được nguồn tham khảo.');if(options.mime)invariant(options.mime.test(result.mime),'SOURCE_MIME','Nguồn trả định dạng không hỗ trợ.');return {url:url.href,bytes:result.bytes,mime:result.mime};
}
