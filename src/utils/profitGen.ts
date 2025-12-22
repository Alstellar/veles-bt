// src/utils/profitGen.ts

/**
 * Генерирует список доступных процентов для Simple Take Profit
 * по правилам Veles:
 * 0.2% - 2% (шаг 0.05%)
 * 2% - 3% (шаг 0.1%)
 * 3% - 10% (шаг 0.5%)
 * 10% - 30% (шаг 1%)
 * 30% - 90% (шаг 5%)
 */
export const generateProfitOptions = (): string[] => {
  const options: number[] = [];

  // Хелпер для добавления диапазона с округлением
  const addRange = (start: number, end: number, step: number) => {
    // start и end умножаем на 100, чтобы работать с целыми числами и избежать проблем float
    // например 0.2 -> 20, 0.05 -> 5
    const iStart = Math.round(start * 100);
    const iEnd = Math.round(end * 100);
    const iStep = Math.round(step * 100);

    for (let i = iStart; i <= iEnd; i += iStep) {
      options.push(i / 100); 
    }
  };

  addRange(0.2, 2.0, 0.05);
  addRange(2.1, 3.0, 0.1); 
  addRange(3.5, 10.0, 0.5);
  addRange(11.0, 30.0, 1.0);
  addRange(35.0, 90.0, 5.0);

  // Удаляем дубликаты и сортируем
  const unique = Array.from(new Set(options)).sort((a, b) => a - b);

  return unique.map(num => num.toString());
};

export const PROFIT_OPTIONS = generateProfitOptions();


// Генерирует опции для Минимального P&L (0.1% - 10% с шагом 0.1%)

export const generatePnlOptions = (): string[] => {
  const options: number[] = [];
  for (let i = 1; i <= 100; i++) {
    options.push(i / 10); // 0.1 ... 10.0
  }
  return options.map(n => n.toString());
};

export const PNL_OPTIONS = generatePnlOptions();


/**
 * Базовый генератор чисел по модулю (0.05 ... 99.00)
 */
const generateBaseRange = (): number[] => {
  const options: number[] = [];
  const addRange = (start: number, end: number, step: number) => {
    const iStart = Math.round(start * 100);
    const iEnd = Math.round(end * 100);
    const iStep = Math.round(step * 100);
    for (let i = iStart; i <= iEnd; i += iStep) {
      options.push(i / 100);
    }
  };
  addRange(0.05, 3.0, 0.05);
  addRange(3.1, 5.0, 0.1);
  addRange(5.5, 10.0, 0.5);
  addRange(11.0, 99.0, 1.0);
  
  // Сортировка по возрастанию модуля
  return Array.from(new Set(options)).sort((a, b) => a - b);
};

export const STOP_LOSS_OPTIONS = generateBaseRange().map(n => `-${n}`);

/**
 * Опции для Conditional Stop Loss
 * Порядок:
 * 1. 'null' (добавим вручную в компоненте, здесь только числа)
 * 2. Отрицательные (от -0.05 до -99)
 * 3. Положительные (от 0.05 до 99)
 */
export const CONDITIONAL_OPTIONS = [
    ...generateBaseRange().map(n => `-${n}`), // Сначала минусы
    ...generateBaseRange().map(n => `${n}`)   // Потом плюсы
];