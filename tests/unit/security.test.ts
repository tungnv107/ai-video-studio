import {describe,it,expect,beforeAll} from 'vitest';
import {randomBytes} from 'node:crypto';
import {encrypt,decrypt,hashPassword,verifyPassword} from '../../src/server/crypto';
import {storagePath} from '../../src/server/storage';
import {validateProviderUrl} from '../../src/providers/openai';
import {checkOrigin,authorize} from '../../src/server/auth';
beforeAll(()=>{process.env.ENCRYPTION_KEY=randomBytes(32).toString('base64');});
describe('Security boundaries',()=>{
  it('encrypts secrets nondeterministically and detects tampering',()=>{const a=encrypt('secret'),b=encrypt('secret');expect(a).not.toContain('secret');expect(a).not.toBe(b);expect(decrypt(a)).toBe('secret');expect(()=>decrypt(a.slice(0,-3)+'xxx')).toThrow();});
  it('hashes passwords with salt and rejects incorrect password',()=>{const hash=hashPassword('a-long-test-password');expect(verifyPassword('a-long-test-password',hash)).toBe(true);expect(verifyPassword('wrong',hash)).toBe(false);});
  it('rejects path traversal and absolute paths',()=>{for(const p of ['../secret','x/../../secret','C:/secret','/etc/passwd'])expect(()=>storagePath(p)).toThrow();});
  it('rejects private/custom/credential provider URLs by default',()=>{for(const u of ['http://127.0.0.1/v1','https://evil.com/v1','https://user:pass@api.openai.com/v1','https://api.openai.com:8888/v1'])expect(()=>validateProviderUrl(u)).toThrow();expect(validateProviderUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');});
  it('rejects missing or cross-site mutation origin',()=>{expect(()=>checkOrigin(new Request('http://localhost:3000/api/channels',{method:'POST'}))).toThrow();expect(()=>checkOrigin(new Request('http://localhost:3000',{headers:{origin:'https://evil.com'}}))).toThrow();});
  it('rejects mutation by viewer',()=>{expect(()=>authorize({userId:'u',workspaceId:'w',role:'VIEWER',name:'n',email:'e'})).toThrow();});
});
