import type { SweepNumericParam } from '../types';

interface ExpandSweepOptions {
  integer?: boolean;
  maxValues?: number;
  allowedValues?: readonly string[];
  allowNull?: boolean;
}

function normalizeNumericText(value: string): string {
  return value.trim().replace(',', '.');
}

function formatNumeric(value: number, integer: boolean): string {
  if (integer) return String(Math.round(value));
  const normalized = Number(value.toFixed(6));
  return String(normalized);
}

export function createSweepNumericParam(values: string[], fallback: string): SweepNumericParam {
  const listValues = values.length > 0 ? values.join(', ') : fallback;

  return {
    mode: 'LIST',
    listValues,
    rangeFrom: values[0] ?? fallback,
    rangeTo: values[values.length - 1] ?? fallback,
    rangeStep: '1'
  };
}

export function parseSweepList(source: string, integer = false, allowNull = false): string[] {
  const values = source
    .split(/[,\n;]+/)
    .map(normalizeNumericText)
    .filter(Boolean)
    .map((item) => {
      if (allowNull && item.toLowerCase() === 'null') return 'null';
      const numeric = Number(item);
      return Number.isFinite(numeric) ? formatNumeric(numeric, integer) : null;
    })
    .filter((item): item is string => item !== null);

  return Array.from(new Set(values));
}

export function expandSweepNumericParam(
  param: SweepNumericParam,
  options: ExpandSweepOptions = {}
): string[] {
  const integer = Boolean(options.integer);
  const maxValues = options.maxValues ?? 2000;
  const allowedValues = options.allowedValues;

  const values = param.mode === 'LIST'
    ? parseSweepList(param.listValues, integer, options.allowNull)
    : expandSweepRange(param, integer, maxValues);

  if (!allowedValues) return values;

  const allowed = new Set(allowedValues);
  const hasInvalidValues = values.some((value) => !allowed.has(value));
  return hasInvalidValues ? [] : values;
}

function expandSweepRange(param: SweepNumericParam, integer: boolean, maxValues: number): string[] {
  const from = Number(normalizeNumericText(param.rangeFrom));
  const to = Number(normalizeNumericText(param.rangeTo));
  const step = Number(normalizeNumericText(param.rangeStep));

  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step <= 0) {
    return [];
  }

  const values: string[] = [];
  if (to >= from) {
    for (let current = from; current <= to + step / 10; current += step) {
      values.push(formatNumeric(current, integer));
      if (values.length >= maxValues) break;
    }
  } else {
    for (let current = from; current >= to - step / 10; current -= step) {
      values.push(formatNumeric(current, integer));
      if (values.length >= maxValues) break;
    }
  }

  return Array.from(new Set(values));
}

export function getInvalidSweepValues(
  param: SweepNumericParam,
  options: ExpandSweepOptions = {}
): string[] {
  if (!options.allowedValues) return [];

  const values = param.mode === 'LIST'
    ? parseSweepList(param.listValues, Boolean(options.integer), options.allowNull)
    : expandSweepRange(param, Boolean(options.integer), options.maxValues ?? 2000);

  const allowed = new Set(options.allowedValues);
  return values.filter((value) => value !== 'null' && !allowed.has(value));
}

export function getSweepNumericParamError(
  param: SweepNumericParam,
  options: ExpandSweepOptions = {}
): string | null {
  if (param.mode === 'LIST') {
    const values = parseSweepList(param.listValues, Boolean(options.integer), options.allowNull);
    if (values.length === 0) return 'Выберите хотя бы одно значение.';

    if (options.allowedValues) {
      const allowed = new Set(options.allowedValues);
      const invalidValues = values.filter((value) => value !== 'null' && !allowed.has(value));
      if (invalidValues.length > 0) {
        return `Недоступные значения Veles: ${invalidValues.slice(0, 5).join(', ')}${invalidValues.length > 5 ? '...' : ''}`;
      }
    }

    return null;
  }

  const from = Number(normalizeNumericText(param.rangeFrom));
  const to = Number(normalizeNumericText(param.rangeTo));
  const step = Number(normalizeNumericText(param.rangeStep));

  if (!Number.isFinite(from)) return 'Укажите корректное значение "От".';
  if (!Number.isFinite(to)) return 'Укажите корректное значение "До".';
  if (!Number.isFinite(step) || step <= 0) return 'Шаг должен быть больше 0.';
  const values = expandSweepRange(param, Boolean(options.integer), options.maxValues ?? 2000);
  if (values.length === 0) return 'Диапазон не содержит значений.';

  if (options.allowedValues) {
    const allowed = new Set(options.allowedValues);
    const invalidValues = values.filter((value) => !allowed.has(value));
    if (invalidValues.length > 0) {
      return `Недоступные значения Veles: ${invalidValues.slice(0, 5).join(', ')}${invalidValues.length > 5 ? '...' : ''}`;
    }
  }

  return null;
}
