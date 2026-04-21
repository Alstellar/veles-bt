import type { VelesConfigPayload, BacktestStats } from './types/veles';

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

export interface ExchangeInfo {
  name: string;
  key: ExchangeType;
  type: 'SPOT' | 'FUTURES';
  fastApi?: boolean;
  includePosition?: boolean;
  trailingStop?: number;
  asset?: string;
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
  | 'PRICE_CHANGE_PERIOD'
  | 'RSI' | 'RSI_LEVELS' | 'RVI' | 'RVI_LEVELS' | 'CCI' | 'CCI_LEVELS'
  | 'MFI' | 'MFI_LEVELS' | 'MFI_CROSS_50' | 'ADX' | 'ATR' | 'ATR_PERCENT'
  | 'CMO' | 'CMO_LEVELS' | 'ROC' | 'ROC_CROSS_ZERO'
  | 'WILLIAMS_R' | 'WILLIAMS_R_LEVELS' | 'AO_CROSS_ZERO'
  | 'CHAIKIN_OSCILLATOR' | 'BALANCE_OF_POWER'
  | 'MACD_TREND' | 'MACD_CROSS_ZERO' | 'MACD_CROSS_SIGNAL' | 'MACD_HISTOGRAM_TREND'
  | 'FAST_STOCHASTIC_LEVELS' | 'FAST_STOCHASTIC_CROSS'
  | 'SLOW_STOCHASTIC_LEVELS' | 'SLOW_STOCHASTIC_CROSS'
  | 'SMA' | 'SMA_CROSS' | 'EMA' | 'EMA_CROSS'
  | 'EMA_50_CROSS_EMA_100'
  | 'BOLLINGER_BANDS' | 'KELTNER_CHANNEL' | 'DONCHIAN_CHANNEL'
  | 'MEAN_REVERSION_CHANNEL_WEAK' | 'MEAN_REVERSION_CHANNEL_MEDIUM' | 'MEAN_REVERSION_CHANNEL_STRONG'
  | 'TURTLE_ZONE' | 'PARABOLIC_SAR' | 'PARABOLIC_SAR_TREND' | 'SUPERTREND' | 'SUPERTREND_TREND'
  | 'HMA' | 'HMA_VOLUME' | 'THREE_CANDLES' | 'SRGART_DIVERGENCE'
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
  pullUp: string;
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

// --- 7. Exit Settings (Настройки выхода) ---

export type ProfitMode = 'SINGLE' | 'MULTIPLE' | 'SIGNAL';
export type BreakevenType = 'AVERAGE' | 'PROFIT' | null;

// -- Конфиг для SIMPLE (Простой) --
export interface ProfitSingleConfig {
  // Массив строк для Grid Search (например ['0.5', '1.0', '1.5'])
  percents: string[]; 
}

// -- Конфиг для CUSTOM (Свой) --
export interface ProfitCustomOrderLine {
  id: string;
  indent: string[]; // Массив строк для Grid Search (вариации отступа)
  volume: number;   // Фиксированный объем (сумма должна быть 100%)
}

export interface ProfitMultipleConfig {
  orders: ProfitCustomOrderLine[];
  breakeven: BreakevenType;
}

// -- Конфиг для SIGNAL (Тейк-профит) --
export interface ProfitSignalConfig {
  checkPnl: string[]; // Массив P&L для перебора (['null', '0.5', '1.0'])
  filterSlots: FilterSlot[]; // Группы индикаторов (для Grid Search)
}


// -- Конфиг для STOP LOSS (Объединенный) --
export interface StopLossConfig {
  // 1. Обычный Стоп-лосс
  enabledSimple: boolean;
  indent: string[]; // Значения из UI (например '-0.5', '-1.0'). В JSON пойдут как 0.5, 1.0

  // 2. Стоп-лосс по сигналу
  enabledSignal: boolean;
  conditionalIndent: string[]; // Значения из UI ('-0.5', '0.2'). В JSON знаки инвертируются.
  conditionalIndentType: 'AVERAGE' | 'LAST_GRID';
  
  // Индикаторы для сигнала (одна группа/слот)
  filterSlots: FilterSlot[];
}

// --- 8. Data Storage & History (Новое) ---

export interface BatchInfo {
  id: string;
  timestamp: number;
  namePrefix: string;
  symbol: string;
  exchange: ExchangeType;
  totalTests: number;
  velesIds: number[];
  apiVersion?: 'v1' | 'v2';
  runStatus?: BatchRunStatus;
  completedTests?: number;
  stopReason?: BatchStopReason;
  lastError?: string;
  updatedAt?: number;
  mode?: 'CONFIGURATOR' | 'BACKTESTS';
  resumeSource?: BatchResumeSource;
  backtestsSource?: BacktestsResumeSource;
}

export type BatchRunStatus = 'RUN' | 'STOP' | 'DONE';
export type BatchStopReason =
  | 'manual_stop'
  | 'no_tab'
  | 'no_token'
  | 'unauthorized'
  | 'lock_busy'
  | 'lock_lost'
  | 'runtime_error';

export interface QueueRuntimeItem {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number;
  sourceTemplateUrl?: string;
}

export interface BatchRuntimeActiveRun {
  index: number;
  velesId: number;
  launchedAt: number;
  launchAttemptStartedAt: number;
}

export interface BatchResumeSource {
  staticConfig: Omit<StaticConfig, 'dateFrom' | 'dateTo'> & {
    dateFrom: string;
    dateTo: string;
  };
  entryConfig: EntryConfig;
  orderState: OrderState;
  exitConfig: ExitConfig;
}

export interface BacktestsResumeTemplate {
  url: string;
  code: string;
  name: string;
  config: VelesConfigPayload;
}

export interface BacktestsResumeSource {
  version: 1 | 2;
  exchange: ExchangeType;
  dateFrom: string;
  dateTo: string;
  periodMode?: 'RANGE' | 'WHOLE_PERIOD';
  deposit?: number;
  leverage?: number;
  nameTemplate: string;
  makerFee?: string;
  takerFee?: string;
  isPublic?: boolean;
  useWicks?: boolean;
  linksText: string;
  assetsInputText: string;
  assetsSource: 'manual' | 'exchange_filtered';
  symbols: string[];
  symbolAvailableFrom?: Record<string, string | null>;
  symbolMaxLeverage: Record<string, number | null>;
  templates: BacktestsResumeTemplate[];
}

export interface BatchRuntimeState {
  batchId: string;
  version?: 1 | 2;
  apiVersion?: 'v1' | 'v2';
  v2IntervalSeconds?: number;
  // Legacy field: old versions persisted full queue payloads with config payloads here.
  items?: QueueRuntimeItem[];
  nextIndex: number;
  total: number;
  status: BatchRunStatus;
  fingerprint?: string;
  activeRuns?: BatchRuntimeActiveRun[];
  lastLaunchAt?: number;
  updatedAt: number;
}

export interface StorageData {
  batches: Record<string, BatchInfo>;
  templates?: Record<string, Template>;
  runtimes?: Record<string, BatchRuntimeState>;
  v2IntervalSeconds?: number;
}

// -- Результат выполнения теста --
export interface TestResult {
  id: string;              // Внутренний ID для React key
  backtestId?: number;     // ID теста в Veles
  config: VelesConfigPayload; // Снапшот конфига, с которым запускали
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  stats?: BacktestStats;   // Результаты (Profit, ROI, Deals...)
  shareToken?: string;     // Токен для публичной ссылки
  error?: string;          // Текст ошибки
  duration?: string;       // Время выполнения (строка, например "45s")
  timestamp: number;       // Время запуска
  
  // Новое поле: принадлежность к группе
  batchId?: string; 
}


// -- Общий стейт выхода --
export interface ExitConfig {
  profitMode: ProfitMode;
  profitSingle: ProfitSingleConfig;
  profitMultiple: ProfitMultipleConfig;
  profitSignal: ProfitSignalConfig;
  stopLoss: StopLossConfig;
}

// --- 9. Helpers ---

// Функция для определения, является ли биржа спотовой
export const isSpot = (exchange: ExchangeType): boolean => {
  return exchange === 'BINANCE' || exchange.includes('_SPOT');
};


// --- ШАБЛОНЫ (TEMPLATES) ---
export interface Template {
  id: string;        // Уникальный ID (uuid)
  name: string;      // Название шаблона (вводит юзер)
  timestamp: number; // Дата создания
  description?: string; // Опциональное описание

  // Версия API (по умолчанию v1 для обратной совместимости)
  apiVersion?: 'v1' | 'v2';

  // Полный слепок конфигурации
  config: {
    staticConfig: StaticConfig;
    entryConfig: EntryConfig;
    orderState: OrderState;
    exitConfig: ExitConfig;
  };
}

// --- БАЗА ДАННЫХ И СИНХРОНИЗАЦИЯ (IndexedDB) ---

// Результат одиночного теста (как он приходит от Veles API /statistics)
// Содержит все поля, необходимые для построения таблицы как у конкурента
export interface BacktestResultItem {
  id: number;
  name: string;
  date: string;       // ISO String "2025-12-25T..." (дата создания)
  from: string;       // ISO String (дата начала периода теста)
  to: string;         // ISO String (дата конца периода теста)
  symbol: string;
  algorithm: 'LONG' | 'SHORT';
  exchange: string;

  // Прибыль
  profitQuote: number | null; // Total Profit USDT
  profitBase: number | null;  // Profit in coin (для спота)
  netQuote: number | null;    // Чистый профит (Net)
  netQuotePerDay: number | null; // Net / день
  
  // Просадки и Пики (MAE / MFE)
  maePercent: number | null;  // МПУ %
  maeAbsolute: number | null; // МПУ $
  mfePercent: number | null;  // МПП %
  mfeAbsolute: number | null; // МПП $

  // Сделки
  totalDeals: number | null;
  profits: number | null;
  losses: number | null;
  breakevens: number | null;
  
  // Время
  duration: number | null;    // Диапазон теста в секундах (не время выполнения!)
  maxDuration: number | null; // Макс время в сделке (сек)
  avgDuration: number | null; // Среднее время в сделке (сек)
  sourceTemplateUrl?: string;
}


// --- 10. AI ANALYTICS (Новый модуль) ---

export interface MarketIndicator {
  price: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  adx: number;
  rsi: number;
  atr_pct: number;
  rvol: number;
  dist_ema200: number;
  bbw: number;
}

export interface AnalysisResult {
  [timeframe: string]: MarketIndicator; // "15m", "1h", "4h"
}

export interface AnalyzerResponse {
  count: number;
  results: {
    [symbol: string]: AnalysisResult;
  };
}

// Интерфейс данных, которые мы парсим со страницы Veles
export interface VelesPageContext {
  symbol: string;      // "BTC/USDT"
  exchange: string;    // "Binance Futures"
  algo: AlgoType;      // "LONG" | "SHORT"
  isBotPage: boolean;  // true, если мы внутри настроек бота
}
