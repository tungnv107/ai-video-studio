import { createCipheriv,createDecipheriv,randomBytes,scryptSync,timingSafeEqual,createHash } from 'node:crypto';
import { AppError } from '../domain/errors';
function key() { const k=Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64'); if(k.length!==32) throw new AppError('CONFIG','ENCRYPTION_KEY phải là 32 bytes base64.',503); return k; }
export function encrypt(value:string) { const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv); const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.'); }
export function decrypt(value:string) { const [version,iv,tag,data]=value.split('.'); if(version!=='v1') throw new Error('Invalid ciphertext'); const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64')); cipher.setAuthTag(Buffer.from(tag,'base64')); return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8'); }
export const hashToken = (token:string) => createHash('sha256').update(token).digest('hex');
export function canonicalHash(value:unknown):string {
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
  return hashToken(JSON.stringify(stable(value)));
}
export function hashPassword(value:string) { const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(value,salt,64).toString('hex'); }
export function verifyPassword(value:string, stored:string) { const [salt,hash]=stored.split(':'); const actual=scryptSync(value,salt,64), expected=Buffer.from(hash,'hex'); return actual.length===expected.length && timingSafeEqual(actual,expected); }
