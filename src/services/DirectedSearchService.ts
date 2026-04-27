import type {
  BacktestStats,
} from '../types/veles';
import type {
  DirectedSearchConfig,
  DirectedSearchNumericParam,
  EntryConfig,
  ExitConfig,
  OrderState,
  StaticConfig,
} from '../types';
import type { VelesConfigPayloadV2 } from '../types/velesV2';
import { ConfigGeneratorV2 } from './ConfigGeneratorV2';

export type DirectedSearchParamKey =
  | 'pullUp'
  | 'orders'
  | 'martingale'
  | 'indent'
  | 'overlap'
  | 'logarithmicFactor'
  | 'takeProfitPercent'
  | 'stopLossIndent';

export interface SearchDimension {
  key: DirectedSearchParamKey;
  label: string;
  values: string[];
  integer: boolean;
}

export interface DirectedSearchCandidate {
  genome: number[];
  values: Record<DirectedSearchParamKey, string>;
}

export interface FitnessEvaluation {
  score: number;
  passed: boolean;
  reasons: string[];
  metricValue: number;
}

const DIMENSION_META: Record<DirectedSearchParamKey, { label: string; integer: boolean }> = {
  pullUp: { label: 'Подтяжка сетки', integer: false },
  orders: { label: 'Количество ордеров', integer: true },
  martingale: { label: 'Мартингейл', integer: false },
  indent: { label: 'Отступ', integer: false },
  overlap: { label: 'Перекрытие', integer: false },
  logarithmicFactor: { label: 'Logarithmic factor', integer: false },
  takeProfitPercent: { label: 'Take profit', integer: false },
  stopLossIndent: { label: 'Stop loss', integer: false }
};

function formatNumeric(value: number, integer: boolean): string {
  if (integer) return String(Math.round(value));
  const normalized = Number(value.toFixed(6));
  return String(normalized);
}

function parseNumbersList(source: string): number[] {
  return source
    .split(/[,\n;]+/)
    .map((item) => item.trim().replace(',', '.'))
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function expandNumericParam(param: DirectedSearchNumericParam, integer: boolean): string[] {
  if (param.mode === 'FIXED') {
    const value = Number(String(param.fixedValue).trim().replace(',', '.'));
    return Number.isFinite(value) ? [formatNumeric(value, integer)] : [];
  }

  if (param.mode === 'LIST') {
    return Array.from(new Set(parseNumbersList(param.listValues).map((item) => formatNumeric(item, integer))));
  }

  const from = Number(String(param.rangeFrom).trim().replace(',', '.'));
  const to = Number(String(param.rangeTo).trim().replace(',', '.'));
  const step = Number(String(param.rangeStep).trim().replace(',', '.'));
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0 || to < from) {
    return [];
  }

  const values: string[] = [];
  for (let current = from; current <= to + (step / 10); current += step) {
    values.push(formatNumeric(current, integer));
    if (values.length > 2000) break;
  }

  return Array.from(new Set(values));
}

function getFirstOrFallback(values: string[], fallback: string): string {
  const first = values.find((item) => String(item).trim() !== '');
  return first ?? fallback;
}

export function buildDefaultDirectedSearchConfig(
  orderState: OrderState,
  exitConfig: ExitConfig
): DirectedSearchConfig {
  const makeFixed = (value: string): DirectedSearchNumericParam => ({
    mode: 'FIXED',
    fixedValue: value,
    listValues: value,
    rangeFrom: value,
    rangeTo: value,
    rangeStep: '1'
  });

  return {
    algorithm: 'GENETIC',
    goal: 'NET',
    ga: {
      populationSize: '12',
      generations: '6',
      mutationRate: '0.2',
      eliteCount: '2'
    },
    constraints: {
      maxAvgDealDurationMinutes: '',
      minDeals: '',
      minNetMaeRatio: ''
    },
    params: {
      pullUp: makeFixed(orderState.general.pullUp || '0.2'),
      orders: makeFixed(getFirstOrFallback(orderState.simple.orders, '10')),
      martingale: makeFixed(getFirstOrFallback(orderState.simple.martingale, '5')),
      indent: makeFixed(getFirstOrFallback(orderState.simple.indent, '0.2')),
      overlap: makeFixed(getFirstOrFallback(orderState.simple.overlap, '15')),
      logarithmicFactor: makeFixed(getFirstOrFallback(orderState.simple.logarithmicFactor, '1.1')),
      takeProfitPercent: makeFixed(getFirstOrFallback(exitConfig.profitSingle.percents, '1')),
      stopLossIndent: makeFixed(getFirstOrFallback(exitConfig.stopLoss.indent, '-1'))
    }
  };
}

export function validateDirectedSearchBase(
  entryConfig: EntryConfig,
  orderState: OrderState,
  exitConfig: ExitConfig
): string | null {
  if (orderState.mode !== 'SIMPLE') {
    return 'MVP направленного поиска поддерживает только SIMPLE-режим сетки.';
  }

  if (exitConfig.profitMode !== 'SINGLE') {
    return 'MVP направленного поиска поддерживает только простой тейк-профит.';
  }

  if (exitConfig.stopLoss.enabledSignal) {
    return 'MVP направленного поиска поддерживает только обычный stop-loss.';
  }

  const invalidEntrySlot = entryConfig.filterSlots.find((slot) => slot.variants.length !== 1);
  if (invalidEntrySlot) {
    return 'Для MVP направленного поиска в каждом слоте входных индикаторов должен быть ровно один вариант.';
  }

  return null;
}

export function buildDirectedSearchDimensions(
  config: DirectedSearchConfig,
  orderState: OrderState,
  exitConfig: ExitConfig
): { dimensions: SearchDimension[]; error: string | null } {
  const dimensions: SearchDimension[] = [];

  const pushDimension = (key: DirectedSearchParamKey) => {
    if (key === 'logarithmicFactor' && !orderState.simple.logarithmicEnabled) return;
    if (key === 'stopLossIndent' && !exitConfig.stopLoss.enabledSimple) return;

    const meta = DIMENSION_META[key];
    const values = expandNumericParam(config.params[key], meta.integer);
    if (values.length === 0) {
      throw new Error(`Параметр "${meta.label}" заполнен некорректно.`);
    }

    dimensions.push({
      key,
      label: meta.label,
      values,
      integer: meta.integer
    });
  };

  try {
    pushDimension('pullUp');
    pushDimension('orders');
    pushDimension('martingale');
    pushDimension('indent');
    pushDimension('overlap');
    pushDimension('logarithmicFactor');
    pushDimension('takeProfitPercent');
    pushDimension('stopLossIndent');
  } catch (error) {
    return {
      dimensions: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  if (dimensions.length === 0) {
    return {
      dimensions: [],
      error: 'Не найдено ни одного параметра для оптимизации.'
    };
  }

  return { dimensions, error: null };
}

export function decodeCandidate(
  genome: number[],
  dimensions: SearchDimension[]
): DirectedSearchCandidate {
  const values = {
    pullUp: '0.2',
    orders: '10',
    martingale: '5',
    indent: '0.2',
    overlap: '15',
    logarithmicFactor: '1.1',
    takeProfitPercent: '1',
    stopLossIndent: '-1'
  } as Record<DirectedSearchParamKey, string>;

  dimensions.forEach((dimension, index) => {
    const value = dimension.values[genome[index]] ?? dimension.values[0];
    values[dimension.key] = value;
  });

  return { genome, values };
}

export function buildCandidatePayload(
  staticConfig: StaticConfig,
  entryConfig: EntryConfig,
  orderState: OrderState,
  exitConfig: ExitConfig,
  values: Record<DirectedSearchParamKey, string>,
  name: string
): VelesConfigPayloadV2 {
  const orderClone: OrderState = {
    ...orderState,
    mode: 'SIMPLE',
    general: {
      ...orderState.general,
      pullUp: values.pullUp
    },
    simple: {
      ...orderState.simple,
      orders: [values.orders],
      martingale: [values.martingale],
      indent: [values.indent],
      overlap: [values.overlap],
      logarithmicFactor: [values.logarithmicFactor]
    }
  };

  const exitClone: ExitConfig = {
    ...exitConfig,
    profitMode: 'SINGLE',
    profitSingle: {
      ...exitConfig.profitSingle,
      percents: [values.takeProfitPercent]
    },
    stopLoss: {
      ...exitConfig.stopLoss,
      enabledSignal: false,
      conditionalIndent: [],
      filterSlots: [],
      indent: exitConfig.stopLoss.enabledSimple ? [values.stopLossIndent] : []
    }
  };

  const generated = ConfigGeneratorV2.generate(
    { ...staticConfig, namePrefix: name },
    entryConfig,
    orderClone,
    exitClone,
    '#GA'
  );

  const config = generated.configs[0];
  if (!config) {
    throw new Error('Не удалось собрать payload кандидата.');
  }

  return {
    ...config,
    name
  };
}

export function evaluateDirectedSearchFitness(
  stats: BacktestStats,
  config: DirectedSearchConfig
): FitnessEvaluation {
  const reasons: string[] = [];
  const avgDurationMinutes = Number(stats.avgDuration || 0) / 60;
  const maeAbsolute = Math.abs(Number(stats.maeAbsolute || 0));
  const netMaeRatio = maeAbsolute > 0 ? Number(stats.netQuote || 0) / maeAbsolute : Number(stats.netQuote || 0) > 0 ? 999999 : -999999;

  const maxAvgDurationHours = Number(String(config.constraints.maxAvgDealDurationMinutes).replace(',', '.'));
  if (
    String(config.constraints.maxAvgDealDurationMinutes).trim() &&
    Number.isFinite(maxAvgDurationHours) &&
    avgDurationMinutes > (maxAvgDurationHours * 60)
  ) {
    reasons.push('avg_duration');
  }

  const minDeals = Number(String(config.constraints.minDeals).replace(',', '.'));
  if (String(config.constraints.minDeals).trim() && Number.isFinite(minDeals) && Number(stats.totalDeals || 0) < minDeals) {
    reasons.push('min_deals');
  }

  const minNetMaeRatio = Number(String(config.constraints.minNetMaeRatio).replace(',', '.'));
  if (String(config.constraints.minNetMaeRatio).trim() && Number.isFinite(minNetMaeRatio) && netMaeRatio < minNetMaeRatio) {
    reasons.push('net_mae_ratio');
  }

  let metricValue = Number(stats.netQuote || 0);
  if (config.goal === 'NET_MAE_ABS') {
    metricValue = netMaeRatio;
  } else if (config.goal === 'NET_PER_DAY') {
    metricValue = Number(stats.netQuotePerDay || 0);
  }

  return {
    score: reasons.length === 0 ? metricValue : -1_000_000_000 + metricValue,
    passed: reasons.length === 0,
    reasons,
    metricValue
  };
}
