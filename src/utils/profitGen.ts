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