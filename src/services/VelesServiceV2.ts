/**
 * VelesServiceV2 - Service for new backtest engine API
 * Uses /api/backtests/v2/ for launching tests
 */

import type { VelesConfigPayloadV2, VelesStatusResponseV2, VelesStatsResponseV2 } from '../types/velesV2';
import { VELES_HOST_PATTERNS, getVelesOriginFromUrl } from '../config/velesDomains';
import { VelesService } from './VelesService';

import {
  injectedRunTestV2,
  injectedCheckStatusV2,
  injectedGetStatsV2
} from './VelesInjectionsV2';

export class VelesServiceV2 {
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
    return VelesService.getToken(tabId);
  }

  static async runTest(
    tabId: number,
    token: string,
    payload: VelesConfigPayloadV2
  ): Promise<{ success: boolean; status: number; id?: number; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedRunTestV2,
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

  static async checkStatus(tabId: number, token: string, backtestId: number): Promise<{
    success: boolean;
    data?: VelesStatusResponseV2;
    error?: string;
  }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedCheckStatusV2,
      args: [backtestId, token]
    });

    const res = result[0]?.result;
    if (res?.success && res.data) {
      return { success: true, data: res.data };
    }
    const err = res?.error;
    return { success: false, error: typeof err === 'string' ? err : 'Injection failed' };
  }

  static async getStats(
    tabId: number,
    backtestId: number
  ): Promise<{ success: boolean; stats?: VelesStatsResponseV2; shareToken?: string; error?: string }> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedGetStatsV2,
      args: [backtestId]
    });

    const res = result[0]?.result;
    if (res?.success && res.stats) {
      return {
        success: true,
        stats: res.stats as VelesStatsResponseV2,
        shareToken: res.shareToken as string | undefined
      };
    }
    return { success: false, error: (res?.error as string) || 'Injection failed' };
  }

  static async isTabAliveWithValidToken(tabId: number): Promise<boolean> {
    const token = await this.getToken(tabId);
    return token !== null;
  }
}