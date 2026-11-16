import {it,expect} from 'vitest';
import {z} from 'zod';
import {graphicSchema,graphicSvg} from '../../src/domain/graphics';
import {providerScriptSchema,scriptSchema} from '../../src/domain/schemas';
import {scriptEditRequestSchema,validateScriptEdit} from '../../src/domain/script-edits';
import {fixtureScript} from '../fixtures';
it('rejects executable source URLs, negative chart values and excessive data points',()=>{
 const g={kind:'BARS',title:'Test',unit:'',items:[{label:'A',value:2}],sourceUrl:null};
 expect(graphicSchema.safeParse({...g,sourceUrl:'javascript:alert(1)'}).success).toBe(false);
 expect(graphicSchema.safeParse({...g,items:[{label:'A',value:-1}]}).success).toBe(false);
 expect(graphicSchema.safeParse({...g,items:Array.from({length:7},()=>g.items[0])}).success).toBe(false);
});
it('escapes SVG text while preserving Vietnamese and handles a zero-valued chart',()=>{
 const svg=graphicSvg({kind:'BARS',title:'Tiếng Việt <script>',unit:'&',items:[{label:'Giá trị <g>',value:0}],sourceUrl:null},1080,1920,{background:'#111827',accent:'#818cf8'});
 expect(svg).toContain('Tiếng Việt');expect(svg).toContain('&lt;script&gt;');expect(svg).not.toContain('<script>');expect(svg).not.toContain('NaN');expect(svg).not.toContain('Infinity');
});
it('keeps old scripts readable but requires explicit graphic null in new provider contracts',()=>{
 expect(scriptSchema.parse(fixtureScript).scenes[0].graphic).toBeUndefined();
 const schema=z.toJSONSchema(providerScriptSchema) as any;
 expect(schema.properties.scenes.items.required).toContain('graphic');
 const candidate=structuredClone(fixtureScript);candidate.scenes.forEach(s=>s.graphic=null);
 expect(()=>validateScriptEdit({request:{kind:'SCENE',sceneOrder:1,expectedRevision:1,instruction:'',allowAdditionalCost:false},script:fixtureScript,lockedScenes:[2],sources:[]},{proposals:[{label:'Test',script:candidate}]})).not.toThrow();
});
it('allows editing long-video scenes and rejects invented chart sources in AI proposals',()=>{
 expect(scriptEditRequestSchema.parse({kind:'SCENE',sceneOrder:120,expectedRevision:1}).kind).toBe('SCENE');
 const candidate=structuredClone(fixtureScript);candidate.scenes[0].graphic={kind:'STAT',title:'Test',unit:'',items:[{label:'Test',value:10}],sourceUrl:'https://invented.example/data'};
 expect(()=>validateScriptEdit({request:{kind:'SCENE',sceneOrder:1,expectedRevision:1,instruction:'',allowAdditionalCost:false},script:fixtureScript,lockedScenes:[],sources:[]},{proposals:[{label:'Test',script:candidate}]})).toThrow(/nguồn biểu đồ/);
});
