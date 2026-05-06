import type { BacktestResultItem } from '../types';
import type {
  VelesConfigPayload,
  BacktestStatusResponse,
  BacktestStats,
  UserProfile,
  VelesEntriesCountPayload,
  VelesEntriesCountResponse
} from '../types/veles';
import type { VelesHttpTrace } from '../types/velesTrace';
import { maskTraceHeaders } from '../types/velesTrace';
import { VELES_HOST_PATTERNS, getVelesOriginFromUrl } from '../config/velesDomains';

import {
  injectedRunTest,
  injectedCheckStatus,
  injectedGetStats,
  injectedGetProfile,
  injectedGetStatisticsPage,
  injectedCountEntries
} from './VelesInjections';

function stringifyVelesFailure(status: number | undefined, body: unknown, fallback: unknown): string {
  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  if (body !== undefined && body !== null) {
    try {
      const serialized = JSON.stringify(body);
      if (serialized && serialized !== '{}' && serialized !== 'null') return serialized;
    } catch {
      return String(body);
    }
  }
  if (Number.isFinite(status)) return `HTTP ${status}`;
  return 'Injection failed';
}

function prepareTrace(trace: VelesHttpTrace | undefined): VelesHttpTrace | undefined {
  if (!trace) return undefined;
  return {
    ...trace,
    request: {
      ...trace.request,
      headers: maskTraceHeaders(trace.request.headers)
    }
  };
}

function scriptErrorTrace(method: string, url: string, error: unknown, body?: unknown): VelesHttpTrace {
  const message = error instanceof Error ? error.message : String(error);
  return {
    method,
    url,
    request: body === undefined ? {} : { body },
    error: error instanceof Error
      ? { name: error.name, message: message || error.name, stack: error.stack }
      : { message },
    durationMs: 0
  };
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

  static async runTest(
    tabId: number,
    token: string,
    payload: VelesConfigPayload
  ): Promise<{ success: boolean; status: number; id?: number; error?: string; trace?: VelesHttpTrace }> {
    let result: chrome.scripting.InjectionResult<Awaited<ReturnType<typeof injectedRunTest>>>[];
    try {
      result = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectedRunTest,
        args: [payload, token]
      });
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        trace: scriptErrorTrace('POST', '/api/backtests/', error, payload)
      };
    }

    const res = result[0]?.result;
    if (res && res.success && res.body?.id) {
      return { success: true, status: res.status, id: res.body.id };
    }

    return {
      success: false,
      status: res?.status || 0,
      error: stringifyVelesFailure(res?.status, res?.body, res?.error),
      trace: prepareTrace(res?.trace as VelesHttpTrace | undefined)
    };
  }

  static async checkStatus(
    tabId: number,
    token: string,
    backtestId: number
  ): Promise<BacktestStatusResponse & { trace?: VelesHttpTrace }> {
    let result: chrome.scripting.InjectionResult<Awaited<ReturnType<typeof injectedCheckStatus>>>[];
    try {
      result = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectedCheckStatus,
        args: [backtestId, token]
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        trace: scriptErrorTrace('GET', `/api/backtests/${backtestId}`, error)
      };
    }
    const res = result[0]?.result;
    if (res?.success) {
      return res as BacktestStatusResponse;
    }
    return {
      ...(res || { success: false, error: 'Injection failed' }),
      error: stringifyVelesFailure(res?.status, res?.body, res?.error),
      trace: prepareTrace(res?.trace as VelesHttpTrace | undefined)
    };
  }

  static async getStats(
    tabId: number,
    backtestId: number
  ): Promise<{ success: boolean; stats?: BacktestStats; shareToken?: string; error?: string; trace?: VelesHttpTrace }> {
    let result: chrome.scripting.InjectionResult<Awaited<ReturnType<typeof injectedGetStats>>>[];
    try {
      result = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectedGetStats,
        args: [backtestId]
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        trace: scriptErrorTrace('GET', `/api/backtests/statistics/${backtestId}`, error)
      };
    }
    const res = result[0]?.result;
    if (res?.success) {
      return res;
    }
    return {
      ...(res || { success: false, error: 'Injection failed' }),
      error: stringifyVelesFailure(res?.status, res?.body, res?.error),
      trace: prepareTrace(res?.trace as VelesHttpTrace | undefined)
    };
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

  static async countEntries(
    tabId: number,
    token: string,
    payload: VelesEntriesCountPayload
  ): Promise<{ success: boolean; status: number; count?: number; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedCountEntries,
      args: [payload, token]
    });

    const res = result[0]?.result;
    const body = res?.body as VelesEntriesCountResponse | undefined;
    if (res?.success && typeof body?.count === 'number') {
      return { success: true, status: res.status, count: body.count };
    }

    const bodyError = typeof body === 'object' && body !== null ? JSON.stringify(body) : undefined;
    return {
      success: false,
      status: res?.status || 0,
      error: res?.error || bodyError || 'Failed to count entries'
    };
  }
}
