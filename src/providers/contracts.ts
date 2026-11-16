import type { ScriptData } from '../domain/schemas';
export type ResearchInput = { topic:string;duration:number;language:string;tone:string;audience:string;sources:{url:string;title:string;excerpt:string}[];previousTitles:string[];researchBrief?:unknown };
export interface AIAdapter {
  script(input:ResearchInput):Promise<ScriptData>;
  image(prompt:string,aspect:string,quality:string):Promise<Buffer>;
  speech(text:string,voice:string):Promise<Buffer>;
}
