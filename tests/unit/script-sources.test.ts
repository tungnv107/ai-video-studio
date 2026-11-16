import {beforeAll, describe, expect, it, vi} from 'vitest';
import {randomBytes} from 'node:crypto';
import type {AIProvider} from '@prisma/client';
import {z} from 'zod';
import {OpenAIAdapter} from '../../src/providers/openai';
import {scriptSchemaForSources, validateScriptSources} from '../../src/providers/script-sources';
import {encrypt} from '../../src/server/crypto';
import {fixtureScript} from '../fixtures';

beforeAll(()=>{process.env.ENCRYPTION_KEY=randomBytes(32).toString('base64');});
const link='https://aihub.tungnv.com/register';
const input={topic:'Đăng ký tại '+link, duration:10, language:'vi', tone:'Dễ hiểu', audience:'Người xem', sources:[] as {url:string;title:string;excerpt:string}[], previousTitles:[]};
const provider=()=>({id:'test',kind:'OPENAI',baseUrl:'https://api.openai.com/v1',encryptedKey:encrypt('test-only'),llmModel:'test',timeoutMs:1000}) as AIProvider;

describe('research citations and links in the topic',()=>{
  it('requires an empty citation list in the provider schema when no sources were supplied',()=>{
    const schema=scriptSchemaForSources([]);
    const output={...fixtureScript,scenes:fixtureScript.scenes.map(scene=>({...scene,graphic:null}))};
    expect(schema.safeParse(output).success).toBe(true);
    expect(schema.safeParse({...output,source_references:[link]}).success).toBe(false);
    const json=z.toJSONSchema(schema,{target:'draft-7'});
    expect(json.properties?.source_references).toMatchObject({maxItems:0});
  });

  it('constrains citations to exact supplied URLs',()=>{
    const source={url:'https://example.com/evidence',title:'Evidence',excerpt:'Provided evidence.'};
    const schema=scriptSchemaForSources([source]);
    const output={...fixtureScript,scenes:fixtureScript.scenes.map(scene=>({...scene,graphic:null})),source_references:[source.url]};
    expect(schema.safeParse(output).success).toBe(true);
    expect(schema.safeParse({...output,source_references:['https://example.com/another-page']}).success).toBe(false);
  });

  it('keeps a supplied CTA in the narration without claiming it is research or calling the model again',async()=>{
    const script=structuredClone(fixtureScript);
    script.source_references=[link];
    script.scenes[1].narration_text='Đăng ký tại '+link;
    const fetcher=vi.fn(async(_url:string|URL|Request,options?:RequestInit)=>{
      const request=JSON.parse(String(options?.body));
      expect(request.response_format.json_schema.schema.properties.source_references.maxItems).toBe(0);
      expect(request.messages[0].content).toContain('sources=[] thì bắt buộc source_references=[]');
      return Response.json({choices:[{message:{content:JSON.stringify(script)}}]});
    });
    const result=await new OpenAIAdapter(provider(),fetcher).script(input);
    expect(result.source_references).toEqual([]);
    expect(result.scenes[1].narration_text).toBe(script.scenes[1].narration_text);
    expect(result.compliance_flags).toEqual(expect.arrayContaining(['TOPIC_LINKS_NOT_RESEARCH_SOURCES','UNVERIFIED_FACTS','HUMAN_FACT_REVIEW']));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retains a topic URL when it also has an explicitly supplied source excerpt',()=>{
    const script={...structuredClone(fixtureScript),source_references:[link]};
    const result=validateScriptSources(script,{...input,sources:[{url:link,title:'Provided page',excerpt:'Provided text'}]});
    expect(result.source_references).toEqual([link]);
    expect(result.compliance_flags).not.toContain('TOPIC_LINKS_NOT_RESEARCH_SOURCES');
  });

  it('still rejects invented URLs, changed paths and mixed real/invented citations',()=>{
    for(const references of [['https://invented.example/paper'],[link,'https://invented.example/paper'],['https://aihub.tungnv.com/pricing']]){
      expect(()=>validateScriptSources({...structuredClone(fixtureScript),source_references:references},input)).toThrow('AI tự thêm nguồn');
    }
  });

  it('does not let a topic link support chart data',()=>{
    const script=structuredClone(fixtureScript);
    script.scenes[0].graphic={kind:'STAT',title:'Test',unit:'%',items:[{label:'Test',value:99}],sourceUrl:link};
    expect(()=>validateScriptSources(script,input)).toThrow('nguồn đồ họa');
    script.scenes[0].graphic.sourceUrl=null;
    expect(()=>validateScriptSources(script,input)).toThrow('Biểu đồ AI cần nguồn');
  });

  it('restricts unsourced graphics to steps and bounds sourced graphics to the supplied URLs',()=>{
    const script=structuredClone(fixtureScript);
    script.scenes.forEach(scene=>{scene.graphic=null;});
    script.scenes[0].graphic={kind:'STEPS',title:'Test',unit:'',items:[{label:'Test',value:1}],sourceUrl:null};
    expect(scriptSchemaForSources([]).safeParse(script).success).toBe(true);
    script.scenes[0].graphic.kind='STAT';
    expect(scriptSchemaForSources([]).safeParse(script).success).toBe(false);
    const schema=scriptSchemaForSources([{url:link,title:'Test',excerpt:'Data'}]);
    script.scenes[0].graphic.sourceUrl=link;
    expect(schema.safeParse(script).success).toBe(true);
    script.scenes[0].graphic.sourceUrl='https://invented.example';
    expect(schema.safeParse(script).success).toBe(false);
  });
});
