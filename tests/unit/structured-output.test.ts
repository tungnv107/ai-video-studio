import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { AIProvider } from '@prisma/client';
import { z } from 'zod';
import { OpenAIAdapter } from '../../src/providers/openai';
import { parseStructuredResponse, withSchemaInstruction } from '../../src/providers/structured-output';
import { config } from '../../src/server/config';
import { encrypt } from '../../src/server/crypto';
import { scriptSchema } from '../../src/domain/schemas';
import { fixtureScript } from '../fixtures';

const previousHosts = [...config.providerHosts];
beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  config.providerHosts.push('9router.tungnv.com');
});
afterAll(() => { config.providerHosts = previousHosts; });
const settings = (host = '9router.tungnv.com') => ({
  id: 'test', kind: 'OPENAI', baseUrl: `https://${host}/v1`, encryptedKey: encrypt('test-only'), llmModel: 'test', timeoutMs: 1000,
}) as AIProvider;
const input = {topic: 'Kiểm thử', duration: 10, language: 'vi', tone: 't', audience: 'a', sources: [], previousTitles: []};
const response = (content: unknown, finish_reason = 'stop') => ({choices: [{message: {content}, finish_reason}]});
const parseScript = (value: unknown) => parseStructuredResponse(value, scriptSchema, 'SCRIPT_SCHEMA', 'Kịch bản AI chưa hợp lệ');

describe('structured responses through compatible relays', () => {
  it('keeps the complete script contract in the first system message when a relay drops response_format', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      // The deployed Codex translator preserves the first system message only.
      const instructions = request.messages.find((message: {role: string}) => message.role === 'system').content;
      const schema = JSON.parse(instructions.split('JSON schema:\n')[1]);
      expect(schema).toEqual(request.response_format.json_schema.schema);
      expect(schema.required).toContain('target_duration');
      expect(schema.properties.scenes.items.required).toContain('narration_text');
      expect(request.response_format.json_schema.strict).toBe(true);
      return Response.json(response('```json\n' + JSON.stringify(fixtureScript) + '\n```'));
    });
    const script = await new OpenAIAdapter(settings(), fetcher).script(input);
    expect(script.target_duration).toBe(10);
    expect(script.compliance_flags).toContain('HUMAN_FACT_REVIEW');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('also supplies the schema for ideas and generic structured calls', async () => {
    const idea = {title: 'Test', problem: 'Test', angle: 'Test', hook: 'Test', audience: 'Test', channelFit: 80, feasibility: 90, feasibilityReason: 'Test', sourceUrls: [], priority: 1};
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      expect(request.messages[0].content).toContain(JSON.stringify(request.response_format.json_schema.schema));
      return Response.json(response(JSON.stringify(request.response_format.json_schema.name === 'ideas' ? {ideas: [idea]} : {ok: true})));
    });
    const adapter = new OpenAIAdapter(settings(), fetcher);
    expect((await adapter.ideas('Test', [])).ideas).toHaveLength(1);
    expect(await adapter.structured('probe', 'Test', {}, z.object({ok: z.boolean()}))).toEqual({ok: true});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('leaves native OpenAI requests and non-structured bodies unchanged', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      expect(request.messages[0].content).not.toContain('JSON schema:\n');
      expect(request.response_format.type).toBe('json_schema');
      return Response.json(response(JSON.stringify(fixtureScript)));
    });
    await new OpenAIAdapter(settings('api.openai.com'), fetcher).script(input);
    const speech = {model: 'test', input: 'Text'};
    expect(withSchemaInstruction(speech)).toBe(speech);
  });

  it('handles text content blocks but never extracts JSON from mixed commentary', () => {
    expect(parseScript(response([{type: 'text', text: JSON.stringify(fixtureScript)}])).title).toBe(fixtureScript.title);
    expect(() => parseScript(response('Here is the result: ' + JSON.stringify(fixtureScript)))).toThrow('không phải JSON hợp lệ');
    expect(() => parseScript(response('```json\n{"title":\n```'))).toThrow('không phải JSON hợp lệ');
  });

  it('reports field and timing failures while keeping validation strict', () => {
    expect(() => parseScript(response(JSON.stringify({...fixtureScript, title: undefined})))).toThrow('title:');
    expect(() => parseScript(response(JSON.stringify({...fixtureScript, target_duration: 45})))).toThrow('Tổng thời lượng');
    const invalidOrder = structuredClone(fixtureScript);
    invalidOrder.scenes[0].scene_order = 2;
    expect(() => parseScript(response(JSON.stringify(invalidOrder)))).toThrow('Thứ tự scene');
  });

  it('rejects truncated or refused responses and does not echo provider content', () => {
    expect(() => parseScript(response(JSON.stringify(fixtureScript), 'length'))).toThrow('bị cắt');
    expect(() => parseScript({choices: [{message: {content: null, refusal: 'Private refusal detail'}}]})).toThrow('Model từ chối');
    expect(() => parseScript(response('secret-raw-output'))).not.toThrow('secret-raw-output');
    expect(() => parseScript({error: 'Private upstream detail'})).toThrow('cấu trúc Chat Completions');
  });

  it('never repairs timing or invented sources with an additional model call', async () => {
    for (const [script, code] of [
      [{...fixtureScript, target_duration: 45}, 'SCRIPT_SCHEMA'],
      [{...fixtureScript, source_references: ['https://invented.example/source']}, 'SOURCE_HALLUCINATION'],
    ] as const) {
      const fetcher = vi.fn(async () => Response.json(response(JSON.stringify(script))));
      await expect(new OpenAIAdapter(settings(), fetcher).script(input)).rejects.toMatchObject({code});
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
