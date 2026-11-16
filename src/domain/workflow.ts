import { createHash } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { AppError } from './errors';
export function topicHash(value:string) { return createHash('sha256').update(value.normalize('NFKC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu,' ').trim()).digest('hex'); }
export function nextRun(cron:string, timezone:string, after:Date) {
  try { new Intl.DateTimeFormat('vi',{timeZone:timezone}); return CronExpressionParser.parse(cron,{tz:timezone,currentDate:after}).next().toDate(); }
  catch { throw new AppError('INVALID_SCHEDULE','Cron hoặc múi giờ không hợp lệ.'); }
}
export const editableStatuses = ['DRAFT','SCRIPT_READY','AWAITING_APPROVAL','QA_FAILED','APPROVED','FAILED'];
export function canApprove(status:string, qaScore:number|null, flags:string[]) {
  return status === 'AWAITING_APPROVAL' && (qaScore ?? 0) >= 85 && !flags.includes('TECHNICAL_FAILURE');
}
export function isHighRisk(topic:string) { return /y tế|chữa bệnh|thuốc|đầu tư|tài chính|pháp luật|medical|invest|legal/iu.test(topic); }
export const statusLabels:Record<string,string> = {
  DRAFT:'Bản nháp', SCHEDULED:'Đã lên lịch', RESEARCHING:'Đang nghiên cứu', RESEARCH_COMPLETED:'Đã nghiên cứu',
  SCRIPT_GENERATING:'Đang viết kịch bản', SCRIPT_READY:'Kịch bản sẵn sàng', ASSET_GENERATING:'Đang tạo hình ảnh',
  AUDIO_GENERATING:'Đang tạo giọng đọc', RENDERING:'Đang dựng video', RENDERED:'Đã dựng', QA_RUNNING:'Đang kiểm tra',
  QA_FAILED:'Chưa đạt QA', AWAITING_APPROVAL:'Chờ phê duyệt', APPROVED:'Đã duyệt', READY_TO_PUBLISH:'Sẵn sàng đăng',
  UPLOADING:'Đang tải lên', PLATFORM_PROCESSING:'Nền tảng xử lý', PLATFORM_SCHEDULED:'Nền tảng đã hẹn lịch',
  PUBLISHED:'Đã công khai', FAILED:'Có lỗi', CANCELLED:'Đã hủy'
};
