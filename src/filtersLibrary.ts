// src/filtersLibrary.ts

export interface IndicatorSettings {
  hasTimeframe: boolean; // 1m, 5m, 15m...
  hasValue: boolean;     // Поле ввода числа
  hasOperation: boolean; // Больше / Меньше
  allowBasic: boolean;   // Карандашик (режим по умолчанию)
  hasReverse: boolean;   // Кнопка реверса
}

export interface IndicatorDef {
  code: string;
  label: string;
  // Поле group удалено
  settings: IndicatorSettings;
}

export const FILTERS_LIBRARY: Record<string, IndicatorDef> = {
  
  PRICE: {
    code: 'PRICE', 
    label: 'Цена', 
    settings: { hasTimeframe: false, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  VOLUME: {
    code: 'VOLUME', 
    label: 'Объем (базовый)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  NOMINAL_VOLUME: {
    code: 'NOMINAL_VOLUME', 
    label: 'Объем (номинальный)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  RSI: {
    code: 'RSI', 
    label: 'RSI', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  RVI: {
    code: 'RVI', 
    label: 'RVI', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  CCI: {
    code: 'CCI', 
    label: 'CCI', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  MFI: {
    code: 'MFI', 
    label: 'MFI', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  ADX: {
    code: 'ADX', 
    label: 'ADX', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  ATR: {
    code: 'ATR', 
    label: 'ATR', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  ATR_PERCENT: {
    code: 'ATR_PERCENT', 
    label: 'ATR %', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  CMO: {
    code: 'CMO', 
    label: 'CMO', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  WILLIAMS_R: {
    code: 'WILLIAMS_R', 
    label: 'Williams %R', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  WILLIAMS_R_LEVELS: {
    code: 'WILLIAMS_R_LEVELS', 
    label: 'Williams %R Levels', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  ROC: {
    code: 'ROC', 
    label: 'ROC', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  ROC_CROSS_ZERO: {
    code: 'ROC_CROSS_ZERO', 
    label: 'Пересечение ROC и нулевого уровня', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  PRICE_CHANGE: {
    code: 'PRICE_CHANGE', 
    label: '% изменения цены', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

  BOLLINGER_BANDS: {
    code: 'BOLLINGER_BANDS', 
    label: 'Полосы Боллинджера', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  TURTLE_ZONE: {
    code: 'TURTLE_ZONE', 
    label: 'Turtle Zone', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  RSI_LEVELS: {
    code: 'RSI_LEVELS', 
    label: 'Уровни RSI', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  RVI_LEVELS: {
    code: 'RVI_LEVELS', 
    label: 'Уровни RVI', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  CCI_LEVELS: {
    code: 'CCI_LEVELS', 
    label: 'Уровни CCI', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  CMO_LEVELS: {
    code: 'CMO_LEVELS', 
    label: 'Уровни CMO', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MFI_LEVELS: {
    code: 'MFI_LEVELS', 
    label: 'Уровни MFI', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  SMA_5: {
    code: 'SMA_5', 
    label: 'SMA (Период 5)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_10: {
    code: 'SMA_10', 
    label: 'SMA (Период 10)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_20: {
    code: 'SMA_20', 
    label: 'SMA (Период 20)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_30: {
    code: 'SMA_30', 
    label: 'SMA (Период 30)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_50: {
    code: 'SMA_50', 
    label: 'SMA (Период 50)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_100: {
    code: 'SMA_100', 
    label: 'SMA (Период 100)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  EMA_5: {
    code: 'EMA_5', 
    label: 'EMA (Период 5)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_10: {
    code: 'EMA_10', 
    label: 'EMA (Период 10)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_20: {
    code: 'EMA_20', 
    label: 'EMA (Период 20)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_30: {
    code: 'EMA_30', 
    label: 'EMA (Период 30)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_50: {
    code: 'EMA_50', 
    label: 'EMA (Период 50)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_100: {
    code: 'EMA_100', 
    label: 'EMA (Период 100)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  EMA_50_CROSS_EMA_100: {
    code: 'EMA_50_CROSS_EMA_100', 
    label: 'EMA 50 пересечение EMA 100', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  SMA_CROSS_5: {
    code: 'SMA_CROSS_5', 
    label: 'SMA пересечение ценой (период 5)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_CROSS_10: {
    code: 'SMA_CROSS_10', 
    label: 'SMA пересечение ценой (период 10)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_CROSS_20: {
    code: 'SMA_CROSS_20', 
    label: 'SMA пересечение ценой (период 20)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_CROSS_30: {
    code: 'SMA_CROSS_30', 
    label: 'SMA пересечение ценой (период 30)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_CROSS_50: {
    code: 'SMA_CROSS_50', 
    label: 'SMA пересечение ценой (период 50)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SMA_CROSS_100: {
    code: 'SMA_CROSS_100', 
    label: 'SMA пересечение ценой (период 100)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  EMA_CROSS_5: {
    code: 'EMA_CROSS_5', 
    label: 'EMA пересечение ценой (период 5)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_CROSS_10: {
    code: 'EMA_CROSS_10', 
    label: 'EMA пересечение ценой (период 10)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_CROSS_20: {
    code: 'EMA_CROSS_20', 
    label: 'EMA пересечение ценой (период 20)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_CROSS_30: {
    code: 'EMA_CROSS_30', 
    label: 'EMA пересечение ценой (период 30)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_CROSS_50: {
    code: 'EMA_CROSS_50', 
    label: 'EMA пересечение ценой (период 50)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  EMA_CROSS_100: {
    code: 'EMA_CROSS_100', 
    label: 'EMA пересечение ценой (период 100)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MACD_CROSS_ZERO: {
    code: 'MACD_CROSS_ZERO', 
    label: 'Пересечение MACD и нулевого уровня', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MACD_CROSS_SIGNAL: {
    code: 'MACD_CROSS_SIGNAL', 
    label: 'Пересечение MACD и сигнальной линии', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MACD_HISTOGRAM_TREND: {
    code: 'MACD_HISTOGRAM_TREND', 
    label: 'Смена тренда по гистограмме MACD', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MACD_TREND: {
    code: 'MACD_TREND', 
    label: 'Тренд по гистограмме MACD', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  FAST_STOCHASTIC_LEVELS: {
    code: 'FAST_STOCHASTIC_LEVELS', 
    label: 'Быстрый Стохастик, уровни', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  FAST_STOCHASTIC_CROSS: {
    code: 'FAST_STOCHASTIC_CROSS', 
    label: 'Быстрый Стохастик, пересечение линий', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SLOW_STOCHASTIC_LEVELS: {
    code: 'SLOW_STOCHASTIC_LEVELS', 
    label: 'Стохастик, уровни', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SLOW_STOCHASTIC_CROSS: {
    code: 'SLOW_STOCHASTIC_CROSS', 
    label: 'Стохастик, пересечение линий', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  KELTNER_CHANNEL: {
    code: 'KELTNER_CHANNEL', 
    label: 'Канал Кельтнера', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  HMA: {
    code: 'HMA', 
    label: 'Скользящее среднее Халла', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  BALANCE_OF_POWER: {
    code: 'BALANCE_OF_POWER', 
    label: 'Баланс сил', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  THREE_CANDLES: {
    code: 'THREE_CANDLES', 
    label: 'Три солдата/ворона', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  PARABOLIC_SAR: {
    code: 'PARABOLIC_SAR', 
    label: 'Смена тренда SAR', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  PARABOLIC_SAR_TREND: {
    code: 'PARABOLIC_SAR_TREND', 
    label: 'Тренд SAR', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  AO_CROSS_ZERO: {
    code: 'AO_CROSS_ZERO', 
    label: 'Чудесный осциллятор, пересечение 0-го уровня', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  SUPERTREND: {
    code: 'SUPERTREND', 
    label: 'Смена тренда SuperTrend', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  SUPERTREND_TREND: {
    code: 'SUPERTREND_TREND', 
    label: 'Тренд SuperTrend', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  DONCHIAN_CHANNEL: {
    code: 'DONCHIAN_CHANNEL', 
    label: 'Канал Дончиана', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  CHAIKIN_OSCILLATOR: {
    code: 'CHAIKIN_OSCILLATOR', 
    label: 'Осциллятор Чайкина', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MEAN_REVERSION_CHANNEL_WEAK: {
    code: 'MEAN_REVERSION_CHANNEL_WEAK', 
    label: 'Mean Reversion channel: Слабые уровни', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  MEAN_REVERSION_CHANNEL_MEDIUM: {
    code: 'MEAN_REVERSION_CHANNEL_MEDIUM', 
    label: 'Mean Reversion channel: Средние уровни', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  MEAN_REVERSION_CHANNEL_STRONG: {
    code: 'MEAN_REVERSION_CHANNEL_STRONG', 
    label: 'Mean Reversion channel: Сильные уровни', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  SRGART_DIVERGENCE: {
    code: 'SRGART_DIVERGENCE', 
    label: 'SrgArt DiverX', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  HMA_VOLUME_5: {
    code: 'HMA_VOLUME_5', 
    label: 'Скользащая объемов Халла (период 5)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  HMA_VOLUME_10: {
    code: 'HMA_VOLUME_10', 
    label: 'Скользащая объемов Халла (период 10)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  HMA_VOLUME_20: {
    code: 'HMA_VOLUME_20', 
    label: 'Скользащая объемов Халла (период 20)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  HMA_VOLUME_30: {
    code: 'HMA_VOLUME_30', 
    label: 'Скользащая объемов Халла (период 30)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  HMA_VOLUME_50: {
    code: 'HMA_VOLUME_50', 
    label: 'Скользащая объемов Халла (период 50)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },
  
  HMA_VOLUME_100: {
    code: 'HMA_VOLUME_100', 
    label: 'Скользащая объемов Халла (период 100)', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  MFI_CROSS_50: {
    code: 'MFI_CROSS_50', 
    label: 'MFI пересечение середины диапазона', 
    settings: { hasTimeframe: true, hasValue: false, hasOperation: false, allowBasic: true, hasReverse: true }
  },

  PRICE_CHANGE_PERIOD_5: {
    code: 'PRICE_CHANGE_PERIOD_5', 
    label: '% изменения цены за N свечей (период 5)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  PRICE_CHANGE_PERIOD_10: {
    code: 'PRICE_CHANGE_PERIOD_10', 
    label: '% изменения цены за N свечей (период 10)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  PRICE_CHANGE_PERIOD_20: {
    code: 'PRICE_CHANGE_PERIOD_20', 
    label: '% изменения цены за N свечей (период 20)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  PRICE_CHANGE_PERIOD_30: {
    code: 'PRICE_CHANGE_PERIOD_30', 
    label: '% изменения цены за N свечей (период 30)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  PRICE_CHANGE_PERIOD_50: {
    code: 'PRICE_CHANGE_PERIOD_50', 
    label: '% изменения цены за N свечей (период 50)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },
  
  PRICE_CHANGE_PERIOD_100: {
    code: 'PRICE_CHANGE_PERIOD_100', 
    label: '% изменения цены за N свечей (период 100)', 
    settings: { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false }
  },

};