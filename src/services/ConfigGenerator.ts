/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  StaticConfig, OrderState, EntryConfig, ExitConfig, 
  Condition 
} from '../types';
import type { VelesConfigPayload, VelesCondition, VelesOrder } from './VelesService';

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

function convertCondition(c: Condition): VelesCondition {
  return {
    type: 'INDICATOR',
    indicator: c.indicator || 'RSI', 
    interval: c.interval || 'FIVE_MINUTES',
    basic: c.basic || false,
    value: (c.basic) ? null : (c.value ? Number(c.value) : null),
    operation: (c.basic) ? null : (c.operation || null),
    closed: c.closed !== undefined ? c.closed : true,
    reverse: c.reverse || false
  };
}

export class ConfigGenerator {

  /**
   * Генерация конфигураций
   * @param existingBatchId - если передан, используем его (для догенерации), иначе создаем новый
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
        if (orderState.custom.baseOrder.indent.length) {
             space['o_cust_base_indent'] = orderState.custom.baseOrder.indent;
        }
        orderState.custom.orders.forEach((o) => {
            if (o.indent.length) {
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

    // 3. Combinations
    const combinations = cartesian(space);
    const total = combinations.length;

    // 4. Payload generation with correct Naming
    const configs = combinations.map((comb, index) => {
        return this.buildPayload(staticCfg, orderState, exitCfg, comb, index + 1, total, batchId);
    });

    return { configs, batchId };
  }

  private static buildPayload(
    staticCfg: StaticConfig,
    orderState: OrderState,
    exitCfg: ExitConfig,
    comb: Record<string, any>,
    index: number,
    total: number,
    batchId: string
  ): VelesConfigPayload {
      
      // Symbol Logic
      let pair = staticCfg.symbol.trim().toUpperCase();
      if (!pair.includes('/')) pair = `${pair}/USDT`;
      // Чистый тикер для имени (HYPE)
      const ticker = pair.split('/')[0];

      // --- NAME GENERATION ---
      // Format: "{UserPrefix} {Ticker} | {i}/{N} | VelesBT {BatchID}"
      const testName = `${staticCfg.namePrefix} ${ticker} | ${index}/${total} | VelesBT ${batchId}`;

      // 1. Conditions
      const conditions: VelesCondition[] = [];
      Object.keys(comb).forEach(k => {
          if (k.startsWith('entry_slot_')) {
              conditions.push(convertCondition(comb[k]));
          }
      });

      // 2. Settings
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
          const baseIndent = Number(comb['o_cust_base_indent'] || 0);
          settings.orders.push({
              indent: baseIndent,
              volume: orderState.custom.baseOrder.volume
          });
          orderState.custom.orders.forEach(o => {
              settings.orders.push({
                  indent: Number(comb[`o_cust_ord_${o.id}_indent`]),
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

      // 3. Profit
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

      // 4. Stop Loss
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

              if (signalSLVal && signalSLVal !== 'null') {
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
          from: staticCfg.dateFrom.toISOString(),
          to: staticCfg.dateTo.toISOString(),
          useWicks: staticCfg.useWicks,
          public: staticCfg.isPublic,
          conditions: conditions,
          settings: settings,
          profit: profit,
          stopLoss: stopLoss
      };
  }
}