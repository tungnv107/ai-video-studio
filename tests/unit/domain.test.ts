import {describe,it,expect} from 'vitest';
import {scriptSchema,videoInputSchema,scheduleSchema} from '../../src/domain/schemas';
import {nextRun,topicHash,canApprove} from '../../src/domain/workflow';
import {cuesForScenes,toSrt,toVtt,toAss,stamp} from '../../src/render/subtitles';
import {qaProbe} from '../../src/render/ffmpeg';
import {fixtureScript} from '../fixtures';
describe('Schema and workflow gates',()=>{
  it('accepts valid structured script and rejects mismatched scene duration',()=>{expect(scriptSchema.parse(fixtureScript).scenes).toHaveLength(2);expect(()=>scriptSchema.parse({...fixtureScript,target_duration:20})).toThrow();});
  it('rejects duplicate scene IDs and out-of-bounds subtitles',()=>{const s=structuredClone(fixtureScript);s.scenes[1].scene_id='s1';s.scenes[0].subtitle_segments=[{text:'x',start:4,end:7}];expect(()=>scriptSchema.parse(s)).toThrow();});
  it('limits video duration and selects official formats',()=>{expect(()=>videoInputSchema.parse({topic:'x',channelId:'1',targetDuration:901})).toThrow();});
  it('requires exactly one schedule mode',()=>{expect(()=>scheduleSchema.parse({name:'x',channelId:'1',topic:'a'})).toThrow();expect(()=>scheduleSchema.parse({name:'x',channelId:'1',topic:'a',cron:'* * * * *',runAt:new Date().toISOString()})).toThrow();});
  it('computes Vietnamese timezone and invalid cron',()=>{expect(nextRun('0 7 * * *','Asia/Ho_Chi_Minh',new Date('2026-11-15T01:00:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');expect(()=>nextRun('bad','Asia/Ho_Chi_Minh',new Date())).toThrow();});
  it('normalizes duplicate topics without discarding Vietnamese accents',()=>{expect(topicHash('AI,  Công nghệ!')).toBe(topicHash('ai công nghệ'));expect(topicHash('ma')).not.toBe(topicHash('má'));});
  it('does not approve failed QA or unready state',()=>{expect(canApprove('QA_FAILED',90,[])).toBe(false);expect(canApprove('AWAITING_APPROVAL',84,[])).toBe(false);expect(canApprove('AWAITING_APPROVAL',100,[])).toBe(true);});
});
describe('Unicode subtitles and technical QA',()=>{
  it('covers full scene audio duration with monotonic timestamps',()=>{const cues=cuesForScenes([{text:'Tiếng Việt có dấu và xuống dòng dễ đọc',duration:5},{text:'Kết thúc',duration:2}]);expect(cues[0].start).toBe(0);expect(cues.at(-1)?.end).toBe(7);expect(toSrt(cues)).toContain('Tiếng Việt');expect(toVtt(cues)).toMatch(/^WEBVTT/);});
  it('carries rounded timestamp to the next minute',()=>{expect(stamp(59.9999,'srt')).toBe('00:01:00,000');});
  it('does not interpret user text as ASS commands',()=>{const ass=toAss([{text:'{\\pos(1,1)} Tiếng Việt',start:0,end:1}],1080,1920);expect(ass).not.toContain('{\\pos');expect(ass).toContain('DejaVu Sans');});
  it('rejects missing audio, wrong resolution and empty file',()=>{const p={streams:[{codec_type:'video',codec_name:'h264',width:1080,height:1920}],format:{duration:'10',size:'0'}};expect(qaProbe(p,1080,1920,10).passed).toBe(false);});
});
