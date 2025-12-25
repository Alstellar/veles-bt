import type { 
  StaticConfig, OrderState, EntryConfig, ExitConfig 
} from '../types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Хелпер: проверяет, что массив строк содержит хотя бы одно непустое значение
function hasValues(arr: string[]): boolean {
  return arr.length > 0 && arr.some(v => v && v.trim() !== '');
}

export class ValidatorService {
  
  static validate(
    staticCfg: StaticConfig, 
    entryCfg: EntryConfig, 
    orderState: OrderState, 
    exitCfg: ExitConfig
  ): ValidationResult {

    // --- 1. STATIC CONFIG (Базовые) ---
    if (!staticCfg.namePrefix.trim()) return { valid: false, error: 'Базовые: Не указано имя теста (префикс).' };
    if (!staticCfg.exchange) return { valid: false, error: 'Базовые: Не выбрана биржа.' };
    if (!staticCfg.symbol.trim()) return { valid: false, error: 'Базовые: Не выбрана монета.' };
    if (staticCfg.deposit <= 0) return { valid: false, error: 'Базовые: Депозит должен быть больше 0.' };
    if (staticCfg.leverage < 1) return { valid: false, error: 'Базовые: Плечо должно быть не менее 1.' };

    const maker = parseFloat(staticCfg.makerFee);
    const taker = parseFloat(staticCfg.takerFee);
    if (isNaN(maker) || maker < 0) return { valid: false, error: 'Базовые: Некорректная комиссия Maker.' };
    if (isNaN(taker) || taker < 0) return { valid: false, error: 'Базовые: Некорректная комиссия Taker.' };


    // --- 2. ENTRY CONFIG (Вход) ---
    const hasEntryConditions = entryCfg.filterSlots.length > 0 && 
                               entryCfg.filterSlots.some(slot => slot.variants.length > 0);
    
    if (!hasEntryConditions) {
      return { 
        valid: false, 
        error: 'Вход: Не заданы условия входа. Добавьте хотя бы один индикатор.' 
      };
    }


    // --- 3. ORDER STATE (Сетка) ---
    if (orderState.mode === 'SIMPLE') {
        const s = orderState.simple;
        if (!hasValues(s.orders)) return { valid: false, error: 'Сетка (Simple): Не указано количество ордеров.' };
        if (!hasValues(s.martingale)) return { valid: false, error: 'Сетка (Simple): Не указан Мартингейл.' };
        if (!hasValues(s.indent)) return { valid: false, error: 'Сетка (Simple): Не указан Отступ.' };
        if (!hasValues(s.overlap)) return { valid: false, error: 'Сетка (Simple): Не указано Перекрытие.' };
        
        if (s.logarithmicEnabled && !hasValues(s.logarithmicFactor)) {
             return { valid: false, error: 'Сетка (Simple): Включено лог. распределение, но не указан коэффициент.' };
        }
    }
    else if (orderState.mode === 'CUSTOM') {
        const c = orderState.custom;
        if (c.baseOrder.volume <= 0) return { valid: false, error: 'Сетка (Custom): Объем базового ордера должен быть > 0.' };
        
        if (c.orders.length === 0) return { valid: false, error: 'Сетка (Custom): Не добавлено ни одного страховочного ордера.' };

        for (let i = 0; i < c.orders.length; i++) {
            const o = c.orders[i];
            if (o.volume <= 0) return { valid: false, error: `Сетка (Custom): Ордер #${i+1} имеет некорректный объем.` };
            if (!hasValues(o.indent)) return { valid: false, error: `Сетка (Custom): Ордер #${i+1} не имеет отступа.` };
        }
    }
    else if (orderState.mode === 'SIGNAL') {
        const s = orderState.signal;
        if (s.baseOrder.volume <= 0) return { valid: false, error: 'Сетка (Signal): Объем базового ордера должен быть > 0.' };
        
        if (s.orders.length === 0) return { valid: false, error: 'Сетка (Signal): Не добавлено ни одного страховочного ордера.' };

        for (let i = 0; i < s.orders.length; i++) {
            const o = s.orders[i];
            if (o.volume <= 0) return { valid: false, error: `Сетка (Signal): Ордер #${i+1} имеет некорректный объем.` };
            if (!hasValues(o.indent)) return { valid: false, error: `Сетка (Signal): Ордер #${i+1} не имеет отступа.` };
            // Индикаторы для сеток по сигналу не обязательны (может быть просто лимитка), поэтому не проверяем filterSlots
        }
    }


    // --- 4. EXIT CONFIG (Выход) ---

    // -- Profit --
    if (exitCfg.profitMode === 'SINGLE') {
       if (!hasValues(exitCfg.profitSingle.percents)) {
           return { valid: false, error: 'Тейк-профит (Простой): Не указан процент.' };
       }
    }
    else if (exitCfg.profitMode === 'MULTIPLE') {
       const m = exitCfg.profitMultiple;
       if (m.orders.length === 0) return { valid: false, error: 'Тейк-профит (Свой): Не добавлены ордера.' };
       
       let totalVol = 0;
       for (let i = 0; i < m.orders.length; i++) {
           const o = m.orders[i];
           if (!hasValues(o.indent)) return { valid: false, error: `Тейк-профит (Свой): Ордер #${i+1} не имеет отступа.` };
           if (o.volume <= 0) return { valid: false, error: `Тейк-профит (Свой): Ордер #${i+1} имеет некорректный объем.` };
           totalVol += o.volume;
       }
       // Проверка суммы объемов (допускаем погрешность float)
       if (Math.abs(totalVol - 100) > 0.1) {
           return { valid: false, error: `Тейк-профит (Свой): Сумма объемов должна быть 100% (сейчас ${totalVol.toFixed(1)}%).` };
       }
    }
    else if (exitCfg.profitMode === 'SIGNAL') {
       const s = exitCfg.profitSignal;
       // PnL массив не должен быть пустым (значения 'null' допустимы, но сам массив должен быть заполнен)
       if (s.checkPnl.length === 0) return { valid: false, error: 'Тейк-профит (Сигнал): Не выбраны варианты PnL.' };
       
       const hasInd = s.filterSlots.length > 0 && s.filterSlots.some(slot => slot.variants.length > 0);
       // Veles требует индикаторы, если выбран режим по сигналу (даже если PnL=null)
       if (!hasInd) return { valid: false, error: 'Тейк-профит (Сигнал): Не добавлены индикаторы.' };
    }

    // -- Stop Loss --
    if (exitCfg.stopLoss.enabledSimple) {
        if (!hasValues(exitCfg.stopLoss.indent)) {
            return { valid: false, error: 'Стоп-лосс: Включен, но не указан процент отступа.' };
        }
    }

    if (exitCfg.stopLoss.enabledSignal) {
        // Проверка PnL (conditionalIndent)
        if (exitCfg.stopLoss.conditionalIndent.length === 0) {
            return { valid: false, error: 'Стоп-лосс (Сигнал): Не выбраны варианты мин. отступа (или "Отключено").' };
        }

        const hasInd = exitCfg.stopLoss.filterSlots.length > 0 && exitCfg.stopLoss.filterSlots.some(slot => slot.variants.length > 0);
        if (!hasInd) {
            return { valid: false, error: 'Стоп-лосс (Сигнал): Включен, но не добавлены индикаторы.' };
        }
    }

    return { valid: true };
  }
}