import { DatabaseService, type BatchTestSortKey } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';
import { formatDurationHuman } from './formatters';
import { getVelesPublicBacktestUrl } from '../config/velesDomains';

const CSV_HEADERS = [
  'ID',
  'Ссылка',
  'Шаблон',
  'Название',
  'Символ',
  'Биржа',
  'Направление',
  'Дата (От)',
  'Дата (До)',
  'Дней (Всего)',
  'Net (USDT)',
  'Net / МПУ',
  'Эфф. в день (USDT)',
  'Сделки (Всего)',
  'Сделок в день',
  'Win Rate (%)',
  'МПП (USDT)',
  'МПП (%)',
  'МПУ (USDT)',
  'МПУ (%)',
  'Ср. время сделки',
  'Макс. время сделки'
];

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeCsv = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const toCsvLine = (item: BacktestResultItem): string => {
  const start = new Date(item.from).getTime();
  const end = new Date(item.to).getTime();
  const daysCount = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));

  const totalDeals = toNumber(item.totalDeals, 0);
  const dealsPerDay = totalDeals / daysCount;
  const netQuote = toNumber(item.netQuote, 0);
  const netQuotePerDay = toNumber(item.netQuotePerDay, 0);

  const profits = toNumber(item.profits, 0);
  const losses = toNumber(item.losses, 0);
  const totalClosed = profits + losses;
  const winRate = totalClosed > 0 ? ((profits / totalClosed) * 100).toFixed(2) : '0.00';

  const mfeVal = toNumber(item.mfeAbsolute, 0);
  const maeVal = toNumber(item.maeAbsolute, 0);
  const mfePct = toNumber(item.mfePercent, 0);
  const maePct = toNumber(item.maePercent, 0);

  const recovery = Math.abs(maeVal) > 0.0001 ? (netQuote / Math.abs(maeVal)).toFixed(2) : '0.00';

  return [
    item.id,
    getVelesPublicBacktestUrl(item.id),
    item.sourceTemplateUrl ?? '',
    escapeCsv(item.name || ''),
    item.symbol,
    item.exchange,
    item.algorithm,
    new Date(item.from).toLocaleDateString(),
    new Date(item.to).toLocaleDateString(),
    daysCount.toFixed(1),
    netQuote.toFixed(2),
    recovery,
    netQuotePerDay.toFixed(2),
    totalDeals,
    dealsPerDay.toFixed(1),
    winRate,
    mfeVal.toFixed(2),
    mfePct.toFixed(2),
    maeVal.toFixed(2),
    maePct.toFixed(2),
    escapeCsv(formatDurationHuman(toNumber(item.avgDuration, 0))),
    escapeCsv(formatDurationHuman(toNumber(item.maxDuration, 0)))
  ].join(';');
};

const downloadBlob = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download === undefined) return;
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export function downloadAsCsv(data: BacktestResultItem[], filename = 'veles-results.csv') {
  if (!data || data.length === 0) return;
  const rows = data.map(toCsvLine);
  const csvContent = `\uFEFF${[CSV_HEADERS.join(';'), ...rows].join('\n')}`;
  downloadBlob(csvContent, filename);
}

export async function downloadBatchAsCsv(options: {
  batchId: string;
  filename?: string;
  sortKey?: BatchTestSortKey;
  reversed?: boolean;
  chunkSize?: number;
}) {
  const { batchId, filename = 'veles-results.csv', sortKey = 'date', reversed = true, chunkSize = 1000 } = options;
  if (!batchId) return;

  const rows: string[] = [];
  let offset = 0;
  const limit = Math.max(100, chunkSize);

  while (true) {
    const page = await DatabaseService.getBatchTestsPage({
      batchId,
      sortKey,
      reversed,
      offset,
      limit
    });

    if (page.items.length === 0) break;
    rows.push(...page.items.map(toCsvLine));
    offset += page.items.length;
    if (offset >= page.total) break;
  }

  if (rows.length === 0) return;
  const csvContent = `\uFEFF${[CSV_HEADERS.join(';'), ...rows].join('\n')}`;
  downloadBlob(csvContent, filename);
}
