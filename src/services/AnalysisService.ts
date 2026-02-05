// src/services/AnalysisService.ts

import { RSI, ADX, ATR, EMA } from 'technicalindicators';
import { fetchCandles, type Candle } from './CandleService';

// Тип данных, который ждет наш UI (Widget)
export interface AnalysisResult {
  rsi: number;
  adx: number;
  atr_percent: number; // Значение для отображения в таблице (ATR 14)
  trend: 'UP' | 'DOWN' | 'FLAT';
  
  // Готовые рекомендации (чтобы UI не считал сам)
  recommended_tp: number;   // Рассчитано по ATR 14
  recommended_grid: number; // Рассчитано по ATR 100 (безопасность)
}

// Полный отчет по всем таймфреймам
export type FullAnalysis = Record<string, AnalysisResult>;

/**
 * 1. Внутренняя функция: Считает индикаторы по массиву свечей
 */
function calculateIndicators(candles: Candle[]): AnalysisResult {
  // Нам нужно минимум 110 свечей, чтобы посчитать ATR(100)
  if (candles.length < 110) {
    return { 
        rsi: 0, adx: 0, atr_percent: 0, trend: 'FLAT', 
        recommended_tp: 0, recommended_grid: 0 
    };
  }

  const closePrices = candles.map(c => c.close);
  const highPrices = candles.map(c => c.high);
  const lowPrices = candles.map(c => c.low);
  const currentPrice = closePrices[closePrices.length - 1];

  // --- A. RSI (14) ---
  const rsiValues = RSI.calculate({ values: closePrices, period: 14 });
  const lastRsi = rsiValues[rsiValues.length - 1] || 0;

  // --- B. ATR FAST (14) - Для отображения и TP ---
  const atrInputFast = { high: highPrices, low: lowPrices, close: closePrices, period: 14 };
  const atrValuesFast = ATR.calculate(atrInputFast);
  const lastAtrFast = atrValuesFast[atrValuesFast.length - 1] || 0;
  
  // ATR 14 в процентах
  const atrPercentFast = (lastAtrFast / currentPrice) * 100;

  // --- C. ATR SLOW (100) - Для безопасной Сетки ---
  const atrInputSlow = { high: highPrices, low: lowPrices, close: closePrices, period: 100 };
  const atrValuesSlow = ATR.calculate(atrInputSlow);
  const lastAtrSlow = atrValuesSlow[atrValuesSlow.length - 1] || 0;

  // ATR 100 в процентах
  const atrPercentSlow = (lastAtrSlow / currentPrice) * 100;

  // --- D. ADX (14) ---
  const adxValues = ADX.calculate({ ...atrInputFast, period: 14 });
  const lastAdx = adxValues[adxValues.length - 1]?.adx || 0;

  // --- E. TREND (EMA 20 & 50) ---
  const ema20 = EMA.calculate({ period: 20, values: closePrices });
  const ema50 = EMA.calculate({ period: 50, values: closePrices });
  
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];

  let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';

  // Фильтр: если ADX слабый (< 20), то тренда нет (Боковик)
  if (lastAdx > 20) {
    if (currentPrice > lastEma20 && lastEma20 > lastEma50) {
      trend = 'UP';
    } else if (currentPrice < lastEma20 && lastEma20 < lastEma50) {
      trend = 'DOWN';
    }
  }

  // --- РАСЧЕТ РЕКОМЕНДАЦИЙ ---
  // TP (Step): Берем "быстрый" ATR (14), чтобы ловить локальные движения
  const tpRecommendation = atrPercentFast * 0.5;

  // Grid (Сетка): Берем "медленный" ATR (100), чтобы сетка выдержала суточную волатильность
  // Множитель 10 (как и договаривались)
  const gridRecommendation = atrPercentSlow * 10;

  return {
    rsi: parseFloat(lastRsi.toFixed(2)),
    adx: parseFloat(lastAdx.toFixed(2)),
    atr_percent: parseFloat(atrPercentFast.toFixed(2)), // Для глаз показываем ATR 14
    trend,
    recommended_tp: parseFloat(tpRecommendation.toFixed(2)),
    recommended_grid: parseFloat(gridRecommendation.toFixed(2))
  };
}

/**
 * 2. Основная функция: Оркестратор
 */
export async function performFullAnalysis(symbol: string, exchange: string): Promise<FullAnalysis> {
  // Запускаем 3 запроса параллельно
  const [c15m, c1h, c4h] = await Promise.all([
    fetchCandles(symbol, exchange, '15m'),
    fetchCandles(symbol, exchange, '1h'),
    fetchCandles(symbol, exchange, '4h')
  ]);

  return {
    '15m': calculateIndicators(c15m),
    '1h':  calculateIndicators(c1h),
    '4h':  calculateIndicators(c4h)
  };
}