import type { AlgoType, Condition, ExchangeType, OperationType } from '../types';
import type { VelesEntriesCountPayload, VelesEntryCondition } from '../types/veles';
import { normalizeCondition } from './ConditionNormalizationService';
import { getIndicatorSettings, toApiIndicatorCode } from '../utils/indicatorMapping';

export type SignalProbeRequestType = 'OPEN' | 'CLOSE';
export type SignalProbeStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SignalProbeViewState {
  status: SignalProbeStatus;
  count?: number;
  error?: string;
}

export interface SignalProbeStoredState {
  status: Exclude<SignalProbeStatus, 'idle'>;
  fingerprint: string;
  count?: number;
  error?: string;
  updatedAt: number;
}

interface FingerprintParams {
  requestType: SignalProbeRequestType;
  algorithm: AlgoType;
  exchange: ExchangeType;
  symbol: string;
  condition: Condition;
}

interface PayloadParams extends FingerprintParams {}

export function normalizeSignalProbeSymbol(value: string): string {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';

  const cleaned = raw.replace(/['"`]/g, '').replace(/\s+/g, '');
  if (!cleaned) return '';

  if (cleaned.includes('/')) {
    const [base, quoteRaw] = cleaned.split('/');
    const quote = quoteRaw || 'USDT';
    if (!base) return '';
    return `${base}/${quote}`;
  }

  if (cleaned.endsWith('USDT') && cleaned.length > 4) {
    return `${cleaned.slice(0, -4)}/USDT`;
  }

  return `${cleaned}/USDT`;
}

function normalizeOperation(value: unknown): OperationType {
  if (value === 'GREATER' || value === 'LESS') return value;
  return 'GREATER';
}

function toEntryCondition(condition: Condition): VelesEntryCondition {
  const normalized = normalizeCondition(condition);
  const indicator = toApiIndicatorCode(
    normalized.indicator || (normalized.type === 'PRICE' ? 'PRICE' : 'RSI')
  );

  if (indicator === 'PRICE') {
    const rawValue = String(normalized.value ?? '').replace(',', '.').trim();
    const parsed = Number(rawValue);
    return {
      type: 'PRICE',
      value: Number.isFinite(parsed) ? parsed : 0,
      operation: normalizeOperation(normalized.operation) || 'GREATER'
    };
  }

  const settings = getIndicatorSettings(indicator);
  const allowValue = settings ? settings.hasValue : true;
  const allowOperation = settings ? settings.hasOperation : true;
  const forceBasic = !allowValue && !allowOperation;
  const basic = forceBasic ? true : Boolean(normalized.basic);
  const rawValue = typeof normalized.value === 'string'
    ? normalized.value.replace(',', '.').trim()
    : normalized.value;
  const parsedValue = rawValue === '' || rawValue === null || rawValue === undefined
    ? null
    : Number(rawValue);
  const operation = normalizeOperation(normalized.operation);

  return {
    type: 'INDICATOR',
    indicator,
    interval: normalized.interval || 'FIVE_MINUTES',
    basic,
    value: basic || !allowValue ? null : (Number.isFinite(parsedValue) ? parsedValue : null),
    operation: basic || !allowOperation ? null : operation,
    closed: normalized.closed !== undefined ? normalized.closed : true,
    reverse: Boolean(normalized.reverse)
  };
}

export function buildSignalProbePayload(params: PayloadParams): VelesEntriesCountPayload {
  const symbol = normalizeSignalProbeSymbol(params.symbol);
  return {
    type: params.requestType,
    algorithm: params.algorithm,
    exchange: params.exchange,
    symbol,
    conditions: [toEntryCondition(params.condition)]
  };
}

export function buildSignalProbeFingerprint(params: FingerprintParams): string {
  const normalized = normalizeCondition(params.condition);
  const symbol = normalizeSignalProbeSymbol(params.symbol);

  return [
    params.requestType,
    params.algorithm,
    params.exchange,
    symbol,
    normalized.type,
    normalized.indicator || '',
    normalized.interval || '',
    String(Boolean(normalized.basic)),
    String(normalized.operation || ''),
    String(normalized.value ?? ''),
    String(normalized.closed !== undefined ? normalized.closed : true),
    String(Boolean(normalized.reverse))
  ].join('|');
}
