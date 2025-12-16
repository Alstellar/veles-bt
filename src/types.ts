// src/types.ts

// --- 1. Статические настройки (База) ---
export type ExchangeType = 'BINANCE_FUTURES' | 'BINANCE_SPOT' | 'BYBIT_FUTURES' | 'BYBIT_SPOT' | 'OKX_FUTURES' | 'OKX_SPOT';
export type AlgoType = 'LONG' | 'SHORT';
export type MarginType = 'CROSS' | 'ISOLATED';

export interface StaticConfig {
  namePrefix: string;
  exchange: ExchangeType;
  algo: AlgoType;
  symbol: string;      
  deposit: number;
  leverage: number;
  marginType: MarginType;
  portion: number;
  
  dateFrom: Date;
  dateTo: Date;

  makerFee: string;
  takerFee: string;

  isPublic: boolean;
  useWicks: boolean;
}

// --- 2. ENUMS ---

export type IntervalType = 
  | 'ONE_MINUTE' 
  | 'FIVE_MINUTES' 
  | 'FIFTEEN_MINUTES' 
  | 'THIRTY_MINUTES' 
  | 'ONE_HOUR' 
  | 'FOUR_HOUR' 
  | 'ONE_DAY';

export type IndicatorType = 
  | 'PRICE' | 'VOLUME' | 'NOMINAL_VOLUME' | 'PRICE_CHANGE'
  | 'PRICE_CHANGE_PERIOD_5' | 'PRICE_CHANGE_PERIOD_10' | 'PRICE_CHANGE_PERIOD_20'
  | 'PRICE_CHANGE_PERIOD_30' | 'PRICE_CHANGE_PERIOD_50' | 'PRICE_CHANGE_PERIOD_100'
  | 'RSI' | 'RSI_LEVELS' | 'RVI' | 'RVI_LEVELS' | 'CCI' | 'CCI_LEVELS'
  | 'MFI' | 'MFI_LEVELS' | 'MFI_CROSS_50' | 'ADX' | 'ATR' | 'ATR_PERCENT'
  | 'CMO' | 'CMO_LEVELS' | 'ROC' | 'ROC_CROSS_ZERO'
  | 'WILLIAMS_R' | 'WILLIAMS_R_LEVELS' | 'AO_CROSS_ZERO'
  | 'CHAIKIN_OSCILLATOR' | 'BALANCE_OF_POWER'
  | 'MACD_TREND' | 'MACD_CROSS_ZERO' | 'MACD_CROSS_SIGNAL' | 'MACD_HISTOGRAM_TREND'
  | 'FAST_STOCHASTIC_LEVELS' | 'FAST_STOCHASTIC_CROSS'
  | 'SLOW_STOCHASTIC_LEVELS' | 'SLOW_STOCHASTIC_CROSS'
  | 'SMA_5' | 'SMA_10' | 'SMA_20' | 'SMA_30' | 'SMA_50' | 'SMA_100'
  | 'SMA_CROSS_5' | 'SMA_CROSS_10' | 'SMA_CROSS_20' | 'SMA_CROSS_30' | 'SMA_CROSS_50' | 'SMA_CROSS_100'
  | 'EMA_5' | 'EMA_10' | 'EMA_20' | 'EMA_30' | 'EMA_50' | 'EMA_100'
  | 'EMA_CROSS_5' | 'EMA_CROSS_10' | 'EMA_CROSS_20' | 'EMA_CROSS_30' | 'EMA_CROSS_50' | 'EMA_CROSS_100'
  | 'EMA_50_CROSS_EMA_100'
  | 'BOLLINGER_BANDS' | 'KELTNER_CHANNEL' | 'DONCHIAN_CHANNEL'
  | 'MEAN_REVERSION_CHANNEL_WEAK' | 'MEAN_REVERSION_CHANNEL_MEDIUM' | 'MEAN_REVERSION_CHANNEL_STRONG'
  | 'TURTLE_ZONE' | 'PARABOLIC_SAR' | 'PARABOLIC_SAR_TREND' | 'SUPERTREND' | 'SUPERTREND_TREND'
  | 'HMA' | 'HMA_VOLUME_5' | 'HMA_VOLUME_10' | 'HMA_VOLUME_20' | 'HMA_VOLUME_30'
  | 'HMA_VOLUME_50' | 'HMA_VOLUME_100' | 'THREE_CANDLES' | 'SRGART_DIVERGENCE'
  | string; 

export type OperationType = 'GREATER' | 'LESS' | null;

// --- 3. Conditions (Вариант условия) ---

export interface Condition {
  id?: string;
  type: 'PRICE' | 'INDICATOR';
  
  // ВАЖНО: Теперь это одиночное значение, а не массив
  value: string; 
  
  indicator?: IndicatorType;
  interval?: IntervalType;
  basic?: boolean; 
  operation?: OperationType;
  closed?: boolean; 
  reverse?: boolean; 
}

// --- 4. Filter Slots (Группы фильтров) ---

export interface FilterSlot {
  id: string;
  variants: Condition[]; // Список вариантов (RSI, CCI и т.д.) внутри одного слота
}

// --- 5. Order Settings ---

export type GridMode = 'SIMPLE' | 'CUSTOM' | 'SIGNAL';

export interface OrderGeneralConfig {
  pullUp: string[];
}

export interface OrderSimpleConfig {
  orders: string[];      
  martingale: string[];  
  indent: string[];      
  overlap: string[];     
  logarithmicEnabled: boolean; 
  logarithmicFactor: string[]; 
  includePosition: boolean;
}

export interface SignalOrderLine {
  id: string;
  indent: string[]; 
  volume: number;   
  
  // ВАЖНО: Заменили conditions на filterSlots
  filterSlots: FilterSlot[]; 
}

export interface OrderSignalConfig {
  baseOrder: {
    indent: string[]; 
    volume: number;   
  };
  indentType: 'ORDER' | 'ENTRY';
  orders: SignalOrderLine[];
}

export interface OrderState {
  mode: GridMode;
  general: OrderGeneralConfig;
  simple: OrderSimpleConfig;
  signal: OrderSignalConfig;
}