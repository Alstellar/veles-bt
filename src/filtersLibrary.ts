import type { IndicatorType } from './types';

// Описание одного индикатора
export interface IndicatorDef {
  code: IndicatorType;
  label: string; 
  group: 'BASIC' | 'OSCILLATOR' | 'MA' | 'EMA' | 'CHANNELS' | 'OTHER';
  hasTimeframe: boolean; 
  hasBasicMode: boolean; 
}

// Словарь всех индикаторов
export const FILTERS_LIBRARY: Record<string, IndicatorDef> = {
  // --- БАЗОВЫЕ ---
  PRICE: { code: 'PRICE', label: 'Цена', group: 'BASIC', hasTimeframe: false, hasBasicMode: false },
  VOLUME: { code: 'VOLUME', label: 'Объем (Volume)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  NOMINAL_VOLUME: { code: 'NOMINAL_VOLUME', label: 'Оборот (Nominal Vol)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  
  PRICE_CHANGE: { code: 'PRICE_CHANGE', label: 'Изменение цены (1 бар)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_5: { code: 'PRICE_CHANGE_PERIOD_5', label: 'Изм. цены (5 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_10: { code: 'PRICE_CHANGE_PERIOD_10', label: 'Изм. цены (10 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_20: { code: 'PRICE_CHANGE_PERIOD_20', label: 'Изм. цены (20 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_30: { code: 'PRICE_CHANGE_PERIOD_30', label: 'Изм. цены (30 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_50: { code: 'PRICE_CHANGE_PERIOD_50', label: 'Изм. цены (50 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },
  PRICE_CHANGE_PERIOD_100: { code: 'PRICE_CHANGE_PERIOD_100', label: 'Изм. цены (100 баров)', group: 'BASIC', hasTimeframe: true, hasBasicMode: true },

  // --- ОСЦИЛЛЯТОРЫ ---
  RSI: { code: 'RSI', label: 'RSI', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  RSI_LEVELS: { code: 'RSI_LEVELS', label: 'RSI (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  CCI: { code: 'CCI', label: 'CCI', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  CCI_LEVELS: { code: 'CCI_LEVELS', label: 'CCI (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  ADX: { code: 'ADX', label: 'ADX', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  ATR: { code: 'ATR', label: 'ATR', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  ATR_PERCENT: { code: 'ATR_PERCENT', label: 'ATR (%)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MFI: { code: 'MFI', label: 'MFI', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MFI_LEVELS: { code: 'MFI_LEVELS', label: 'MFI (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MFI_CROSS_50: { code: 'MFI_CROSS_50', label: 'MFI (Cross 50)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  
  MACD_TREND: { code: 'MACD_TREND', label: 'MACD (Тренд)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MACD_CROSS_ZERO: { code: 'MACD_CROSS_ZERO', label: 'MACD (Cross 0)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MACD_CROSS_SIGNAL: { code: 'MACD_CROSS_SIGNAL', label: 'MACD (Cross Signal)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  MACD_HISTOGRAM_TREND: { code: 'MACD_HISTOGRAM_TREND', label: 'MACD (Гистограмма)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },

  RVI: { code: 'RVI', label: 'RVI', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  RVI_LEVELS: { code: 'RVI_LEVELS', label: 'RVI (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  CMO: { code: 'CMO', label: 'CMO', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  CMO_LEVELS: { code: 'CMO_LEVELS', label: 'CMO (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  ROC: { code: 'ROC', label: 'ROC', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  ROC_CROSS_ZERO: { code: 'ROC_CROSS_ZERO', label: 'ROC (Cross 0)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  WILLIAMS_R: { code: 'WILLIAMS_R', label: 'Williams %R', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  WILLIAMS_R_LEVELS: { code: 'WILLIAMS_R_LEVELS', label: 'Williams %R (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  AO_CROSS_ZERO: { code: 'AO_CROSS_ZERO', label: 'Awesome Osc (Cross 0)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  CHAIKIN_OSCILLATOR: { code: 'CHAIKIN_OSCILLATOR', label: 'Chaikin Osc', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  BALANCE_OF_POWER: { code: 'BALANCE_OF_POWER', label: 'Balance of Power', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },

  // --- STOCHASTIC ---
  FAST_STOCHASTIC_LEVELS: { code: 'FAST_STOCHASTIC_LEVELS', label: 'Stoch Fast (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  FAST_STOCHASTIC_CROSS: { code: 'FAST_STOCHASTIC_CROSS', label: 'Stoch Fast (Cross)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  SLOW_STOCHASTIC_LEVELS: { code: 'SLOW_STOCHASTIC_LEVELS', label: 'Stoch Slow (Уровни)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },
  SLOW_STOCHASTIC_CROSS: { code: 'SLOW_STOCHASTIC_CROSS', label: 'Stoch Slow (Cross)', group: 'OSCILLATOR', hasTimeframe: true, hasBasicMode: true },

  // --- SMA ---
  SMA_5: { code: 'SMA_5', label: 'SMA (5)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_10: { code: 'SMA_10', label: 'SMA (10)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_20: { code: 'SMA_20', label: 'SMA (20)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_30: { code: 'SMA_30', label: 'SMA (30)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_50: { code: 'SMA_50', label: 'SMA (50)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_100: { code: 'SMA_100', label: 'SMA (100)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_5: { code: 'SMA_CROSS_5', label: 'SMA Cross (5)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_10: { code: 'SMA_CROSS_10', label: 'SMA Cross (10)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_20: { code: 'SMA_CROSS_20', label: 'SMA Cross (20)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_30: { code: 'SMA_CROSS_30', label: 'SMA Cross (30)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_50: { code: 'SMA_CROSS_50', label: 'SMA Cross (50)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  SMA_CROSS_100: { code: 'SMA_CROSS_100', label: 'SMA Cross (100)', group: 'MA', hasTimeframe: true, hasBasicMode: true },

  // --- EMA ---
  EMA_5: { code: 'EMA_5', label: 'EMA (5)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_10: { code: 'EMA_10', label: 'EMA (10)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_20: { code: 'EMA_20', label: 'EMA (20)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_30: { code: 'EMA_30', label: 'EMA (30)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_50: { code: 'EMA_50', label: 'EMA (50)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_100: { code: 'EMA_100', label: 'EMA (100)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_5: { code: 'EMA_CROSS_5', label: 'EMA Cross (5)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_10: { code: 'EMA_CROSS_10', label: 'EMA Cross (10)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_20: { code: 'EMA_CROSS_20', label: 'EMA Cross (20)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_30: { code: 'EMA_CROSS_30', label: 'EMA Cross (30)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_50: { code: 'EMA_CROSS_50', label: 'EMA Cross (50)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_CROSS_100: { code: 'EMA_CROSS_100', label: 'EMA Cross (100)', group: 'EMA', hasTimeframe: true, hasBasicMode: true },
  EMA_50_CROSS_EMA_100: { code: 'EMA_50_CROSS_EMA_100', label: 'EMA 50 x 100', group: 'EMA', hasTimeframe: true, hasBasicMode: true },

  // --- КАНАЛЫ И ПРОЧЕЕ ---
  BOLLINGER_BANDS: { code: 'BOLLINGER_BANDS', label: 'Bollinger Bands', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  KELTNER_CHANNEL: { code: 'KELTNER_CHANNEL', label: 'Keltner Channel', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  DONCHIAN_CHANNEL: { code: 'DONCHIAN_CHANNEL', label: 'Donchian Channel', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  MEAN_REVERSION_CHANNEL_WEAK: { code: 'MEAN_REVERSION_CHANNEL_WEAK', label: 'Mean Reversion (Weak)', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  MEAN_REVERSION_CHANNEL_MEDIUM: { code: 'MEAN_REVERSION_CHANNEL_MEDIUM', label: 'Mean Reversion (Med)', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  MEAN_REVERSION_CHANNEL_STRONG: { code: 'MEAN_REVERSION_CHANNEL_STRONG', label: 'Mean Reversion (Strong)', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  TURTLE_ZONE: { code: 'TURTLE_ZONE', label: 'Turtle Zone', group: 'CHANNELS', hasTimeframe: true, hasBasicMode: true },
  
  PARABOLIC_SAR: { code: 'PARABOLIC_SAR', label: 'Parabolic SAR', group: 'OTHER', hasTimeframe: true, hasBasicMode: true },
  PARABOLIC_SAR_TREND: { code: 'PARABOLIC_SAR_TREND', label: 'Parabolic SAR (Trend)', group: 'OTHER', hasTimeframe: true, hasBasicMode: true },
  SUPERTREND: { code: 'SUPERTREND', label: 'SuperTrend', group: 'OTHER', hasTimeframe: true, hasBasicMode: true },
  SUPERTREND_TREND: { code: 'SUPERTREND_TREND', label: 'SuperTrend (Trend)', group: 'OTHER', hasTimeframe: true, hasBasicMode: true },
  
  HMA: { code: 'HMA', label: 'HMA', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_5: { code: 'HMA_VOLUME_5', label: 'HMA Volume (5)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_10: { code: 'HMA_VOLUME_10', label: 'HMA Volume (10)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_20: { code: 'HMA_VOLUME_20', label: 'HMA Volume (20)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_30: { code: 'HMA_VOLUME_30', label: 'HMA Volume (30)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_50: { code: 'HMA_VOLUME_50', label: 'HMA Volume (50)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  HMA_VOLUME_100: { code: 'HMA_VOLUME_100', label: 'HMA Volume (100)', group: 'MA', hasTimeframe: true, hasBasicMode: true },
  
  THREE_CANDLES: { code: 'THREE_CANDLES', label: 'Три свечи', group: 'OTHER', hasTimeframe: true, hasBasicMode: false },
  SRGART_DIVERGENCE: { code: 'SRGART_DIVERGENCE', label: 'SRGART Divergence', group: 'OTHER', hasTimeframe: true, hasBasicMode: true },
};