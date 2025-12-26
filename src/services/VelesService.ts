/* eslint-disable @typescript-eslint/no-explicit-any */

import type { BacktestResultItem } from '../types';

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
  
  symbol: string;   // Основная пара (строка)
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
    type: 'SIGNAL' | 'SIMPLE' | 'CUSTOM'; 
    
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
    orders?: any; 
    
    // --- Специфично для CUSTOM ---
    volume?: number; 
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
    indent: number | null; 
    termination: boolean;
    conditionalIndent: number | null; 
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
// ОБНОВЛЕНО: Добавлены недостающие поля для парсинга
export interface BacktestStats {
  netQuote: number;      // Чистый профит
  profitQuote: number;   // Грязный профит
  commissionQuote: number;
  netQuotePerDay?: number; // <-- Добавили (Эфф. в день)

  // Сделки
  totalDeals: number;
  profits?: number;       // <-- Добавили
  losses?: number;        // <-- Добавили
  breakevens?: number;    // <-- Добавили

  // Просадки и пики
  mfePercent: number;    // MPP (%)
  maePercent: number;    // MPU (%)
  mfeAbsolute?: number;   // <-- Добавили (USDT)
  maeAbsolute?: number;   // <-- Добавили (USDT)

  // Время
  avgDuration: number;   // Среднее время сделки (сек)
  maxDuration?: number;   // <-- Добавили
}

// Интерфейс профиля пользователя
export interface UserProfile {
  id: number;
  email: string;
  roles: string[];
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

// ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ ПОЛУЧЕНИЯ СТАТИСТИКИ (Убран token из аргументов)
async function injectedGetStats(id: number) {
  try {
    // Делаем прямой запрос к статистике по ID теста
    const statsRes = await fetch(`https://veles.finance/api/backtests/statistics/${id}`, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });

    if (!statsRes.ok) return { success: false, error: "Stats Error " + statsRes.status };

    const statsData = await statsRes.json();
    
    const shareToken = statsData.slug || statsData.code || null;

    return { success: true, stats: statsData, shareToken };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function injectedGetProfile() {
  try {
    const response = await fetch("https://veles.finance/api/me", {
      method: "GET",
      headers: { 
        "Accept": "application/json", 
        "X-Requested-With": "XMLHttpRequest" 
      }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// Инъекция для получения страницы статистики (BULK LOAD)
async function injectedGetStatisticsPage(page: number, size: number) {
  try {
    const url = `https://veles.finance/api/backtests/statistics?page=${page}&size=${size}&sort=date,desc`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
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

  // !!! ИСПРАВЛЕНИЕ ЗДЕСЬ !!!
  // Убрали token из аргументов метода
  static async getStats(tabId: number, backtestId: number): Promise<{ success: boolean, stats?: BacktestStats, shareToken?: string, error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetStats,
      // Убрали token из args
      args: [backtestId] 
    });
    return result[0]?.result || { success: false, error: "Injection failed" };
  }

  static async getProfile(tabId: number): Promise<{ success: boolean, data?: UserProfile, error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetProfile,
    });
    return result[0]?.result || { success: false, error: "Injection failed" };
  }

  // Обертка для получения страницы статистики (BULK)
  static async fetchStatisticsPageWrapper(tabId: number, page: number, size: number): Promise<BacktestResultItem[]> {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectedGetStatisticsPage,
        args: [page, size]
      });

      const res = result[0]?.result;
      if (res && res.success && res.data && res.data.content) {
          return res.data.content as BacktestResultItem[];
      }
      return [];
  }
}