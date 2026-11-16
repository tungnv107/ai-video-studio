import type {AIProvider} from '@prisma/client';
import {z} from 'zod';
import {decrypt} from '../server/crypto';
import {validateProviderUrl} from './openai';
import {AppError,invariant} from '../domain/errors';
export class SearchAdapter{
 constructor(private provider:AIProvider,private fetcher:typeof fetch=fetch){validateProviderUrl(provider.baseUrl);}
 async search(query:string){invariant(this.provider.kind==='BRAVE','CAPABILITY','Cần provider Brave Search.');const url=this.provider.baseUrl.replace(/\/$/,'')+'/res/v1/web/search?'+new URLSearchParams({q:query,count:'5',safesearch:'strict'});let r:Response;try{r=await this.fetcher(url,{headers:{Accept:'application/json','X-Subscription-Token':decrypt(this.provider.encryptedKey)},redirect:'error',signal:AbortSignal.timeout(this.provider.timeoutMs)});}catch{throw new AppError('PROVIDER_UNKNOWN','Search timeout; kết quả/chi phí chưa rõ.',502);}if(!r.ok)throw new AppError(r.status===429?'PROVIDER_RATE_LIMIT':r.status>=500?'PROVIDER_UNKNOWN':'PROVIDER_REJECTED','Search trả HTTP '+r.status,502,r.status===429);const body=await r.json();return z.array(z.object({url:z.string().url(),title:z.string(),description:z.string().default('')})).max(20).parse(body.web?.results||[]);}
}
