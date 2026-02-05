// src/utils/formatters.ts
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

// Инициализация плагинов
dayjs.extend(duration);
dayjs.extend(relativeTime);

export const formatMoney = (val: number | null | undefined, currency = 'USDT'): string => {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(2)} ${currency}`;
};

export const formatPercent = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(2)}%`;
};

export const formatDurationHuman = (seconds: number | null | undefined): string => {
  if (!seconds) return '—';
  const d = dayjs.duration(seconds, 'seconds');
  
  if (d.asDays() >= 1) return `${Math.floor(d.asDays())} д ${d.hours()} ч`;
  if (d.asHours() >= 1) return `${Math.floor(d.asHours())} ч ${d.minutes()} мин`;
  return `${Math.floor(d.asMinutes())} мин`;
};

export const formatDate = (iso: string): string => {
    return dayjs(iso).format('DD.MM.YYYY');
};

export const formatDateTime = (iso: string): string => {
    return dayjs(iso).format('DD.MM.YYYY HH:mm');
};