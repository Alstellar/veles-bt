// src/types.ts

// --- 1. Статические настройки (База) ---

// Полный список бирж (актуализирован по ТЗ)
export type ExchangeType = 
  | 'BINANCE'           // API Veles использует "BINANCE" для спота
  | 'BINANCE_FUTURES'
  | 'BYBIT_SPOT'
  | 'BYBIT_FUTURES'
  | 'OKX_SPOT'
  | 'OKX_FUTURES'
  | 'BINGX_FUTURES'
  | 'BITGET_FUTURES'
  | 'GATE_IO_SPOT'
  | 'GATE_IO_FUTURES'
  | 'HUOBI_SPOT';

export type AlgoType = 'LONG' | 'SHORT';
export type MarginType = 'CROSS' | 'ISOLATED';

// Интерфейсы для ответов API Veles (для получения лимитов и дат)
export interface SymbolLimitation {
  exchange: ExchangeType;
  type: string; // "FUTURES" | "SPOT"
  symbol: string; // "BTC/USDT"
  externalId: string; // "BTCUSDT"
  pricePrecision: number;
  quantityPrecision: number;
  minQuantity: number;
  minNotional: number;
  priceStep: number;
  quantityStep: number;
  leverage?: number; // Может отсутствовать на споте
}

export interface SymbolAvailability {
  symbol: string; 
  availableFrom: string; // ISO Date
}

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

// Полный список индикаторов (сохранен без изменений)
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

// -- Конфиг для CUSTOM (Новый) --
export interface CustomOrderLine {
  id: string;
  indent: string[]; // Отступ всегда от входа, массив строк для Grid Search
  volume: number;
}

export interface OrderCustomConfig {
  baseOrder: {
    indent: string[];
    volume: number;
  };
  orders: CustomOrderLine[];
}

export interface OrderState {
  mode: GridMode;
  general: OrderGeneralConfig;
  simple: OrderSimpleConfig;
  custom: OrderCustomConfig;
  signal: OrderSignalConfig;
}

// --- 6. Entry Settings (Условия входа) ---

export interface EntryConfig {
  filterSlots: FilterSlot[];
}

// --- 7. Helpers ---

// Функция для определения, является ли биржа спотовой
export const isSpot = (exchange: ExchangeType): boolean => {
  return exchange === 'BINANCE' || exchange.includes('_SPOT');
};