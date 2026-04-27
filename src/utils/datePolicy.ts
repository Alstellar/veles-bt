import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export type DateLikeInput = Date | string | number | null | undefined;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/;
const DD_MM_YYYY_RE = /^\d{2}\.\d{2}\.\d{4}$/;

const cloneValidDate = (value: Date): Date | null => {
  if (Number.isNaN(value.getTime())) return null;
  return new Date(value.getTime());
};

export const parseDateLike = (value: DateLikeInput): Date | null => {
  if (value instanceof Date) {
    return cloneValidDate(value);
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return cloneValidDate(parsed);
  }

  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  if (DD_MM_YYYY_RE.test(raw)) {
    const parsed = dayjs(raw, 'DD.MM.YYYY', true);
    return parsed.isValid() ? parsed.toDate() : null;
  }

  if (ISO_DATE_RE.test(raw)) {
    const parsed = dayjs(raw, 'YYYY-MM-DD', true);
    return parsed.isValid() ? parsed.toDate() : null;
  }

  if (ISO_DATETIME_RE.test(raw)) {
    const parsed = dayjs(raw);
    return parsed.isValid() ? parsed.toDate() : null;
  }

  return null;
};

export const toIsoDateTime = (value: DateLikeInput): string | null => {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  return parsed.toISOString();
};

export const toIsoDateOnly = (value: DateLikeInput): string | null => {
  const iso = toIsoDateTime(value);
  return iso ? iso.slice(0, 10) : null;
};

