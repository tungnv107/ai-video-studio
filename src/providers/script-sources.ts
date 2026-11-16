import { z } from 'zod';
import { invariant } from '../domain/errors';
import { providerScriptSchema, type ScriptData } from '../domain/schemas';
import { graphicSchema } from '../domain/graphics';
import type { ResearchInput } from './contracts';

export function scriptSchemaForSources(sources: ResearchInput['sources']) {
  const urls = [...new Set(sources.map(source => source.url))];
  const references = urls.length
    ? z.array(z.enum(urls as [string, ...string[]]))
    : z.array(z.string().url()).max(0);
  const graphic = urls.length
    ? graphicSchema.extend({sourceUrl: z.enum(urls as [string, ...string[]]).nullable()})
    : graphicSchema.extend({kind: z.enum(['STEPS']), sourceUrl: z.null()});
  return providerScriptSchema.extend({
    source_references: references.describe('Only exact URLs from the input sources array. Links in topic, narration or CTA are not research sources. With no sources, return [].'),
    scenes: z.array(providerScriptSchema.shape.scenes.element.extend({graphic: graphic.nullable()})).min(1).max(120),
  });
}

function normalizedUrl(value: string) {
  try { return new URL(value).href; } catch { return value; }
}

export function validateScriptSources(data: ScriptData, input: ResearchInput) {
  const allowed = new Set(input.sources.map(source => source.url));
  const topicLinks = new Set((input.topic.match(/https?:\/\/[^\s<>"']+/g) || [])
    .map(link => normalizedUrl(link.replace(/[),.;!?\]]+$/, ''))));
  // A literal link from the brief may be used in the CTA, but must not be
  // represented as research evidence. Never fetch it or promote it to a source.
  const references = data.source_references.filter(url => allowed.has(url) || !topicLinks.has(normalizedUrl(url)));
  if (references.length !== data.source_references.length) {
    data.source_references = references;
    if (!data.compliance_flags.includes('TOPIC_LINKS_NOT_RESEARCH_SOURCES')) data.compliance_flags.push('TOPIC_LINKS_NOT_RESEARCH_SOURCES');
  }
  invariant(data.source_references.every(url => allowed.has(url)), 'SOURCE_HALLUCINATION', input.sources.length
    ? 'AI trích dẫn nguồn ngoài danh sách nguồn tham khảo đã nhập.'
    : 'AI tự thêm nguồn tham khảo dù chưa có nguồn đầu vào. Cần để danh sách nguồn rỗng hoặc nhập nguồn kèm trích đoạn.');
  invariant(data.scenes.every(scene => !scene.graphic?.sourceUrl || allowed.has(scene.graphic.sourceUrl)), 'SOURCE_HALLUCINATION', 'AI trả nguồn đồ họa không có trong dữ liệu.');
  invariant(data.scenes.every(scene => !scene.graphic || scene.graphic.kind === 'STEPS' || !!scene.graphic.sourceUrl), 'CHART_SOURCE', 'Biểu đồ AI cần nguồn số liệu đã cung cấp.');
  return data;
}
