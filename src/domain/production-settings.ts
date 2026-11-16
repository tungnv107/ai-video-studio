import {z} from 'zod';
const color=z.string().regex(/^#[\da-fA-F]{6}$/);
export const productionSettingsSchema=z.object({
 providerIds:z.object({LLM:z.string().optional(),IMAGE:z.string().optional(),TTS:z.string().optional(),VIDEO:z.string().optional(),ALIGNMENT:z.string().optional(),SEARCH:z.string().optional()}).default({}),
 voiceSpeed:z.number().min(.5).max(1.5).default(1),voiceInstructions:z.string().max(500).default(''),
 narrationTiming:z.enum(['NATURAL','FIT_SCENES']).default('NATURAL'),
 fps:z.union([z.literal(24),z.literal(25),z.literal(30)]).default(30),transition:z.enum(['cut','fade']).default('cut'),
 subtitle:z.object({font:z.enum(['DejaVu Sans','DejaVu Serif','DejaVu Sans Mono']).default('DejaVu Sans'),size:z.number().min(.025).max(.08).default(.055),color:color.default('#ffffff'),highlightColor:color.default('#facc15'),bottom:z.number().min(.05).max(.35).default(.2),margin:z.number().min(.05).max(.2).default(.09),highlight:z.boolean().default(false),alignment:z.enum(['PROPORTIONAL','FORCED']).default('PROPORTIONAL')}).default({font:'DejaVu Sans',size:.055,color:'#ffffff',highlightColor:'#facc15',bottom:.2,margin:.09,highlight:false,alignment:'PROPORTIONAL'}),
 intro:z.string().max(120).default(''),outro:z.string().max(120).default(''),cardDuration:z.number().min(1).max(5).default(2),background:color.default('#111827'),accent:color.default('#6366f1'),
 logoMediaId:z.string().optional(),musicMediaId:z.string().optional(),footageMediaId:z.string().optional(),musicVolume:z.number().min(.01).max(.3).default(.1),
 visualMode:z.enum(['IMAGE','TEXT_VIDEO','IMAGE_VIDEO','HYBRID','FOOTAGE','GRAPHICS']).default('IMAGE'),
 thumbnailTitle:z.boolean().default(true),researchUrls:z.array(z.string().url()).max(10).default([]),researchEnabled:z.boolean().default(false),semanticDedupe:z.boolean().default(false),dedupeThreshold:z.number().min(.8).max(.999).default(.94),
 qa:z.object({minimumScore:z.number().min(85).max(100).default(85),maxSilenceRatio:z.number().min(.05).max(.8).default(.5),maxBlackRatio:z.number().min(.01).max(.5).default(.15),maxCharactersPerSecond:z.number().min(10).max(60).default(35),contentReview:z.boolean().default(false)}).default({minimumScore:85,maxSilenceRatio:.5,maxBlackRatio:.15,maxCharactersPerSecond:35,contentReview:false})
});
export type ProductionSettings=z.infer<typeof productionSettingsSchema>;
export function productionSettings(value:unknown){return productionSettingsSchema.parse(value||{});}
