import type { Json, LogEvent } from './schema.js';

const sensitiveKey = /password|passwd|secret|token|authorization|cookie|api[_-]?key|credential/i;
const cleanString = (value: string): string =>
  value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(password|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s,"';]+["']?/gi,
      '$1=[REDACTED]',
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@');

export function redact(value: Json): Json {
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}
export function redactEvent(value: LogEvent): LogEvent {
  return {
    ...value,
    service: cleanString(value.service),
    event: cleanString(value.event),
    ...(value.message !== undefined ? { message: cleanString(value.message) } : {}),
    ...(value.orderId !== undefined ? { orderId: cleanString(value.orderId) } : {}),
    ...(value.traceId !== undefined ? { traceId: cleanString(value.traceId) } : {}),
    ...(value.requestId !== undefined ? { requestId: cleanString(value.requestId) } : {}),
    ...(value.release !== undefined ? { release: cleanString(value.release) } : {}),
    ...(value.data !== undefined
      ? {
          data: Object.fromEntries(
            Object.entries(value.data).map(([key, item]) => [
              key,
              sensitiveKey.test(key) ? '[REDACTED]' : redact(item),
            ]),
          ),
        }
      : {}),
  };
}
export const redactText = cleanString;
