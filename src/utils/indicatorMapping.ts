import { FILTERS_LIBRARY, type IndicatorDef, type IndicatorSettings } from '../filtersLibrary';

export interface ResolvedIndicator {
  apiCode: string;
  baseCode: string;
  period: number | null;
  def: IndicatorDef | null;
  settings: IndicatorSettings | null;
  periods: number[];
}

const INDICATOR_WITH_PERIOD_REGEX = /^(.*)_(\d+)$/;

function getPeriods(def: IndicatorDef | null): number[] {
  if (!def?.settings?.periods?.length) return [];
  return def.settings.periods;
}

export function resolveIndicator(indicatorCode?: string): ResolvedIndicator {
  const fallbackCode = indicatorCode || 'RSI';
  const directDef = FILTERS_LIBRARY[fallbackCode] ?? null;

  if (directDef) {
    const periods = getPeriods(directDef);
    const period = periods.length > 0 ? periods[0] : null;
    return {
      apiCode: periods.length > 0 ? `${fallbackCode}_${period}` : fallbackCode,
      baseCode: fallbackCode,
      period,
      def: directDef,
      settings: directDef.settings,
      periods
    };
  }

  const match = fallbackCode.match(INDICATOR_WITH_PERIOD_REGEX);
  if (!match) {
    return {
      apiCode: fallbackCode,
      baseCode: fallbackCode,
      period: null,
      def: null,
      settings: null,
      periods: []
    };
  }

  const [, baseCode, rawPeriod] = match;
  const parsedPeriod = Number(rawPeriod);
  const baseDef = FILTERS_LIBRARY[baseCode] ?? null;
  const periods = getPeriods(baseDef);

  if (!baseDef || !periods.includes(parsedPeriod)) {
    return {
      apiCode: fallbackCode,
      baseCode: fallbackCode,
      period: null,
      def: null,
      settings: null,
      periods: []
    };
  }

  return {
    apiCode: fallbackCode,
    baseCode,
    period: parsedPeriod,
    def: baseDef,
    settings: baseDef.settings,
    periods
  };
}

export function toApiIndicatorCode(indicatorCode?: string, periodOverride?: number | null): string {
  const resolved = resolveIndicator(indicatorCode);
  if (!resolved.def) return resolved.apiCode;
  if (resolved.periods.length === 0) return resolved.baseCode;

  const targetPeriod = typeof periodOverride === 'number' ? periodOverride : resolved.period;
  const period = targetPeriod && resolved.periods.includes(targetPeriod)
    ? targetPeriod
    : resolved.periods[0];

  return `${resolved.baseCode}_${period}`;
}

export function getIndicatorSettings(indicatorCode?: string): IndicatorSettings | null {
  return resolveIndicator(indicatorCode).settings;
}

export function isSupportedIndicator(indicatorCode?: string): boolean {
  return Boolean(resolveIndicator(indicatorCode).def);
}

