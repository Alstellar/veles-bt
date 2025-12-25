/* eslint-disable @typescript-eslint/no-explicit-any */

// --- 1. ТИПЫ ДЛЯ VELES API (Payloads) ---

export interface VelesCondition {
  type: 'INDICATOR';
  indicator: string; // 'RSI', 'BOLLINGER_BANDS' etc
  interval: string;  // 'FIVE_MINUTES'
  basic: boolean;
  value: string | number | null;
  operation: 'GREATER' | 'LESS' | null;
  closed: boolean;
  reverse: boolean;
}

export interface VelesOrder {
  indent: number;
  volume: number;
  conditions?: VelesCondition[];
}

// Конфигурация для запуска теста (то, что мы отправляем)
export interface VelesConfigPayload {
  name: string;
  exchange: string; // 'BINANCE_FUTURES'
  algorithm: 'LONG' | 'SHORT';
  
  symbol: string;  // Основная пара (строка)
  symbols: string[]; // Массив пар (требование API)

  pullUp: number;
  portion: number;

  commissions: {
    maker: string;
    taker: string;
  };
  deposit: {
    amount: number;
    leverage: number;
    marginType: 'CROSS' | 'ISOLATED';
  };
  
  // Условия входа
  conditions: VelesCondition[]; 
  
  // Настройки сетки (Универсальный объект под разные режимы)
  settings: {
    type: 'SIGNAL' | 'SIMPLE' | 'CUSTOM'; // HFT удален, CUSTOM добавлен
    
    // Общее
    includePosition: boolean;

    // --- Специфично для SIGNAL ---
    indentType?: 'ORDER' | 'ENTRY';
    baseOrder?: {
      indent: number;
      volume: number;
    };

    // --- Специфично для SIMPLE (плоские настройки) ---
    indent?: number; 
    overlap?: number;
    martingale?: number;
    logarithmicFactor?: number | null;
    priceStrategy?: string;

    // --- Универсальное поле orders ---
    // В SIMPLE: это число (количество ордеров)
    // В SIGNAL/CUSTOM: это массив объектов ордеров
    orders?: any; 
    
    // --- Специфично для CUSTOM ---
    // (обычно использует структуру SIGNAL, но type='CUSTOM' и все ордера в массиве orders)
    volume?: number; // Иногда встречается как остаточный артефакт
  };

  // Выход: Тейк-профит
  profit: {
    type: 'SINGLE' | 'MULTIPLE' | 'SIGNAL';
    currency: 'QUOTE';
    // Для SINGLE
    percent?: number;
    trailing?: null | any;
    // Для MULTIPLE
    orders?: { indent: number; volume: number }[];
    breakeven?: 'AVERAGE' | 'PROFIT' | null;
    // Для SIGNAL
    checkPnl?: number | null;
    conditions?: VelesCondition[];
  };

  // Выход: Стоп-лосс
  stopLoss?: {
    indent: number | null; // Обычный стоп (положительное число в JSON!)
    termination: boolean;
    conditionalIndent: number | null; // Стоп по сигналу (инвертированный знак!)
    conditionalIndentType: 'AVERAGE' | 'LAST_GRID' | null;
    conditions?: VelesCondition[] | null;
  };

  public: boolean;
  
  from: string; // ISO Date
  to: string;   // ISO Date
  useWicks: boolean;
}

// Интерфейс ответа статуса
export interface BacktestStatusResponse {
  success: boolean;
  data?: {
    status: 'CREATED' | 'PENDING' | 'STARTED' | 'FINISHED' | 'ERROR' | 'FAILED';
    progress?: number;
    error?: string;
  };
  error?: string;
}

// Интерфейс результата статистики
export interface BacktestStats {
  netQuote: number;      // Чистый профит
  profitQuote: number;   // Грязный профит
  commissionQuote: number;
  totalDeals: number;
  mfePercent: number;    // MPP
  maePercent: number;    // MPU (Просадка)
  avgDuration: number;   // Среднее время сделки (сек)
}

// --- 2. ИНЪЕЦИРУЕМЫЕ ФУНКЦИИ (Pure Functions) ---

async function injectedRunTest(payload: any, token: string) {
  try {
    const response = await fetch("https://veles.finance/api/backtests/", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Accept": "application/json", 
        "x-csrf-token": token, 
        "X-Requested-With": "XMLHttpRequest" 
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    
    // Возвращаем статус код для обработки 429/412
    return { success: response.ok, status: response.status, body: json };
  } catch (err: any) {
    return { success: false, status: 0, error: err.message };
  }
}

async function injectedCheckStatus(id: number, token: string) {
  try {
    const response = await fetch(`https://veles.finance/api/backtests/${id}`, {
      method: "GET",
      headers: { "Accept": "application/json", "x-csrf-token": token, "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function injectedGetStats(id: number, token: string) {
  try {
    // 1. Share
    const shareRes = await fetch(`https://veles.finance/api/backtests/${id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "x-csrf-token": token, "X-Requested-With": "XMLHttpRequest" }
    });
    const shareData = await shareRes.json();
    if (!shareRes.ok) return { success: false, error: "Share Error", debug: shareData };

    const shareToken = shareData.token || shareData.slug || shareData.code || shareData.id;
    if (!shareToken) return { success: false, error: "No Share Token", debug: shareData };

    // 2. Stats
    const statsRes = await fetch(`https://veles.finance/api/backtests/statistics/${shareToken}`, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    if (!statsRes.ok) return { success: false, error: "Stats Error" };

    return { success: true, stats: await statsRes.json(), shareToken };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// --- 3. КЛАСС СЕРВИСА (Bridge) ---

export class VelesService {
  
  static async findTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ url: "*://veles.finance/*" });
    return tabs.length > 0 ? tabs[0] : null;
  }

  static async getToken(tabId: number): Promise<string | null> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.querySelector('meta[name="_csrf"]')?.getAttribute('content')
    });
    return result[0]?.result || null;
  }

  // Обновленный метод runTest: возвращает статус
  static async runTest(tabId: number, token: string, payload: VelesConfigPayload): Promise<{ success: boolean, status: number, id?: number, error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedRunTest,
      args: [payload, token]
    });
    
    const res = result[0]?.result;
    
    // Если есть ID, считаем успехом
    if (res && res.success && res.body?.id) {
      return { success: true, status: res.status, id: res.body.id };
    }
    
    // Возвращаем ошибку с кодом статуса
    return { 
        success: false, 
        status: res?.status || 0,
        error: res?.error || JSON.stringify(res?.body) 
    };
  }

  static async checkStatus(tabId: number, token: string, backtestId: number): Promise<BacktestStatusResponse> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedCheckStatus,
      args: [backtestId, token]
    });
    return result[0]?.result || { success: false, error: "Injection failed" };
  }

  static async getStats(tabId: number, token: string, backtestId: number): Promise<{ success: boolean, stats?: BacktestStats, shareToken?: string, error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetStats,
      args: [backtestId, token]
    });
    return result[0]?.result || { success: false, error: "Injection failed" };
  }
}