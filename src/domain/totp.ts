import {createHmac,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer){let bits='';for(const b of bytes)bits+=b.toString(2).padStart(8,'0');let out='';for(let i=0;i<bits.length;i+=5)out+=alphabet[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return out;}
export function totp(secret:string,counter:number){const bits=secret.split('').map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));const data=Buffer.alloc(8);data.writeBigUInt64BE(BigInt(counter));const mac=createHmac('sha1',key).update(data).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
function same(a:string,b:string){return a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function matchingCounter(secret:string,code:string,after:number,now=Date.now()){const n=Math.floor(now/30000);for(const step of [n,n-1,n+1])if(step>after&&/^\d{6}$/.test(code)&&same(totp(secret,step),code))return step;return null;}
