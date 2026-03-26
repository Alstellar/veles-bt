import type { QueueItem } from '../hooks/useBacktestQueue';
import type {
  BacktestsResumeSource,
  BacktestsResumeTemplate,
  ExchangeType,
  SymbolLimitation
} from '../types';
import { isSpot } from '../types';
import type { VelesConfigPayload, VelesCondition } from '../types/veles';
import { parseImportLink } from './ImportSettingsService';

export const DEFAULT_BACKTESTS_NAME_TEMPLATE = '{template} {symbol} | {n}/{total} | VH {batch}';

export interface ParsedTemplateLink {
  code: string;
  url: string;
  raw: string;
}

export interface ParsedTemplateLinksResult {
  links: ParsedTemplateLink[];
  invalidLines: string[];
}

export interface ParsedSymbolsResult {
  inputSymbols: string[];
  resolvedSymbols: string[];
  missingSymbols: string[];
}

export interface MatrixPairError {
  templateUrl: string;
  symbol: string;
  reason: 'leverage_mismatch';
  requestedLeverage: number;
  maxLeverage: number;
}

type RawBotPayload = Record<string, unknown>;

type NameContext = {
  template: string;
  symbol: string;
  pair: string;
  n: number;
  total: number;
  batch: string;
};

const DEFAULT_FROM_ISO = '2019-01-01T00:00:00.000Z';
const DEFAULT_MAKER_FEE = '0.02';
const DEFAULT_TAKER_FEE = '0.055';
const DEFAULT_DEPOSIT_AMOUNT = 50;
const DEFAULT_DEPOSIT_LEVERAGE = 10;

const clonePayload = (payload: VelesConfigPayload): VelesConfigPayload => {
  if (typeof structuredClone === 'function') {
    return structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload)) as VelesConfigPayload;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizePair = (value: string): string | null => {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const cleaned = raw.replace(/['"`]/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  if (cleaned.includes('/')) {
    const [base, quoteRaw] = cleaned.split('/');
    const quote = quoteRaw || 'USDT';
    if (!base) return null;
    return `${base}/${quote}`;
  }

  if (cleaned.endsWith('USDT') && cleaned.length > 4) {
    return `${cleaned.slice(0, -4)}/USDT`;
  }

  return `${cleaned}/USDT`;
};

const normalizeTemplateName = (value: string): string => {
  return value
    .replace(/\s*\|\s*\d+\s*\/\s*\d+\s*\|\s*(VELES HELPER|VH)\s*#?[A-Z0-9]+\s*$/i, '')
    .trim();
};

const asNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
};

const toMarginType = (value: unknown): 'CROSS' | 'ISOLATED' => {
  return value === 'ISOLATED' ? 'ISOLATED' : 'CROSS';
};

const toAlgorithm = (value: unknown): 'LONG' | 'SHORT' => {
  return value === 'SHORT' ? 'SHORT' : 'LONG';
};

const toConditions = (value: unknown): VelesCondition[] => {
  return Array.isArray(value) ? (value as VelesCondition[]) : [];
};

const ensureProfit = (value: unknown): VelesConfigPayload['profit'] => {
  if (!isRecord(value)) {
    return {
      type: 'SINGLE',
      currency: 'QUOTE',
      percent: 1,
      trailing: null
    };
  }

  const typeRaw = value.type;
  const type = typeRaw === 'MULTIPLE' || typeRaw === 'SIGNAL' ? typeRaw : 'SINGLE';

  if (type === 'SINGLE') {
    return {
      type: 'SINGLE',
      currency: 'QUOTE',
      percent: asNumber(value.percent, 1),
      trailing: null
    };
  }

  if (type === 'MULTIPLE') {
    return {
      type: 'MULTIPLE',
      currency: 'QUOTE',
      orders: Array.isArray(value.orders)
        ? (value.orders as Array<{ indent: number; volume: number }>)
        : [],
      breakeven: value.breakeven === 'AVERAGE' || value.breakeven === 'PROFIT' ? value.breakeven : null
    };
  }

  return {
    type: 'SIGNAL',
    currency: 'QUOTE',
    checkPnl: value.checkPnl === null ? null : asNumber(value.checkPnl, 0),
    conditions: toConditions(value.conditions)
  };
};

const ensureSettings = (value: unknown): VelesConfigPayload['settings'] => {
  const fallback: VelesConfigPayload['settings'] = {
    type: 'SIMPLE',
    includePosition: true,
    orders: 10,
    indent: 0.2,
    overlap: 15,
    martingale: 5,
    priceStrategy: 'LINEAR',
    logarithmicFactor: null
  };

  if (!isRecord(value)) return fallback;

  const typeRaw = value.type;
  const type = typeRaw === 'SIGNAL' || typeRaw === 'CUSTOM' ? typeRaw : 'SIMPLE';
  const next: VelesConfigPayload['settings'] = {
    ...fallback,
    ...(value as Partial<VelesConfigPayload['settings']>),
    type,
    includePosition: typeof value.includePosition === 'boolean' ? value.includePosition : true
  };
  return next;
};

const ensureStopLoss = (value: unknown): VelesConfigPayload['stopLoss'] | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    indent: value.indent === null ? null : asNumber(value.indent, 0),
    termination: typeof value.termination === 'boolean' ? value.termination : false,
    conditionalIndent: value.conditionalIndent === null ? null : asNumber(value.conditionalIndent, 0),
    conditionalIndentType:
      value.conditionalIndentType === 'LAST_GRID' || value.conditionalIndentType === 'AVERAGE'
        ? value.conditionalIndentType
        : null,
    conditions: Array.isArray(value.conditions) ? (value.conditions as VelesCondition[]) : null
  };
};

const renderNameTemplate = (template: string, ctx: NameContext): string => {
  const normalized = template.trim() || DEFAULT_BACKTESTS_NAME_TEMPLATE;
  return normalized
    .replace(/\{template\}/gi, ctx.template)
    .replace(/\{symbol\}/gi, ctx.symbol)
    .replace(/\{pair\}/gi, ctx.pair)
    .replace(/\{n\}/gi, String(ctx.n))
    .replace(/\{total\}/gi, String(ctx.total))
    .replace(/\{batch\}/gi, ctx.batch);
};

const getBaseSymbol = (pair: string): string => {
  return pair.includes('/') ? pair.split('/')[0] : pair;
};

const isUsdtPair = (pair: string): boolean => {
  const normalized = pair.trim().toUpperCase();
  if (!normalized) return false;
  if (!normalized.includes('/')) return normalized.endsWith('USDT') && normalized.length > 4;
  const [base, quote] = normalized.split('/');
  return Boolean(base) && quote === 'USDT';
};

const mapLimitationsByKey = (limitations: SymbolLimitation[]): Map<string, string> => {
  const map = new Map<string, string>();
  limitations.forEach((item) => {
    const pair = item.symbol.toUpperCase();
    const noSlash = pair.replace('/', '');
    const base = getBaseSymbol(pair);
    map.set(pair, pair);
    map.set(noSlash, pair);
    map.set(base, pair);
    if (item.externalId) {
      map.set(item.externalId.toUpperCase(), pair);
    }
  });
  return map;
};

const mapSymbolMaxLeverage = (limitations: SymbolLimitation[]): Record<string, number | null> => {
  const out: Record<string, number | null> = {};
  limitations.forEach((item) => {
    const pair = item.symbol.toUpperCase();
    const leverage = Number(item.leverage);
    out[pair] = Number.isFinite(leverage) ? leverage : null;
  });
  return out;
};

export const parseTemplateLinksInput = (input: string): ParsedTemplateLinksResult => {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const links: ParsedTemplateLink[] = [];
  const invalidLines: string[] = [];
  const seenCodes = new Set<string>();

  lines.forEach((line) => {
    const parsed = parseImportLink(line);
    if (!parsed) {
      invalidLines.push(line);
      return;
    }
    const code = parsed.code;
    if (seenCodes.has(code)) return;
    seenCodes.add(code);
    links.push({
      code,
      url: parsed.url,
      raw: line
    });
  });

  return { links, invalidLines };
};

export const parseSymbolsInput = (
  input: string,
  limitations: SymbolLimitation[]
): ParsedSymbolsResult => {
  const parts = input
    .split(/[\s,;]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const resolved: string[] = [];
  const missing: string[] = [];
  const index = mapLimitationsByKey(limitations);
  const seenResolved = new Set<string>();

  parts.forEach((token) => {
    const pairCandidate = normalizePair(token);
    if (!pairCandidate) {
      missing.push(token);
      return;
    }

    const lookupKeys = [
      pairCandidate,
      pairCandidate.replace('/', ''),
      getBaseSymbol(pairCandidate),
      token.trim().toUpperCase().replace(/\s+/g, '')
    ];

    let resolvedPair: string | undefined;
    for (const key of lookupKeys) {
      const found = index.get(key);
      if (found) {
        resolvedPair = found;
        break;
      }
    }

    if (!resolvedPair) {
      missing.push(token);
      return;
    }

    if (!seenResolved.has(resolvedPair)) {
      seenResolved.add(resolvedPair);
      resolved.push(resolvedPair);
    }
  });

  return {
    inputSymbols: parts,
    resolvedSymbols: resolved,
    missingSymbols: missing
  };
};

export const extractTemplateFromPayload = (
  code: string,
  url: string,
  payload: unknown
): BacktestsResumeTemplate => {
  const raw = isRecord(payload) ? (payload as RawBotPayload) : {};

  const symbolsRaw = Array.isArray(raw.symbols) ? raw.symbols : [];
  const firstSymbol = typeof symbolsRaw[0] === 'string' ? symbolsRaw[0] : undefined;
  const symbolRaw = asString(firstSymbol ?? raw.symbol, 'BTC/USDT');
  const pair = normalizePair(symbolRaw) ?? 'BTC/USDT';

  const depositRaw = isRecord(raw.deposit) ? raw.deposit : {};
  const settingsRaw = isRecord(raw.settings) ? raw.settings : {};

  const config: VelesConfigPayload = {
    name: asString(raw.name, `Template ${code}`),
    exchange: asString(raw.exchange, 'BINANCE_FUTURES'),
    algorithm: toAlgorithm(raw.algorithm),
    symbol: pair,
    symbols: [pair],
    pullUp: asNumber(raw.pullUp, 0.2),
    portion: asNumber(raw.portion, 7),
    commissions: {
      maker: String(asNumber(isRecord(raw.commissions) ? raw.commissions.maker : undefined, 0.02)),
      taker: String(asNumber(isRecord(raw.commissions) ? raw.commissions.taker : undefined, 0.055))
    },
    deposit: {
      amount: asNumber(depositRaw.amount, 50),
      leverage: asNumber(depositRaw.leverage, 10),
      marginType: toMarginType(depositRaw.marginType)
    },
    conditions: toConditions(raw.conditions),
    settings: ensureSettings(settingsRaw),
    profit: ensureProfit(raw.profit),
    stopLoss: ensureStopLoss(raw.stopLoss),
    public: typeof raw.public === 'boolean' ? raw.public : true,
    from: DEFAULT_FROM_ISO,
    to: new Date().toISOString(),
    useWicks: typeof raw.useWicks === 'boolean' ? raw.useWicks : true
  };

  return {
    code,
    url,
    name: normalizeTemplateName(config.name) || `Template ${code}`,
    config
  };
};

export const getExchangeFilteredSymbols = (
  limitations: SymbolLimitation[],
  filters: {
    leverageMin?: number | null;
    leverageMax?: number | null;
    availableFromMin?: string | null;
    availableFromMax?: string | null;
  },
  availabilityMap: Record<string, string | null>
): string[] => {
  const result: string[] = [];
  limitations.forEach((item) => {
    const pair = item.symbol.toUpperCase();
    if (!isUsdtPair(pair)) return;
    const leverage = Number(item.leverage ?? 1);
    const availableFrom = availabilityMap[pair] ?? null;

    if (filters.leverageMin !== null && filters.leverageMin !== undefined && leverage < filters.leverageMin) return;
    if (filters.leverageMax !== null && filters.leverageMax !== undefined && leverage > filters.leverageMax) return;
    if (filters.availableFromMin && (!availableFrom || availableFrom < filters.availableFromMin)) return;
    if (filters.availableFromMax && (!availableFrom || availableFrom > filters.availableFromMax)) return;
    result.push(pair);
  });
  return result;
};

export const buildQueueItemsFromBacktestsSource = (
  batchId: string,
  source: BacktestsResumeSource
): {
  items: QueueItem[];
  skipped: MatrixPairError[];
} => {
  const isSpotExchange = isSpot(source.exchange);
  const sourceDeposit = Number(source.deposit);
  const hasSourceDeposit = Number.isFinite(sourceDeposit) && sourceDeposit > 0;
  const sourceLeverage = Number(source.leverage);
  const hasSourceLeverage = Number.isFinite(sourceLeverage) && sourceLeverage >= 1;

  const validPairs: Array<{
    template: BacktestsResumeTemplate;
    symbol: string;
  }> = [];
  const skipped: MatrixPairError[] = [];

  source.templates.forEach((template) => {
    const templateLeverage = Number(template.config.deposit?.leverage ?? 0);
    const requestedLeverage = hasSourceLeverage ? sourceLeverage : templateLeverage;
    source.symbols.forEach((symbol) => {
      const maxLeverage = source.symbolMaxLeverage[symbol];
      if (
        !isSpotExchange &&
        Number.isFinite(requestedLeverage) &&
        Number.isFinite(maxLeverage ?? NaN) &&
        requestedLeverage > (maxLeverage as number)
      ) {
        skipped.push({
          templateUrl: template.url,
          symbol,
          reason: 'leverage_mismatch',
          requestedLeverage,
          maxLeverage: maxLeverage as number
        });
        return;
      }
      validPairs.push({ template, symbol });
    });
  });

  const total = validPairs.length;
  const items: QueueItem[] = validPairs.map((pair, index) => {
    const config = clonePayload(pair.template.config);
    const symbolPair = pair.symbol.toUpperCase();
    const symbolBase = getBaseSymbol(symbolPair);

    config.exchange = source.exchange as ExchangeType;
    config.symbol = symbolPair;
    config.symbols = [symbolPair];
    config.from = new Date(source.dateFrom).toISOString();
    config.to = new Date(source.dateTo).toISOString();
    const templateDepositAmount = Number(config.deposit?.amount);
    const templateLeverage = Number(config.deposit?.leverage);
    const resolvedDepositAmount = hasSourceDeposit
      ? sourceDeposit
      : (Number.isFinite(templateDepositAmount) && templateDepositAmount > 0
        ? templateDepositAmount
        : DEFAULT_DEPOSIT_AMOUNT);
    const resolvedLeverage = !isSpotExchange && hasSourceLeverage
      ? sourceLeverage
      : (Number.isFinite(templateLeverage) && templateLeverage >= 1
        ? templateLeverage
        : DEFAULT_DEPOSIT_LEVERAGE);
    config.deposit = {
      amount: resolvedDepositAmount,
      leverage: resolvedLeverage,
      marginType: config.deposit?.marginType === 'ISOLATED' ? 'ISOLATED' : 'CROSS'
    };
    config.commissions = {
      maker: source.makerFee && source.makerFee.trim()
        ? source.makerFee
        : (config.commissions?.maker ?? DEFAULT_MAKER_FEE),
      taker: source.takerFee && source.takerFee.trim()
        ? source.takerFee
        : (config.commissions?.taker ?? DEFAULT_TAKER_FEE)
    };
    config.public = typeof source.isPublic === 'boolean' ? source.isPublic : config.public;
    config.useWicks = typeof source.useWicks === 'boolean' ? source.useWicks : config.useWicks;
    config.name = renderNameTemplate(source.nameTemplate, {
      template: pair.template.name,
      symbol: symbolBase,
      pair: symbolPair,
      n: index + 1,
      total,
      batch: batchId
    });

    return {
      id: crypto.randomUUID(),
      config,
      status: 'PENDING',
      sourceTemplateUrl: pair.template.url
    };
  });

  return { items, skipped };
};

export const buildSymbolMaxLeverageMap = (limitations: SymbolLimitation[]): Record<string, number | null> => {
  return mapSymbolMaxLeverage(limitations);
};

export const toIsoDateString = (date: Date): string => {
  return new Date(date).toISOString();
};
