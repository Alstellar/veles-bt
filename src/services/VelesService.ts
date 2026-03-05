import type { BacktestResultItem } from '../types';
import type {
  VelesConfigPayload,
  BacktestStatusResponse,
  BacktestStats,
  UserProfile
} from '../types/veles';
import { VELES_HOST_PATTERNS, getVelesOriginFromUrl } from '../config/velesDomains';

import {
  injectedRunTest,
  injectedValidateSymbols,
  injectedGetApiKeys,
  injectedCheckStatus,
  injectedGetStats,
  injectedGetProfile,
  injectedGetStatisticsPage
} from './VelesInjections';

interface ValidateSymbolsResult {
  success: boolean;
  status: number;
  successful: string[];
  failed: string[];
  body?: unknown;
  error?: string;
}

interface ApiKeysResult {
  success: boolean;
  status: number;
  items: Array<{ id: number; exchange: string }>;
  body?: unknown;
  error?: string;
}

export class VelesService {
  static async findTabs(): Promise<chrome.tabs.Tab[]> {
    return chrome.tabs.query({ url: [...VELES_HOST_PATTERNS] });
  }

  static async findTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await this.findTabs();
    return tabs.length > 0 ? tabs[0] : null;
  }

  static async findTabWithValidToken(): Promise<{ tab: chrome.tabs.Tab; token: string } | null> {
    const tabs = await this.findTabs();

    for (const tab of tabs) {
      if (!tab.id) continue;
      const token = await this.getToken(tab.id);
      if (token) {
        return { tab, token };
      }
    }

    return null;
  }

  static async isTabAlive(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  }

  static extractOriginFromTab(tab?: chrome.tabs.Tab | null): string | null {
    if (!tab) return null;
    const candidateUrl =
      tab.url ||
      ((tab as chrome.tabs.Tab & { pendingUrl?: string }).pendingUrl ?? null);
    return getVelesOriginFromUrl(candidateUrl);
  }

  static async getToken(tabId: number): Promise<string | null> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const meta = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="_csrf"]');
          return meta ? meta.getAttribute('content') : null;
        }
      });
      return result[0]?.result || null;
    } catch {
      return null;
    }
  }

  static async runTest(tabId: number, token: string, payload: VelesConfigPayload): Promise<{ success: boolean; status: number; id?: number; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedRunTest,
      args: [payload, token]
    });

    const res = result[0]?.result;
    if (res && res.success && res.body?.id) {
      return { success: true, status: res.status, id: res.body.id };
    }

    return {
      success: false,
      status: res?.status || 0,
      error: res?.error || JSON.stringify(res?.body)
    };
  }

  static async validateSymbols(tabId: number, token: string, payload: Record<string, unknown>): Promise<ValidateSymbolsResult> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedValidateSymbols,
      args: [payload, token]
    });

    const res = result[0]?.result as ValidateSymbolsResult | undefined;
    if (!res) {
      return { success: false, status: 0, successful: [], failed: [], error: 'Injection failed' };
    }

    return {
      success: Boolean(res.success),
      status: Number(res.status || 0),
      successful: Array.isArray(res.successful) ? res.successful : [],
      failed: Array.isArray(res.failed) ? res.failed : [],
      body: (res as unknown as { body?: unknown }).body,
      error: res.error
    };
  }

  static async getApiKeys(tabId: number, token: string): Promise<ApiKeysResult> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetApiKeys,
      args: [token]
    });

    const res = result[0]?.result as ApiKeysResult | undefined;
    if (!res) {
      return { success: false, status: 0, items: [], error: 'Injection failed' };
    }

    const items = Array.isArray(res.items)
      ? res.items
        .map((item) => ({
          id: Number(item?.id),
          exchange: typeof item?.exchange === 'string' ? item.exchange : ''
        }))
        .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.exchange.length > 0)
      : [];

    return {
      success: Boolean(res.success),
      status: Number(res.status || 0),
      items,
      body: (res as unknown as { body?: unknown }).body,
      error: res.error
    };
  }

  static async checkStatus(tabId: number, token: string, backtestId: number): Promise<BacktestStatusResponse> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedCheckStatus,
      args: [backtestId, token]
    });
    return result[0]?.result || { success: false, error: 'Injection failed' };
  }

  static async getStats(tabId: number, backtestId: number): Promise<{ success: boolean; stats?: BacktestStats; shareToken?: string; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetStats,
      args: [backtestId]
    });
    return result[0]?.result || { success: false, error: 'Injection failed' };
  }

  static async getProfile(tabId: number, token?: string): Promise<{ success: boolean; data?: UserProfile; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetProfile,
      args: [token ?? null]
    });
    return result[0]?.result || { success: false, error: 'Injection failed' };
  }

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
