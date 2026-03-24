// src/types/veles.ts

export interface VelesCondition {
  type: 'INDICATOR';
  indicator: string;
  interval: string;
  basic: boolean;
  value: string | number | null;
  operation: 'GREATER' | 'LESS' | null;
  closed: boolean;
  reverse: boolean;
}

export interface VelesPriceCondition {
  type: 'PRICE';
  value: number;
  operation: 'GREATER' | 'LESS';
}

export type VelesEntryCondition = VelesCondition | VelesPriceCondition;

export interface VelesEntriesCountPayload {
  type: 'OPEN' | 'CLOSE';
  algorithm: 'LONG' | 'SHORT';
  exchange: string;
  symbol: string;
  conditions: VelesEntryCondition[];
}

export interface VelesEntriesCountResponse {
  count: number;
  entries?: string[];
}

export interface VelesOrder {
  indent: number;
  volume: number;
  conditions?: VelesCondition[];
}

export interface VelesConfigPayload {
  name: string;
  exchange: string;
  algorithm: 'LONG' | 'SHORT';
  symbol: string;
  symbols: string[];
  pullUp: number;
  portion: number;
  commissions: { maker: string; taker: string; };
  deposit: { amount: number; leverage: number; marginType: 'CROSS' | 'ISOLATED'; };
  conditions: VelesCondition[];
  settings: {
    type: 'SIGNAL' | 'SIMPLE' | 'CUSTOM';
    includePosition: boolean;
    indentType?: 'ORDER' | 'ENTRY';
    baseOrder?: { indent: number; volume: number; };
    indent?: number;
    overlap?: number;
    martingale?: number;
    logarithmicFactor?: number | null;
    priceStrategy?: string;
    orders?: any;
    volume?: number;
  };
  profit: {
    type: 'SINGLE' | 'MULTIPLE' | 'SIGNAL';
    currency: 'QUOTE';
    percent?: number;
    trailing?: null | any;
    orders?: { indent: number; volume: number }[];
    breakeven?: 'AVERAGE' | 'PROFIT' | null;
    checkPnl?: number | null;
    conditions?: VelesCondition[];
  };
  stopLoss?: {
    indent: number | null;
    termination: boolean;
    conditionalIndent: number | null;
    conditionalIndentType: 'AVERAGE' | 'LAST_GRID' | null;
    conditions?: VelesCondition[] | null;
  };
  public: boolean;
  from: string;
  to: string;
  useWicks: boolean;
}

export interface BacktestStatusResponse {
  success: boolean;
  data?: {
    status: 'CREATED' | 'PENDING' | 'STARTED' | 'FINISHED' | 'ERROR' | 'FAILED';
    progress?: number;
    error?: string;
  };
  error?: string;
}

export interface BacktestStats {
  from?: string;
  to?: string;
  netQuote: number;
  profitQuote: number;
  commissionQuote: number;
  netQuotePerDay?: number;
  totalDeals: number;
  profits?: number;
  losses?: number;
  breakevens?: number;
  mfePercent: number;
  maePercent: number;
  mfeAbsolute?: number;
  maeAbsolute?: number;
  avgDuration: number;
  maxDuration?: number;
}

export interface UserProfile {
  id: number;
  email: string;
  roles: string[];
}
