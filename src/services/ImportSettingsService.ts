import dayjs from 'dayjs';

import { parseVelesShareLink } from '../config/velesDomains';
import { normalizeCondition } from './ConditionNormalizationService';
import { isSupportedIndicator, toApiIndicatorCode } from '../utils/indicatorMapping';
import type {
  StaticConfig,
  EntryConfig,
  OrderState,
  ExitConfig,
  FilterSlot,
  Condition
} from '../types';

export interface ParsedImportLink {
  code: string;
  origin: string;
  url: string;
}

export interface ImportedConfigs {
  staticConfig: StaticConfig;
  entryConfig: EntryConfig;
  orderState: OrderState;
  exitConfig: ExitConfig;
  warnings: string[];
}

type RawCondition = {
  type?: 'PRICE' | 'INDICATOR';
  indicator?: string;
  interval?: string;
  basic?: boolean;
  value?: number | string | null;
  operation?: 'GREATER' | 'LESS' | null;
  closed?: boolean;
  reverse?: boolean;
};

type RawPayload = {
  name?: string;
  exchange?: string;
  algorithm?: 'LONG' | 'SHORT';
  pullUp?: number;
  portion?: number;
  symbols?: string[];
  symbol?: string;
  from?: string;
  to?: string;
  commissions?: {
    maker?: number;
    taker?: number;
  };
  public?: boolean;
  useWicks?: boolean;
  deposit?: {
    amount?: number;
    leverage?: number;
    marginType?: 'CROSS' | 'ISOLATED';
  };
  conditions?: RawCondition[];
  settings?: {
    type?: 'SIMPLE' | 'CUSTOM' | 'SIGNAL';
    orders?: number | Array<{
      indent?: number;
      volume?: number;
      conditions?: RawCondition[];
    }>;
    baseOrder?: {
      indent?: number;
      volume?: number;
    };
    indentType?: 'ORDER' | 'ENTRY';
    indent?: number;
    overlap?: number;
    martingale?: number;
    logarithmicFactor?: number | null;
    priceStrategy?: 'LINEAR' | 'LOGARITHMIC' | string;
  };
  profit?: {
    type?: 'SINGLE' | 'MULTIPLE' | 'SIGNAL';
    percent?: number;
    orders?: Array<{
      indent?: number;
      volume?: number;
    }>;
    breakeven?: 'AVERAGE' | 'PROFIT' | null;
    checkPnl?: number | null;
    conditions?: RawCondition[];
  };
  stopLoss?: {
    indent?: number | null;
    conditionalIndent?: number | null;
    conditionalIndentType?: 'AVERAGE' | 'LAST_GRID' | null;
    conditions?: RawCondition[] | null;
  };
};

const randomId = () => Math.random().toString(36).slice(2, 11);

const asString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const toNumString = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
};

const cleanNamePrefix = (name: string): string => {
  return name
    .replace(/\s*\|\s*\d+\s*\/\s*\d+\s*\|\s*(VELES HELPER|VH).*$/i, '')
    .trim();
};

const mapCondition = (raw: RawCondition, warnings: string[], scope: string): Condition | null => {
  const indicator = raw.indicator ?? (raw.type === 'PRICE' ? 'PRICE' : undefined);
  if (!isSupportedIndicator(indicator)) {
    warnings.push(`${scope}: индикатор "${indicator ?? 'UNKNOWN'}" не поддерживается и был пропущен.`);
    return null;
  }

  return normalizeCondition({
    id: randomId(),
    type: raw.type ?? 'INDICATOR',
    indicator: toApiIndicatorCode(indicator),
    interval: (raw.interval as Condition['interval']) ?? 'FIVE_MINUTES',
    basic: raw.basic ?? true,
    value: raw.value === null || raw.value === undefined ? '' : asString(raw.value),
    operation: raw.operation ?? 'GREATER',
    closed: raw.closed ?? true,
    reverse: raw.reverse ?? false
  });
};

const mapConditionsToSlots = (rawConditions: RawCondition[] | undefined, warnings: string[], scope: string): FilterSlot[] => {
  if (!Array.isArray(rawConditions) || rawConditions.length === 0) return [];
  return rawConditions
    .map((raw, index) => {
      const condition = mapCondition(raw, warnings, `${scope}[${index + 1}]`);
      if (!condition) return null;
      return {
        id: randomId(),
        variants: [condition]
      };
    })
    .filter((slot): slot is FilterSlot => slot !== null);
};

export function parseImportLink(link: string): ParsedImportLink | null {
  const normalized = link.trim();
  if (!normalized) return null;

  const parsed = parseVelesShareLink(normalized);
  if (parsed) {
    return {
      code: parsed.code,
      origin: parsed.origin,
      url: parsed.url
    };
  }

  return null;
}

export function mapImportedPayload(
  payload: RawPayload,
  current: {
    staticConfig: StaticConfig;
    entryConfig: EntryConfig;
    orderState: OrderState;
    exitConfig: ExitConfig;
  }
): ImportedConfigs {
  const warnings: string[] = [];

  const now = new Date();
  const defaultFrom = dayjs(now).subtract(1, 'year').toDate();

  const parsedFrom = payload.from ? new Date(payload.from) : null;
  const parsedTo = payload.to ? new Date(payload.to) : null;
  const dateFrom = parsedFrom && Number.isFinite(parsedFrom.getTime()) ? parsedFrom : defaultFrom;
  const dateTo = parsedTo && Number.isFinite(parsedTo.getTime()) ? parsedTo : now;

  if (!payload.from || !payload.to) {
    warnings.push('Даты в источнике не найдены, установлен период за последний год.');
  }

  const rawName = payload.name || current.staticConfig.namePrefix;
  const cleanedName = cleanNamePrefix(rawName);

  const staticConfig: StaticConfig = {
    ...current.staticConfig,
    namePrefix: cleanedName || current.staticConfig.namePrefix,
    exchange: (payload.exchange as StaticConfig['exchange']) || current.staticConfig.exchange,
    algo: payload.algorithm || current.staticConfig.algo,
    symbol: (payload.symbols?.[0] ?? payload.symbol ?? current.staticConfig.symbol).replace('/USDT', ''),
    deposit: payload.deposit?.amount ?? current.staticConfig.deposit,
    leverage: payload.deposit?.leverage ?? current.staticConfig.leverage,
    marginType: payload.deposit?.marginType ?? current.staticConfig.marginType,
    portion: payload.portion ?? current.staticConfig.portion,
    dateFrom,
    dateTo,
    makerFee: payload.commissions?.maker !== undefined ? String(payload.commissions.maker) : current.staticConfig.makerFee,
    takerFee: payload.commissions?.taker !== undefined ? String(payload.commissions.taker) : current.staticConfig.takerFee,
    isPublic: payload.public ?? current.staticConfig.isPublic,
    useWicks: payload.useWicks ?? current.staticConfig.useWicks
  };

  const entryConfig: EntryConfig = {
    filterSlots: mapConditionsToSlots(payload.conditions, warnings, 'Entry')
  };

  const settingsType = payload.settings?.type ?? current.orderState.mode;
  const settingsOrdersArray = Array.isArray(payload.settings?.orders) ? payload.settings?.orders : [];
  const orderState: OrderState = {
    ...current.orderState,
    mode: settingsType,
    general: {
      ...current.orderState.general,
      pullUp: payload.pullUp !== undefined ? String(payload.pullUp) : current.orderState.general.pullUp
    }
  };

  if (settingsType === 'SIMPLE') {
    const simpleOrders = payload.settings?.orders;
    const simpleOrdersCount = typeof simpleOrders === 'number'
      ? simpleOrders
      : Array.isArray(simpleOrders)
        ? simpleOrders.length
        : null;
    const hasLogFactor = payload.settings?.logarithmicFactor !== undefined && payload.settings.logarithmicFactor !== null;
    const isLogarithmicByStrategy = payload.settings?.priceStrategy === 'LOGARITHMIC';
    const logarithmicEnabled = Boolean(hasLogFactor || isLogarithmicByStrategy);

    orderState.simple = {
      ...current.orderState.simple,
      orders: simpleOrdersCount !== null ? [String(simpleOrdersCount)] : current.orderState.simple.orders,
      martingale: payload.settings?.martingale !== undefined ? [toNumString(payload.settings.martingale)] : current.orderState.simple.martingale,
      indent: payload.settings?.indent !== undefined ? [toNumString(payload.settings.indent)] : current.orderState.simple.indent,
      overlap: payload.settings?.overlap !== undefined ? [toNumString(payload.settings.overlap)] : current.orderState.simple.overlap,
      logarithmicEnabled,
      logarithmicFactor: hasLogFactor
        ? [String(payload.settings?.logarithmicFactor)]
        : current.orderState.simple.logarithmicFactor
    };
  } else if (settingsType === 'CUSTOM') {
    orderState.custom = {
      ...current.orderState.custom,
      baseOrder: {
        indent: payload.settings?.baseOrder?.indent !== undefined ? [toNumString(payload.settings.baseOrder.indent)] : current.orderState.custom.baseOrder.indent,
        volume: payload.settings?.baseOrder?.volume ?? current.orderState.custom.baseOrder.volume
      },
      orders: settingsOrdersArray.map((order) => ({
        id: randomId(),
        indent: order.indent !== undefined ? [toNumString(order.indent)] : ['0'],
        volume: order.volume ?? 0
      }))
    };
  } else {
    orderState.signal = {
      ...current.orderState.signal,
      indentType: payload.settings?.indentType ?? current.orderState.signal.indentType,
      baseOrder: {
        indent: payload.settings?.baseOrder?.indent !== undefined ? [toNumString(payload.settings.baseOrder.indent)] : current.orderState.signal.baseOrder.indent,
        volume: payload.settings?.baseOrder?.volume ?? current.orderState.signal.baseOrder.volume
      },
      orders: settingsOrdersArray.map((order, index) => ({
        id: randomId(),
        indent: order.indent !== undefined ? [toNumString(order.indent)] : ['0'],
        volume: order.volume ?? 0,
        filterSlots: mapConditionsToSlots(order.conditions, warnings, `Signal order ${index + 1}`)
      }))
    };
  }

  const profitType = payload.profit?.type ?? current.exitConfig.profitMode;
  const exitConfig: ExitConfig = {
    ...current.exitConfig,
    profitMode: profitType
  };

  if (profitType === 'SINGLE') {
    exitConfig.profitSingle = {
      ...current.exitConfig.profitSingle,
      percents: payload.profit?.percent !== undefined ? [String(payload.profit.percent)] : current.exitConfig.profitSingle.percents
    };
  } else if (profitType === 'MULTIPLE') {
    exitConfig.profitMultiple = {
      ...current.exitConfig.profitMultiple,
      breakeven: payload.profit?.breakeven ?? current.exitConfig.profitMultiple.breakeven,
      orders: (payload.profit?.orders ?? []).map((order) => ({
        id: randomId(),
        indent: order.indent !== undefined ? [toNumString(order.indent)] : ['0'],
        volume: order.volume ?? 0
      }))
    };
  } else {
    exitConfig.profitSignal = {
      ...current.exitConfig.profitSignal,
      checkPnl: payload.profit?.checkPnl === null || payload.profit?.checkPnl === undefined
        ? ['null']
        : [String(payload.profit.checkPnl)],
      filterSlots: mapConditionsToSlots(payload.profit?.conditions, warnings, 'Take profit signal')
    };
  }

  const stopLoss = payload.stopLoss;
  if (stopLoss) {
    const hasSimple = stopLoss.indent !== undefined && stopLoss.indent !== null;
    const hasSignalConditions = Array.isArray(stopLoss.conditions) && stopLoss.conditions.length > 0;
    const hasConditional = stopLoss.conditionalIndent !== undefined && stopLoss.conditionalIndent !== null;
    const hasSignal = hasSignalConditions || hasConditional;

    exitConfig.stopLoss = {
      ...current.exitConfig.stopLoss,
      enabledSimple: hasSimple,
      indent: hasSimple ? [String(Math.abs(Number(stopLoss.indent)))] : [],
      enabledSignal: hasSignal,
      conditionalIndent: hasConditional
        ? [String(-1 * Number(stopLoss.conditionalIndent))]
        : hasSignal
          ? ['null']
          : [],
      conditionalIndentType: stopLoss.conditionalIndentType ?? current.exitConfig.stopLoss.conditionalIndentType,
      filterSlots: hasSignalConditions ? mapConditionsToSlots(stopLoss.conditions ?? [], warnings, 'Stop loss signal') : []
    };
  }

  return {
    staticConfig,
    entryConfig,
    orderState,
    exitConfig,
    warnings
  };
}
