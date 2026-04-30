import type { OrderCustomConfig, OrderSignalConfig } from '../types';

export const CUSTOM_VOLUME_STEP = 0.5;
export const CUSTOM_VOLUME_TARGET = 100;
export const CUSTOM_VOLUME_MAX_DISTRIBUTIONS = 10000;

export interface CustomVolumeDistributionResult {
  distributions: number[][];
  tooMany: boolean;
  error?: string;
}

export interface VolumeDistributionOrder {
  volume: number;
  volumeRange?: {
    from: string;
    to: string;
    step: string;
  };
  volumeValues?: string[];
}

type CustomVolumeMode = NonNullable<OrderCustomConfig['volumeMode']>;
type SignalVolumeMode = NonNullable<OrderSignalConfig['volumeMode']>;
export type VolumeDistributionMode = CustomVolumeMode | SignalVolumeMode;

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toUnits(value: number): number {
  return Math.round(value / CUSTOM_VOLUME_STEP);
}

function fromUnits(value: number): number {
  return Number((value * CUSTOM_VOLUME_STEP).toFixed(2));
}

function makeValues(from: number, to: number, step: number): number[] {
  const start = toUnits(Math.min(from, to));
  const end = toUnits(Math.max(from, to));
  const stepUnits = Math.max(1, toUnits(step));
  const values: number[] = [];

  for (let value = start; value <= end; value += stepUnits) {
    values.push(value);
  }

  return values;
}

function makeUniqueSortedValues(values: string[] | undefined): number[] {
  const result = new Set<number>();

  for (const value of values ?? []) {
    const parsed = normalizeNumber(value);
    if (parsed !== null && parsed > 0) {
      result.add(Number(parsed.toFixed(2)));
    }
  }

  return [...result].sort((a, b) => a - b);
}

function isNumberInPlainRange(order: VolumeDistributionOrder, index: number, value: number): true | { error: string } | false {
  const range = getCustomOrderVolumeRange(order);
  const from = normalizeNumber(range.from);
  const to = normalizeNumber(range.to);

  if (from === null || to === null) {
    return { error: `Ордер #${index + 1}: заполните диапазон объема.` };
  }

  if (from <= 0 || to <= 0) {
    return { error: `Ордер #${index + 1}: объем должен быть больше 0.` };
  }

  const min = Math.min(from, to);
  const max = Math.max(from, to);
  return value >= min && value <= max;
}

function makeRangeValues(order: VolumeDistributionOrder, index: number): { values: number[] } | { error: string } {
  const range = getCustomOrderVolumeRange(order);
  const from = normalizeNumber(range.from);
  const to = normalizeNumber(range.to);
  const step = normalizeNumber(range.step);

  if (from === null || to === null || step === null) {
    return { error: `Ордер #${index + 1}: заполните диапазон объема.` };
  }

  if (from <= 0 || to <= 0) {
    return { error: `Ордер #${index + 1}: объем должен быть больше 0.` };
  }

  if (step < CUSTOM_VOLUME_STEP) {
    return { error: `Ордер #${index + 1}: шаг должен быть не меньше ${CUSTOM_VOLUME_STEP}.` };
  }

  return { values: makeValues(from, to, step) };
}

export function getCustomOrderVolumeRange(order: VolumeDistributionOrder): { from: string; to: string; step: string } {
  return order.volumeRange ?? {
    from: String(order.volume || 0),
    to: String(order.volume || 0),
    step: String(CUSTOM_VOLUME_STEP)
  };
}

export function getCustomOrderVolumeValues(order: VolumeDistributionOrder): string[] {
  return order.volumeValues ?? [];
}

export function generateFromValueRanges(valueRanges: number[][], maxDistributions: number): CustomVolumeDistributionResult {
  const target = toUnits(CUSTOM_VOLUME_TARGET);
  const minSuffix = new Array(valueRanges.length + 1).fill(0);
  const maxSuffix = new Array(valueRanges.length + 1).fill(0);

  for (let i = valueRanges.length - 1; i >= 0; i--) {
    minSuffix[i] = minSuffix[i + 1] + Math.min(...valueRanges[i]);
    maxSuffix[i] = maxSuffix[i + 1] + Math.max(...valueRanges[i]);
  }

  const distributions: number[][] = [];
  let tooMany = false;

  const walk = (index: number, sum: number, current: number[]) => {
    if (tooMany) return;

    if (index === valueRanges.length - 1) {
      const rest = target - sum;
      if (valueRanges[index].includes(rest)) {
        distributions.push([...current, fromUnits(rest)]);
        if (distributions.length > maxDistributions) tooMany = true;
      }
      return;
    }

    for (const value of valueRanges[index]) {
      const nextSum = sum + value;
      if (nextSum + minSuffix[index + 1] > target) continue;
      if (nextSum + maxSuffix[index + 1] < target) continue;
      walk(index + 1, nextSum, [...current, fromUnits(value)]);
      if (tooMany) return;
    }
  };

  walk(0, 0, []);

  return {
    distributions: tooMany ? [] : distributions,
    tooMany,
    error: distributions.length === 0 && !tooMany ? 'Нет распределений с суммой 100%.' : undefined
  };
}

function generateRangeDistributions(orders: VolumeDistributionOrder[], maxDistributions: number): CustomVolumeDistributionResult {
  const lastIndex = orders.length - 1;
  const lastOrder = orders[lastIndex];
  if (!lastOrder) {
    return { distributions: [], tooMany: false, error: 'Добавьте последний ордер с диапазоном остатка.' };
  }

  const ranges = orders.slice(0, lastIndex).map(makeRangeValues);
  const invalid = ranges.find((range): range is { error: string } => 'error' in range);
  if (invalid) return { distributions: [], tooMany: false, error: invalid.error };

  const valueRanges = ranges.map((range) => 'values' in range ? range.values : []);
  const target = toUnits(CUSTOM_VOLUME_TARGET);
  const minSuffix = new Array(valueRanges.length + 1).fill(0);
  const maxSuffix = new Array(valueRanges.length + 1).fill(0);
  const distributions: number[][] = [];
  let tooMany = false;
  const lastRange = getCustomOrderVolumeRange(lastOrder);
  const lastFrom = normalizeNumber(lastRange.from);
  const lastTo = normalizeNumber(lastRange.to);

  if (lastFrom === null || lastTo === null) {
    return { distributions: [], tooMany: false, error: `Ордер #${lastIndex + 1}: заполните диапазон объема.` };
  }

  const lastRangeCheck = isNumberInPlainRange(lastOrder, lastIndex, 1);
  if (typeof lastRangeCheck === 'object') {
    return { distributions: [], tooMany: false, error: lastRangeCheck.error };
  }

  minSuffix[valueRanges.length] = toUnits(Math.min(lastFrom, lastTo));
  maxSuffix[valueRanges.length] = toUnits(Math.max(lastFrom, lastTo));

  for (let i = valueRanges.length - 1; i >= 0; i--) {
    minSuffix[i] = minSuffix[i + 1] + Math.min(...valueRanges[i]);
    maxSuffix[i] = maxSuffix[i + 1] + Math.max(...valueRanges[i]);
  }

  const walk = (index: number, sum: number, current: number[]) => {
    if (tooMany) return;

    if (index === valueRanges.length) {
      const restUnits = target - sum;
      const rest = fromUnits(restUnits);
      if (isNumberInPlainRange(lastOrder, lastIndex, rest) === true) {
        distributions.push([...current, rest]);
        if (distributions.length > maxDistributions) tooMany = true;
      }
      return;
    }

    for (const value of valueRanges[index] ?? []) {
      const nextSum = sum + value;
      if (nextSum + minSuffix[index + 1] > target) continue;
      if (nextSum + maxSuffix[index + 1] < target) continue;
      walk(index + 1, nextSum, [...current, fromUnits(value)]);
      if (tooMany) return;
    }
  };

  walk(0, 0, []);

  return {
    distributions: tooMany ? [] : distributions,
    tooMany,
    error: distributions.length === 0 && !tooMany ? 'Нет распределений с суммой 100%.' : undefined
  };
}

function generateListDistributions(orders: VolumeDistributionOrder[], maxDistributions: number): CustomVolumeDistributionResult {
  if (orders.length === 1) {
    const onlyOrderCheck = isNumberInPlainRange(orders[0], 0, CUSTOM_VOLUME_TARGET);
    if (onlyOrderCheck === true) {
      return { distributions: [[CUSTOM_VOLUME_TARGET]], tooMany: false };
    }
    if (typeof onlyOrderCheck === 'object') {
      return { distributions: [], tooMany: false, error: onlyOrderCheck.error };
    }
    return { distributions: [], tooMany: false, error: 'Нет распределений с суммой 100%.' };
  }
  const lastIndex = orders.length - 1;
  const rawValueRanges = orders.slice(0, lastIndex).map((order, index) => {
    const values = makeUniqueSortedValues(order.volumeValues);
    if (values.length === 0) {
      return { error: `Ордер #${index + 1}: добавьте хотя бы одно значение объема.` };
    }
    return { values };
  });
  const invalid = rawValueRanges.find((range): range is { error: string } => 'error' in range);
  if (invalid) return { distributions: [], tooMany: false, error: invalid.error };
  const valueRanges = rawValueRanges.map((range) => 'values' in range ? range.values : []);
  const lastOrder = orders[lastIndex];
  if (!lastOrder) {
    return { distributions: [], tooMany: false, error: 'Добавьте последний ордер с диапазоном остатка.' };
  }

  const target = CUSTOM_VOLUME_TARGET;
  const distributions: number[][] = [];
  let tooMany = false;

  const walk = (index: number, sum: number, current: number[]) => {
    if (tooMany) return;

    if (index === valueRanges.length) {
      const rest = Number((target - sum).toFixed(2));
      const lastCheck = isNumberInPlainRange(lastOrder, lastIndex, rest);
      if (lastCheck === true) {
        distributions.push([...current, rest]);
        if (distributions.length > maxDistributions) tooMany = true;
      } else if (typeof lastCheck === 'object') {
        tooMany = false;
      }
      return;
    }

    for (const value of valueRanges[index] ?? []) {
      const nextSum = sum + value;
      if (nextSum >= target) continue;
      walk(index + 1, Number(nextSum.toFixed(2)), [...current, value]);
      if (tooMany) return;
    }
  };

  const lastRangeCheck = isNumberInPlainRange(lastOrder, lastIndex, 1);
  if (typeof lastRangeCheck === 'object') {
    return { distributions: [], tooMany: false, error: lastRangeCheck.error };
  }

  walk(0, 0, []);

  return {
    distributions: tooMany ? [] : distributions,
    tooMany,
    error: distributions.length === 0 && !tooMany ? 'Нет распределений с суммой 100%.' : undefined
  };
}

export function generateCustomVolumeDistributions(
  orders: VolumeDistributionOrder[],
  mode: VolumeDistributionMode = 'RANGE',
  maxDistributions = CUSTOM_VOLUME_MAX_DISTRIBUTIONS
): CustomVolumeDistributionResult {
  if (orders.length === 0) {
    return { distributions: [], tooMany: false, error: 'Добавьте хотя бы один ордер.' };
  }

  if (mode === 'LIST') {
    return generateListDistributions(orders, maxDistributions);
  }

  return generateRangeDistributions(orders, maxDistributions);
}
