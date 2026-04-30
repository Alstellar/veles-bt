import type {
  StaticConfig,
  OrderState,
  EntryConfig,
  ExitConfig,
  FilterSlot
} from '../types';
import { getIndicatorSettings, resolveIndicator } from '../utils/indicatorMapping';
import { parseDateLike } from '../utils/datePolicy';
import { generateCustomVolumeDistributions } from '../utils/customOrderVolumes';

export interface ValidationSections {
  static: boolean;
  entry: boolean;
  order: boolean;
  exit: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sections: ValidationSections;
}

function hasValues(arr: string[]): boolean {
  return arr.length > 0 && arr.some((v) => v && v.trim() !== '');
}

function hasNumericValues(arr: string[]): boolean {
  return hasValues(arr) && arr.every((v) => Number.isFinite(parseFloat(v)));
}

function hasNumericOrNullValues(arr: string[]): boolean {
  return hasValues(arr) && arr.every((v) => v === 'null' || Number.isFinite(parseFloat(v)));
}

function getValidDate(value: unknown): Date | null {
  return parseDateLike(value as Date | string | number | null | undefined);
}

function validateSlotsAgainstLibrary(slots: FilterSlot[]): string | null {
  for (const slot of slots) {
    if (!slot.variants.length) return 'В одном из слотов нет вариантов индикаторов.';

    for (const variant of slot.variants) {
      const indicator = variant.indicator;
      if (!indicator) return 'Индикатор не выбран.';
      const indicatorLabel = resolveIndicator(indicator).def?.label ?? indicator;

      const rules = getIndicatorSettings(indicator);
      if (!rules) continue;
      const forceBasic = !rules.hasValue && !rules.hasOperation;
      const isBasic = forceBasic ? true : (rules.allowBasic ? Boolean(variant.basic) : false);

      if (rules.hasValue && !isBasic) {
        const value = String(variant.value ?? '').replace(',', '.').trim();
        if (value === '' || !Number.isFinite(Number(value))) {
          return `Индикатор ${indicatorLabel}: заполните корректное числовое значение.`;
        }
      }

      if (rules.hasOperation && !isBasic && variant.operation !== 'GREATER' && variant.operation !== 'LESS') {
        return `Индикатор ${indicatorLabel}: выберите условие сравнения (> или <).`;
      }
    }
  }

  return null;
}

export class ValidatorService {
  private static ok(): ValidationResult {
    return {
      valid: true,
      sections: {
        static: false,
        entry: false,
        order: false,
        exit: false
      }
    };
  }

  private static fail(section: keyof ValidationSections, error: string): ValidationResult {
    return {
      valid: false,
      error,
      sections: {
        static: section === 'static',
        entry: section === 'entry',
        order: section === 'order',
        exit: section === 'exit'
      }
    };
  }

  static validate(
    staticCfg: StaticConfig,
    entryCfg: EntryConfig,
    orderState: OrderState,
    exitCfg: ExitConfig
  ): ValidationResult {
    if (!staticCfg.namePrefix.trim()) {
      return this.fail('static', 'Базовые настройки: укажите имя теста (префикс).');
    }
    if (!staticCfg.exchange) {
      return this.fail('static', 'Базовые настройки: выберите биржу.');
    }
    if (!staticCfg.symbol.trim()) {
      return this.fail('static', 'Базовые настройки: выберите тикер.');
    }
    if (staticCfg.deposit <= 0) {
      return this.fail('static', 'Базовые настройки: депозит должен быть больше 0.');
    }
    if (staticCfg.leverage < 1) {
      return this.fail('static', 'Базовые настройки: плечо должно быть не меньше 1.');
    }

    const maker = parseFloat(staticCfg.makerFee);
    const taker = parseFloat(staticCfg.takerFee);
    if (Number.isNaN(maker) || maker < 0) {
      return this.fail('static', 'Базовые настройки: некорректная комиссия Maker.');
    }
    if (Number.isNaN(taker) || taker < 0) {
      return this.fail('static', 'Базовые настройки: некорректная комиссия Taker.');
    }

    const dFrom = getValidDate(staticCfg.dateFrom);
    const dTo = getValidDate(staticCfg.dateTo);
    if (!dFrom) {
      return this.fail('static', 'Базовые настройки: некорректная дата начала.');
    }
    if (!dTo) {
      return this.fail('static', 'Базовые настройки: некорректная дата окончания.');
    }
    if (dFrom.getTime() >= dTo.getTime()) {
      return this.fail('static', 'Базовые настройки: дата начала должна быть раньше даты окончания.');
    }

    if (entryCfg.filterSlots.length === 0) {
      return this.fail('entry', 'Условия открытия сделки: добавьте хотя бы один слот.');
    }
    const entryIndicatorError = validateSlotsAgainstLibrary(entryCfg.filterSlots);
    if (entryIndicatorError) {
      return this.fail('entry', entryIndicatorError);
    }

    if (!hasValues(orderState.general.pullUp ? [orderState.general.pullUp] : [])) {
      return this.fail('order', 'Ордера сделки: заполните поле подтяжки сетки.');
    }

    if (orderState.mode === 'SIMPLE') {
      const s = orderState.simple;
      if (!hasNumericValues(s.orders)) return this.fail('order', 'Ордера сделки (Простой): укажите корректное количество ордеров.');
      if (!hasNumericValues(s.martingale)) return this.fail('order', 'Ордера сделки (Простой): укажите корректный % мартингейла.');
      if (!hasNumericValues(s.indent)) return this.fail('order', 'Ордера сделки (Простой): укажите корректный отступ.');
      if (!hasNumericValues(s.overlap)) return this.fail('order', 'Ордера сделки (Простой): укажите корректное перекрытие.');
      if (s.logarithmicEnabled && !hasValues(s.logarithmicFactor)) {
        return this.fail('order', 'Ордера сделки (Простой): заполните коэффициент логарифмического распределения.');
      }
      if (s.logarithmicEnabled && !hasNumericValues(s.logarithmicFactor)) {
        return this.fail('order', 'Ордера сделки (Простой): коэффициент логарифмического распределения должен быть числом.');
      }
    } else if (orderState.mode === 'CUSTOM') {
      const c = orderState.custom;
      if (c.orders.length === 0) {
        return this.fail('order', 'Ордера сделки (Свой): добавьте хотя бы один ордер.');
      }

      let totalVol = 0;
      for (let i = 0; i < c.orders.length; i++) {
        const o = c.orders[i];
        if ((c.volumeMode ?? 'FIXED') === 'FIXED' && o.volume <= 0) {
          return this.fail('order', `Ордера сделки (Свой): ордер #${i + 1} имеет некорректный объем.`);
        }
        if (!hasNumericValues(o.indent)) {
          return this.fail('order', `Ордера сделки (Свой): ордер #${i + 1} имеет некорректный отступ.`);
        }
        totalVol += o.volume;
      }

      if ((c.volumeMode ?? 'FIXED') !== 'FIXED') {
        const volumeResult = generateCustomVolumeDistributions(c.orders, c.volumeMode ?? 'RANGE');
        if (volumeResult.error) {
          return this.fail('order', `Ордера сделки (Свой): ${volumeResult.error}`);
        }
        if (volumeResult.tooMany) {
          return this.fail('order', 'Ордера сделки (Свой): слишком много распределений объемов. Увеличьте шаг или сузьте диапазоны.');
        }
      } else if (Math.abs(totalVol - 100) > 0.1) {
        return this.fail('order', `Ордера сделки (Свой): сумма объемов должна быть 100% (сейчас ${totalVol.toFixed(2)}%).`);
      }
    } else if (orderState.mode === 'SIGNAL') {
      const s = orderState.signal;
      const volumeMode = s.volumeMode ?? 'FIXED';
      if (volumeMode === 'FIXED' && s.baseOrder.volume <= 0) {
        return this.fail('order', 'Ордера сделки (Сигнал): объем базового ордера должен быть больше 0.');
      }
      if (!hasNumericValues(s.baseOrder.indent)) {
        return this.fail('order', 'Ордера сделки (Сигнал): укажите отступ базового ордера.');
      }
      if (s.orders.length === 0) {
        return this.fail('order', 'Ордера сделки (Сигнал): добавьте хотя бы один сигнальный ордер.');
      }

      let totalVol = s.baseOrder.volume;
      for (let i = 0; i < s.orders.length; i++) {
        const o = s.orders[i];
        if (volumeMode === 'FIXED' && o.volume <= 0) {
          return this.fail('order', `Ордера сделки (Сигнал): ордер #${i + 1} имеет некорректный объем.`);
        }
        if (!hasNumericValues(o.indent)) {
          return this.fail('order', `Ордера сделки (Сигнал): ордер #${i + 1} имеет некорректный отступ.`);
        }
        const hasFilters = o.filterSlots.length > 0 && o.filterSlots.some((slot) => slot.variants.length > 0);
        if (!hasFilters) {
          return this.fail('order', `Ордера сделки (Сигнал): в ордере #${i + 1} отсутствуют фильтры.`);
        }
        const signalOrderError = validateSlotsAgainstLibrary(o.filterSlots);
        if (signalOrderError) {
          return this.fail('order', signalOrderError);
        }
        totalVol += o.volume;
      }

      if (volumeMode !== 'FIXED') {
        const volumeResult = generateCustomVolumeDistributions([s.baseOrder, ...s.orders], volumeMode);
        if (volumeResult.error) {
          return this.fail('order', `Ордера сделки (Сигнал): ${volumeResult.error}`);
        }
        if (volumeResult.tooMany) {
          return this.fail('order', 'Ордера сделки (Сигнал): слишком много распределений объемов. Увеличьте шаг или сузьте диапазоны.');
        }
      } else if (Math.abs(totalVol - 100) > 0.1) {
        return this.fail('order', `Ордера сделки (Сигнал): сумма объемов должна быть 100% (сейчас ${totalVol.toFixed(2)}%).`);
      }
    }

    if (exitCfg.profitMode === 'SINGLE') {
      if (!hasNumericValues(exitCfg.profitSingle.percents)) {
        return this.fail('exit', 'Выход из сделки (Простой): заполните проценты тейк-профита.');
      }
    } else if (exitCfg.profitMode === 'MULTIPLE') {
      const m = exitCfg.profitMultiple;
      const volumeMode = m.volumeMode ?? 'FIXED';
      if (m.orders.length === 0) {
        return this.fail('exit', 'Выход из сделки (Свой): добавьте хотя бы один ордер тейк-профита.');
      }

      let totalVol = 0;
      for (let i = 0; i < m.orders.length; i++) {
        const o = m.orders[i];
        if (!hasNumericValues(o.indent)) {
          return this.fail('exit', `Выход из сделки (Свой): ордер #${i + 1} имеет некорректный отступ.`);
        }
        if (volumeMode === 'FIXED' && o.volume <= 0) {
          return this.fail('exit', `Выход из сделки (Свой): ордер #${i + 1} имеет некорректный объем.`);
        }
        totalVol += o.volume;
      }

      if (volumeMode !== 'FIXED') {
        const volumeResult = generateCustomVolumeDistributions(m.orders, volumeMode);
        if (volumeResult.error) {
          return this.fail('exit', `Выход из сделки (Свой): ${volumeResult.error}`);
        }
        if (volumeResult.tooMany) {
          return this.fail('exit', 'Выход из сделки (Свой): слишком много распределений объемов. Увеличьте шаг или сузьте диапазоны.');
        }
      } else if (Math.abs(totalVol - 100) > 0.1) {
        return this.fail('exit', `Выход из сделки (Свой): сумма объемов должна быть 100% (сейчас ${totalVol.toFixed(1)}%).`);
      }
    } else if (exitCfg.profitMode === 'SIGNAL') {
      const s = exitCfg.profitSignal;
      if (!hasNumericOrNullValues(s.checkPnl)) {
        return this.fail('exit', 'Выход из сделки (Сигнал): заполните значения PnL.');
      }
      const hasInd = s.filterSlots.length > 0 && s.filterSlots.some((slot) => slot.variants.length > 0);
      if (!hasInd) {
        return this.fail('exit', 'Выход из сделки (Сигнал): добавьте условия фильтрации.');
      }
      const profitSignalError = validateSlotsAgainstLibrary(s.filterSlots);
      if (profitSignalError) {
        return this.fail('exit', profitSignalError);
      }
    }

    if (exitCfg.stopLoss.enabledSimple && !hasNumericValues(exitCfg.stopLoss.indent)) {
      return this.fail('exit', 'Стоп-лосс: включен простой режим, но отступ не заполнен.');
    }

    if (exitCfg.stopLoss.enabledSignal) {
      if (!hasNumericOrNullValues(exitCfg.stopLoss.conditionalIndent)) {
        return this.fail('exit', 'Стоп-лосс по сигналу: заполните условный отступ.');
      }
      const hasInd =
        exitCfg.stopLoss.filterSlots.length > 0 &&
        exitCfg.stopLoss.filterSlots.some((slot) => slot.variants.length > 0);
      if (!hasInd) {
        return this.fail('exit', 'Стоп-лосс по сигналу: добавьте условия фильтрации.');
      }
      const stopLossSignalError = validateSlotsAgainstLibrary(exitCfg.stopLoss.filterSlots);
      if (stopLossSignalError) {
        return this.fail('exit', stopLossSignalError);
      }
    }

    return this.ok();
  }
}
