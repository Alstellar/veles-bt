import type { ExchangeType } from '../types';

export type QuoteCurrency = 'USDT' | 'USDC';

const EXCHANGE_QUOTE: Partial<Record<ExchangeType, QuoteCurrency>> = {
  HYPERLIQUID_FUTURES: 'USDC'
};

const KNOWN_QUOTES: QuoteCurrency[] = ['USDT', 'USDC'];

export const getExchangeQuoteCurrency = (exchange: ExchangeType): QuoteCurrency => {
  return EXCHANGE_QUOTE[exchange] ?? 'USDT';
};

export const getSymbolBase = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return '';
  if (normalized.includes('/')) return normalized.split('/')[0]?.trim() ?? '';

  for (const quote of KNOWN_QUOTES) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return normalized.slice(0, -quote.length);
    }
  }

  return normalized;
};

export const normalizePairForExchange = (value: string, exchange: ExchangeType): string | null => {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const cleaned = raw.replace(/['"`]/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  const quote = getExchangeQuoteCurrency(exchange);
  if (cleaned.includes('/')) {
    const [base, quoteRaw] = cleaned.split('/');
    if (!base) return null;
    return `${base}/${quoteRaw || quote}`;
  }

  if (cleaned.endsWith(quote) && cleaned.length > quote.length) {
    return `${cleaned.slice(0, -quote.length)}/${quote}`;
  }

  return `${cleaned}/${quote}`;
};

export const isPairForExchange = (value: unknown, exchange: ExchangeType): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return false;

  const quote = getExchangeQuoteCurrency(exchange);
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length !== 2) return false;
    const [base, pairQuote] = parts;
    return Boolean(base) && pairQuote === quote;
  }

  return normalized.endsWith(quote) && normalized.length > quote.length;
};

export const buildSymbolLookupKeys = (value: string, exchange: ExchangeType): string[] => {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) return [];

  const quote = getExchangeQuoteCurrency(exchange);
  const pair = normalizePairForExchange(normalized, exchange);
  const base = getSymbolBase(normalized);
  const keys = new Set<string>([normalized]);

  if (pair) {
    keys.add(pair);
    keys.add(pair.replace('/', ''));
    keys.add(getSymbolBase(pair));
  }
  if (base) {
    keys.add(base);
    keys.add(`${base}/${quote}`);
    keys.add(`${base}${quote}`);
  }

  return Array.from(keys);
};
