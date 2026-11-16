import {describe,it,expect,vi,beforeAll} from 'vitest';
import {randomBytes} from 'node:crypto';
import type {AIProvider} from '@prisma/client';
import {providerResponseError} from '../../src/providers/response-error';
import {OpenAIAdapter} from '../../src/providers/openai';
import {encrypt} from '../../src/server/crypto';
beforeAll(()=>process.env.ENCRYPTION_KEY=randomBytes(32).toString('base64'));
describe('Actionable and bounded provider diagnostics',()=>{
  it('explains missing relay credentials without exposing upstream secrets or prompts',async()=>{
    const error=await providerResponseError(Response.json({error:{message:'No credentials for provider: openai; sk-secret-test https://internal.invalid/private prompt contents'}},{status:400}),'/images/generations','gpt-image-2.5-flare');
    expect(error).toMatchObject({code:'PROVIDER_REJECTED',retryable:false});expect(error.message).toContain('Tạo ảnh');expect(error.message).toContain('cx/<model ảnh>');expect(error.message).not.toMatch(/sk-secret|internal.invalid|prompt contents/);
  });
  it('keeps server failures uncertain and throttling retryable',async()=>{
    expect(await providerResponseError(new Response('',{status:503}),'/audio/speech','edge-tts/vi-VN-HoaiMyNeural')).toMatchObject({code:'PROVIDER_UNKNOWN',retryable:false});
    expect(await providerResponseError(new Response('',{status:429}),'/audio/speech','tts')).toMatchObject({code:'PROVIDER_RATE_LIMIT',retryable:true});
  });
  it('cancels a large error stream after a bounded prefix and never echoes it',async()=>{
    const cancel=vi.fn(),stream=new ReadableStream({pull(controller){controller.enqueue(new TextEncoder().encode('secret'.repeat(2000)));},cancel});
    const error=await providerResponseError(new Response(stream,{status:400}),'/audio/speech','invalid model\nsecret');
    expect(cancel).toHaveBeenCalledTimes(1);expect(error.message).not.toContain('secret');
  });
  it('uses the Vietnamese Edge voice from its model and requests binary MP3 exactly once',async()=>{
    const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
      expect(JSON.parse(String(init?.body))).toMatchObject({model:'edge-tts/vi-VN-HoaiMyNeural',voice:'vi-VN-HoaiMyNeural',input:'Xin chào Việt Nam.',response_format:'mp3'});
      return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});
    });
    const settings={kind:'OPENAI',baseUrl:'https://api.openai.com/v1',encryptedKey:encrypt('test-only'),ttsModel:'edge-tts/vi-VN-HoaiMyNeural',timeoutMs:1000} as AIProvider;
    expect(await new OpenAIAdapter(settings,fetcher).speech('Xin chào Việt Nam.','alloy')).toEqual(Buffer.from([1,2,3]));expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OpenAIAdapter(settings,async()=>Response.json({error:'not audio'})).speech('x','alloy')).rejects.toMatchObject({code:'TTS_AUDIO'});
  });
});
