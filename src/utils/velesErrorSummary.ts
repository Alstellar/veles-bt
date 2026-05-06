import type { VelesHttpTrace } from '../types/velesTrace';

const NAME_TOO_LONG_MESSAGE = 'имя теста слишком длинное';
const NAME_TOO_LONG_STOP_MESSAGE = `Очередь остановлена: ${NAME_TOO_LONG_MESSAGE}. Сократите префикс и запустите заново.`;
const GENERIC_MESSAGES = new Set(['error', 'unknown error', '[object object]', 'bad request', 'precondition failed']);
const MESSAGE_KEYS = new Set([
  'message',
  'error',
  'detail',
  'details',
  'reason',
  'description',
  'title',
  'localizedMessage',
  'defaultMessage',
]);

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

function normalizeKnownMessage(value: string, context?: { field?: string; code?: string }): string {
  const lowered = value.toLowerCase();
  if (
    context?.field === 'name' &&
    (context?.code?.toLowerCase() === 'length' || lowered.includes('1') && lowered.includes('100'))
  ) {
    return NAME_TOO_LONG_MESSAGE;
  }
  return value;
}

function isUsefulMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !GENERIC_MESSAGES.has(normalized);
}

function pushUnique(output: string[], value: unknown, context?: { field?: string; code?: string }) {
  const text = normalizeKnownMessage(cleanText(value), context);
  if (!isUsefulMessage(text)) return;
  if (!output.includes(text)) output.push(text);
}

function collectFieldErrors(value: unknown, output: string[]) {
  if (!value || typeof value !== 'object') return;
  const errors = (value as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return;

  errors.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const field = cleanText(record.field ?? record.fieldName ?? record.property ?? record.path ?? record.param);
    const code = cleanText(record.code);
    const message = normalizeKnownMessage(
      cleanText(record.message ?? record.defaultMessage ?? record.reason ?? record.error ?? record.detail),
      { field, code }
    );
    if (field && message && isUsefulMessage(message)) {
      pushUnique(output, `${field}: ${message}`);
    }
  });
}

function collectMessages(value: unknown, output: string[], depth = 0) {
  if (output.length >= 8 || depth > 5 || value === null || value === undefined) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    pushUnique(output, value);
    return;
  }

  if (Array.isArray(value)) {
    value.slice(0, 12).forEach((item) => collectMessages(item, output, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  Object.entries(record).forEach(([key, nested]) => {
    if (output.length >= 8) return;
    if (MESSAGE_KEYS.has(key)) {
      pushUnique(output, nested);
      return;
    }
    if (
      key === 'fieldErrors' ||
      key === 'violations' ||
      key === 'details' ||
      key === 'causes'
    ) {
      collectMessages(nested, output, depth + 1);
    }
  });

  if (output.length === 0) {
    Object.values(record).slice(0, 12).forEach((nested) => collectMessages(nested, output, depth + 1));
  }
}

export function getTraceErrorDetails(trace?: VelesHttpTrace): string {
  if (!trace) return '';

  const messages: string[] = [];
  collectFieldErrors(trace.response?.bodyJson, messages);
  collectMessages(trace.response?.bodyJson, messages);
  if (messages.length === 0) {
    pushUnique(messages, trace.response?.bodyText);
  }
  if (messages.length === 0) {
    pushUnique(messages, trace.error?.message);
  }

  return messages.slice(0, 3).join('; ');
}

export function isBacktestNameTooLongError(trace?: VelesHttpTrace): boolean {
  const body = trace?.response?.bodyJson;
  if (!body || typeof body !== 'object') return false;

  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;

  return errors.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    const field = String(record.field ?? '').toLowerCase();
    const code = String(record.code ?? '').toLowerCase();
    const message = String(record.message ?? '').toLowerCase();
    return field === 'name' && (code === 'length' || message.includes('1') && message.includes('100'));
  });
}

export function getBacktestNameTooLongStopMessage(): string {
  return NAME_TOO_LONG_STOP_MESSAGE;
}

export function buildQueueErrorSummary(options: {
  stage: 'launch' | 'status' | 'stats';
  index: number;
  total: number;
  fallback?: unknown;
  trace?: VelesHttpTrace;
}): string {
  const stageLabel =
    options.stage === 'launch'
      ? 'запуска'
      : options.stage === 'status'
        ? 'проверки статуса'
        : 'получения статистики';

  const http = options.trace?.response
    ? `HTTP ${options.trace.response.status} ${options.trace.method} ${options.trace.url}`
    : '';
  const details = getTraceErrorDetails(options.trace);
  const fallback = cleanText(options.fallback);
  const usefulFallback = isUsefulMessage(fallback) ? fallback : '';
  const reason = details || usefulFallback || options.trace?.error?.message || 'Не удалось получить детали ошибки';

  return `Ошибка ${stageLabel} теста ${options.index}/${options.total}: ${[http, reason].filter(Boolean).join(' - ')}`;
}
