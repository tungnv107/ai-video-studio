import { z } from 'zod';
import { AppError } from '../domain/errors';

// Some compatible relays discard response_format when translating to another API.
// Put the same contract in the first system message, which those relays preserve.
export function withSchemaInstruction(body: Record<string, unknown>) {
  const format = body.response_format as {type?: string; json_schema?: {schema?: unknown}} | undefined;
  if (format?.type !== 'json_schema' || !format.json_schema?.schema || !Array.isArray(body.messages)) return body;
  const instruction = 'Return exactly one JSON object matching the following JSON schema. Include every required field. Do not add Markdown fences or commentary. JSON schema:\n' + JSON.stringify(format.json_schema.schema);
  const messages = body.messages.map(message => ({...message}));
  const index = messages.findIndex(message => message.role === 'system' || message.role === 'developer');
  if (index >= 0 && typeof messages[index].content === 'string') {
    messages[index].content += '\n\n' + instruction;
  } else {
    messages.unshift({role: 'system', content: instruction});
  }
  return {...body, messages};
}

const completionSchema = z.object({choices: z.array(z.object({
  finish_reason: z.string().nullable().optional(),
  message: z.object({content: z.unknown().optional(), refusal: z.string().nullable().optional()}),
})).min(1)});

export function parseStructuredResponse<T>(response: unknown, schema: z.ZodType<T>, code: string, label: string): T {
  const fail = (detail: string): never => { throw new AppError(code, label + ': ' + detail, 502); };
  const completion = completionSchema.safeParse(response);
  if (!completion.success) return fail('Provider trả sai cấu trúc Chat Completions.');
  const choice = completion.data.choices[0];
  if (choice.finish_reason === 'length') return fail('Phản hồi bị cắt do giới hạn độ dài. Hãy giảm độ dài yêu cầu hoặc kiểm tra giới hạn model.');
  if (choice.finish_reason === 'content_filter' || choice.message.refusal) return fail('Model từ chối tạo nội dung theo yêu cầu.');
  let content = choice.message.content;
  if (Array.isArray(content)) {
    const parts = z.array(z.object({type: z.literal('text'), text: z.string()})).safeParse(content);
    if (parts.success) content = parts.data.map(part => part.text).join('');
  }
  if (typeof content !== 'string' || !content.trim()) return fail('Provider không trả nội dung JSON.');
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  let value: unknown;
  try { value = JSON.parse(fenced ? fenced[1] : trimmed); }
  catch { return fail('Phản hồi không phải JSON hợp lệ. Kiểm tra hỗ trợ JSON schema của model/relay.'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join('.') || 'script'}: ${issue.message}`).join('; ');
    return fail('Dữ liệu không đạt schema — ' + details.slice(0, 600));
  }
  return parsed.data;
}
