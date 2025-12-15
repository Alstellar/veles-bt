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
  portion: number; // <-- Добавили PORTION
  
  dateFrom: Date;
  dateTo: Date;

  makerFee: string;
  takerFee: string;

  isPublic: boolean;
  useWicks: boolean;
}

// --- 2. Настройки Ордеров (Order Settings) ---

// Режимы
export type GridMode = 'SIMPLE' | 'CUSTOM' | 'SIGNAL';

// Общие настройки для всех режимов ордеров (то, что лежит в корне, но относится к сетке)
export interface OrderGeneralConfig {
  pullUp: string[]; // <-- Вынесли сюда (массив)
}

// Конфиг для ПРОСТОГО режима
export interface OrderSimpleConfig {
  orders: string[];      
  martingale: string[];  
  indent: string[];      
  overlap: string[];     
  
  // Логика логарифма
  // В UI мы используем enabled, а при сборке JSON будем ставить "LINEAR"/"LOGARITHMIC"
  logarithmicEnabled: boolean; 
  logarithmicFactor: string[]; 
  
  includePosition: boolean; // Включать позицию в сделку
}

// Полный стейт для блока Ордеров
export interface OrderState {
  mode: GridMode;
  general: OrderGeneralConfig;
  simple: OrderSimpleConfig;
  // custom: ... (потом)
}