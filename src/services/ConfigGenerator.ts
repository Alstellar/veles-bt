// src/services/ConfigGenerator.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  StaticConfig, OrderState, EntryConfig, ExitConfig, 
  Condition 
} from '../types';
import type { VelesConfigPayload, VelesCondition, VelesOrder } from '../types/veles';
import { getIndicatorSettings, toApiIndicatorCode } from '../utils/indicatorMapping';

// --- HELPERS ---

/**
 * Генерация короткого ID группы (Batch ID), например "#A1B2"
 */
export function generateBatchId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '#';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function cartesian(args: Record<string, any[]>): Record<string, any>[] {
  const keys = Object.keys(args);
  const values = Object.values(args);
  if (values.length === 0) return [{}];
  const product = values.reduce((acc, curr) => acc.flatMap(d => curr.map(e => [...d, e])), [[]] as any[][]);
  return product.map(p => {
    const obj: Record<string, any> = {};
    keys.forEach((k, i) => { obj[k] = p[i]; });
    return obj;
  });
}

/**
 * Преобразование внутреннего условия (Condition) в формат API Veles.
 * Выполняет очистку неиспользуемых полей на основе FILTERS_LIBRARY.
 */
function convertCondition(c: Condition): VelesCondition {
  const code = toApiIndicatorCode(c.indicator || (c.type === 'PRICE' ? 'PRICE' : 'RSI'));

  // --- СПЕЦИАЛЬНЫЙ КЕЙС: PRICE ---
  // У Veles это отдельный тип условия, отличающийся от индикаторов
  if (code === 'PRICE') {
      return {
          type: 'PRICE', // Важно: тип именно PRICE, а не INDICATOR
          value: c.value ? Number(c.value) : 0,
          operation: c.operation || 'GREATER'
      } as any;
  }

  // --- СТАНДАРТНАЯ ЛОГИКА (INDICATOR) ---
  // Проверяем настройки из библиотеки. 
  // Если определения нет (fallback), считаем что поля разрешены.
  const settings = getIndicatorSettings(code);
  const allowValue = settings ? settings.hasValue : true;
  const allowOp = settings ? settings.hasOperation : true;

  const forceBasic = !allowValue && !allowOp;
  const isBasic = forceBasic ? true : Boolean(c.basic);
  const rawValue = typeof c.value === 'string' ? c.value.replace(',', '.').trim() : c.value;
  const parsedValue = rawValue === '' || rawValue === null || rawValue === undefined ? null : Number(rawValue);
  const normalizedOperation = c.operation === 'GREATER' || c.operation === 'LESS' ? c.operation : 'GREATER';

  return {
    type: 'INDICATOR',
    indicator: code, 
    interval: c.interval || 'FIVE_MINUTES',
    basic: isBasic,
    
    // ЛОГИКА ОЧИСТКИ:
    // Если включен Basic (карандашик) ИЛИ индикатор не поддерживает ввод числа -> null
    value: (isBasic || !allowValue) ? null : (Number.isFinite(parsedValue) ? parsedValue : null),
    
    // Если включен Basic ИЛИ индикатор не поддерживает операции (</>) -> null
    operation: (isBasic || !allowOp) ? null : normalizedOperation,
    
    closed: c.closed !== undefined ? c.closed : true,
    reverse: c.reverse || false
  };
}

export class ConfigGenerator {

  /**
   * Генерация списка конфигураций (Payloads) на основе перебора параметров.
   */
  static generate(
    staticCfg: StaticConfig,
    entryCfg: EntryConfig,
    orderState: OrderState,
    exitCfg: ExitConfig,
    existingBatchId?: string
  ): { configs: VelesConfigPayload[], batchId: string } {
    
    // 1. Создаем или используем ID группы
    const batchId = existingBatchId || generateBatchId();

    // 2. Сбор пространства поиска (Search Space)
    const space: Record<string, any[]> = {};

    // A. ENTRY
    entryCfg.filterSlots.forEach((slot, idx) => {
        if (slot.variants.length > 0) {
            space[`entry_slot_${idx}`] = slot.variants;
        }
    });

    // B. ORDERS
    if (orderState.mode === 'SIMPLE') {
        const s = orderState.simple;
        if(s.orders.length) space['o_sim_count'] = s.orders;
        if(s.martingale.length) space['o_sim_martingale'] = s.martingale;
        if(s.indent.length) space['o_sim_indent'] = s.indent;
        if(s.overlap.length) space['o_sim_overlap'] = s.overlap;
        if(s.logarithmicEnabled && s.logarithmicFactor.length) {
            space['o_sim_log'] = s.logarithmicFactor;
        }
    } 
    else if (orderState.mode === 'CUSTOM') {
        // Логика для CUSTOM: перебираем все ордера в едином массиве.
        // Если у ордера задано несколько вариантов отступа - добавляем в перебор.
        orderState.custom.orders.forEach((o) => {
             if (o.indent.length > 0) {
                 space[`o_cust_ord_${o.id}_indent`] = o.indent;
             }
        });
    }
    else if (orderState.mode === 'SIGNAL') {
        if (orderState.signal.baseOrder.indent.length) {
             space['o_sig_base_indent'] = orderState.signal.baseOrder.indent;
        }
        orderState.signal.orders.forEach((o) => {
            if (o.indent.length) {
                space[`o_sig_ord_${o.id}_indent`] = o.indent;
            }
            o.filterSlots.forEach((slot, sIdx) => {
                if (slot.variants.length) {
                    space[`o_sig_ord_${o.id}_slot_${sIdx}`] = slot.variants;
                }
            });
        });
    }

    // C. PROFIT
    if (exitCfg.profitMode === 'SINGLE') {
        if(exitCfg.profitSingle.percents.length) space['p_single_pct'] = exitCfg.profitSingle.percents;
    }
    else if (exitCfg.profitMode === 'MULTIPLE') {
        exitCfg.profitMultiple.orders.forEach(o => {
            if(o.indent.length) space[`p_mult_ord_${o.id}_indent`] = o.indent;
        });
    }
    else if (exitCfg.profitMode === 'SIGNAL') {
        if(exitCfg.profitSignal.checkPnl.length) space['p_sig_pnl'] = exitCfg.profitSignal.checkPnl;
        exitCfg.profitSignal.filterSlots.forEach((slot, idx) => {
             if (slot.variants.length) space[`p_sig_slot_${idx}`] = slot.variants;
        });
    }

    // D. STOP LOSS
    if (exitCfg.stopLoss.enabledSimple && exitCfg.stopLoss.indent.length) {
        space['sl_simple_indent'] = exitCfg.stopLoss.indent;
    }
    if (exitCfg.stopLoss.enabledSignal) {
        if(exitCfg.stopLoss.conditionalIndent.length) space['sl_sig_indent'] = exitCfg.stopLoss.conditionalIndent;
        exitCfg.stopLoss.filterSlots.forEach((slot, idx) => {
            if (slot.variants.length) space[`sl_sig_slot_${idx}`] = slot.variants;
        });
    }

    // 3. Комбинации (Декартово произведение)
    const combinations = cartesian(space);
    const total = combinations.length;

    // 4. Сборка итоговых конфигов
    const configs = combinations.map((comb, index) => {
        return this.buildPayload(staticCfg, orderState, exitCfg, comb, index + 1, total, batchId);
    });

    return { configs, batchId };
  }

  /**
   * Сборка одного конкретного конфига из комбинации параметров.
   */
  private static buildPayload(
    staticCfg: StaticConfig,
    orderState: OrderState,
    exitCfg: ExitConfig,
    comb: Record<string, any>,
    index: number,
    total: number,
    batchId: string
  ): VelesConfigPayload {
      
      // Логика тикера
      let pair = staticCfg.symbol.trim().toUpperCase();
      if (!pair.includes('/')) pair = `${pair}/USDT`;
      const ticker = pair.split('/')[0];

      // Формирование имени
      const testName = `${staticCfg.namePrefix} ${ticker} | ${index}/${total} | VH ${batchId}`;

      // 1. Условия входа
      const conditions: VelesCondition[] = [];
      Object.keys(comb).forEach(k => {
          if (k.startsWith('entry_slot_')) {
              conditions.push(convertCondition(comb[k]));
          }
      });

      // 2. Настройки сетки (Settings)
      let settings: any = { includePosition: true };
      let pullUpVal = parseFloat(orderState.general.pullUp);
      if (isNaN(pullUpVal)) pullUpVal = 0.2; 

      if (orderState.mode === 'SIMPLE') {
          const logEnabled = orderState.simple.logarithmicEnabled;
          const logFactor = comb['o_sim_log'] 
              ? Number(comb['o_sim_log']) 
              : (orderState.simple.logarithmicFactor?.[0] ? Number(orderState.simple.logarithmicFactor[0]) : 1.1);

          settings = {
              type: 'SIMPLE',
              includePosition: true,
              orders: Number(comb['o_sim_count']), 
              martingale: Number(comb['o_sim_martingale']),
              indent: Number(comb['o_sim_indent']),
              overlap: Number(comb['o_sim_overlap']),
              priceStrategy: logEnabled ? 'LOGARITHMIC' : 'LINEAR',
              logarithmicFactor: logEnabled ? logFactor : null
          };
      }
      else if (orderState.mode === 'CUSTOM') {
          settings = {
              type: 'CUSTOM',
              includePosition: true,
              orders: [] as any[]
          };
          
          // Проходим по единому списку ордеров
          orderState.custom.orders.forEach(o => {
              // Пытаемся найти значение в комбинации (если был Grid Search)
              const combKey = `o_cust_ord_${o.id}_indent`;
              let indentVal = 0;

              if (comb[combKey] !== undefined) {
                  indentVal = Number(comb[combKey]);
              } else if (o.indent.length > 0) {
                  // Фолбек: если вариаций нет, берем первое значение
                  indentVal = Number(o.indent[0]);
              }

              settings.orders.push({
                  indent: indentVal,
                  volume: o.volume
              });
          });
      }
      else if (orderState.mode === 'SIGNAL') {
          settings = {
              type: 'SIGNAL',
              indentType: orderState.signal.indentType, 
              includePosition: true,
              baseOrder: { 
                  indent: Number(comb['o_sig_base_indent'] || 0), 
                  volume: orderState.signal.baseOrder.volume 
              },
              orders: [] as VelesOrder[]
          };
          settings.orders = orderState.signal.orders.map(o => {
              const ordConditions: VelesCondition[] = [];
              o.filterSlots.forEach((_, sIdx) => {
                  const key = `o_sig_ord_${o.id}_slot_${sIdx}`;
                  if (comb[key]) ordConditions.push(convertCondition(comb[key]));
              });
              return {
                  indent: Number(comb[`o_sig_ord_${o.id}_indent`]),
                  volume: o.volume,
                  conditions: ordConditions
              };
          });
      }

      // 3. Тейк-профит (Profit)
      const profit: any = { currency: 'QUOTE' };
      if (exitCfg.profitMode === 'SINGLE') {
          profit.type = 'SINGLE';
          profit.percent = Number(comb['p_single_pct']);
          profit.trailing = null; 
      }
      else if (exitCfg.profitMode === 'MULTIPLE') {
          profit.type = 'MULTIPLE';
          profit.breakeven = exitCfg.profitMultiple.breakeven;
          profit.orders = exitCfg.profitMultiple.orders.map(o => ({
              indent: Number(comb[`p_mult_ord_${o.id}_indent`]),
              volume: o.volume
          }));
      }
      else if (exitCfg.profitMode === 'SIGNAL') {
          profit.type = 'SIGNAL';
          const pnlVal = comb['p_sig_pnl'];
          profit.checkPnl = (pnlVal === 'null') ? null : Number(pnlVal);
          const pConditions: VelesCondition[] = [];
          Object.keys(comb).forEach(k => {
              if (k.startsWith('p_sig_slot_')) pConditions.push(convertCondition(comb[k]));
          });
          profit.conditions = pConditions;
      }

      // 4. Стоп-лосс (Stop Loss)
      let stopLoss: any = undefined;
      const simpleSLVal = exitCfg.stopLoss.enabledSimple ? comb['sl_simple_indent'] : null;
      const signalSLVal = exitCfg.stopLoss.enabledSignal ? comb['sl_sig_indent'] : null;

      if (exitCfg.stopLoss.enabledSimple || exitCfg.stopLoss.enabledSignal) {
          stopLoss = {
              termination: false,
              indent: null,
              conditionalIndent: null,
              conditionalIndentType: null,
              conditions: null
          };

          if (exitCfg.stopLoss.enabledSimple && simpleSLVal) {
              stopLoss.indent = Math.abs(Number(simpleSLVal));
          }

          if (exitCfg.stopLoss.enabledSignal) {
              stopLoss.conditionalIndentType = exitCfg.stopLoss.conditionalIndentType;
              
              const slConditions: VelesCondition[] = [];
              Object.keys(comb).forEach(k => {
                  if (k.startsWith('sl_sig_slot_')) slConditions.push(convertCondition(comb[k]));
              });
              stopLoss.conditions = slConditions;

              const hasSignalIndentValue =
                  signalSLVal !== null &&
                  signalSLVal !== undefined &&
                  signalSLVal !== '' &&
                  signalSLVal !== 'null' &&
                  Number.isFinite(Number(signalSLVal));

              if (hasSignalIndentValue) {
                  stopLoss.conditionalIndent = -1 * Number(signalSLVal);
              } else {
                  stopLoss.conditionalIndent = null;
              }
          }
      }

      return {
          name: testName,
          symbol: pair, 
          symbols: [pair],
          exchange: staticCfg.exchange,
          algorithm: staticCfg.algo,
          pullUp: pullUpVal,
          portion: staticCfg.portion,
          commissions: { maker: staticCfg.makerFee, taker: staticCfg.takerFee },
          deposit: {
              amount: staticCfg.deposit,
              leverage: staticCfg.leverage,
              marginType: staticCfg.marginType
          },
          // Оборачиваем в new Date(), чтобы гарантировать, что это объект даты
          from: new Date(staticCfg.dateFrom).toISOString(),
          to: new Date(staticCfg.dateTo).toISOString(),
          useWicks: staticCfg.useWicks,
          public: staticCfg.isPublic,
          conditions: conditions,
          settings: settings,
          profit: profit,
          stopLoss: stopLoss
      };
  }
}
