export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
export function invariant(value: unknown, code: string, message: string, status = 400): asserts value {
  if (!value) throw new AppError(code, message, status);
}
export function safeError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return 'Lỗi xử lý nội bộ. Xem mã công việc trong nhật ký hệ thống.';
}
