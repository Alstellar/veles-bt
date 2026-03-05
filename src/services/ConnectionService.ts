import { VelesService } from './VelesService';
import type { UserProfile } from '../types/veles';
import { VELES_DEFAULT_ORIGIN } from '../config/velesDomains';

export type ConnectionFailureReason = 'no_tab' | 'no_token' | 'unauthorized' | 'unknown';

export interface ActiveConnection {
  tabId: number;
  token: string;
  origin: string;
  user: UserProfile;
  checkedAt: number;
}

export type ConnectionResult =
  | { success: true; connection: ActiveConnection; fromCache: boolean }
  | { success: false; reason: ConnectionFailureReason };

const DEFAULT_TTL_MS = 3 * 60 * 1000;

export class ConnectionService {
  private static cache: ActiveConnection | null = null;

  static invalidate(): void {
    this.cache = null;
  }

  static async getConnection(options?: { force?: boolean; ttlMs?: number }): Promise<ConnectionResult> {
    const force = options?.force ?? false;
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

    if (!force && this.cache) {
      const isFresh = Date.now() - this.cache.checkedAt < ttlMs;
      if (isFresh) {
        const alive = await VelesService.isTabAlive(this.cache.tabId);
        if (alive) {
          return { success: true, connection: this.cache, fromCache: true };
        }
      }
    }

    const tabs = await VelesService.findTabs();
    if (tabs.length === 0) {
      this.cache = null;
      return { success: false, reason: 'no_tab' };
    }

    let hasTokenCandidate = false;

    for (const tab of tabs) {
      if (!tab.id) continue;

      const token = await VelesService.getToken(tab.id);
      if (!token) continue;
      hasTokenCandidate = true;

      const profile = await VelesService.getProfile(tab.id, token);
      if (!profile.success || !profile.data) {
        continue;
      }

      const connection: ActiveConnection = {
        tabId: tab.id,
        token,
        origin: VelesService.extractOriginFromTab(tab) ?? VELES_DEFAULT_ORIGIN,
        user: profile.data,
        checkedAt: Date.now()
      };
      this.cache = connection;
      return { success: true, connection, fromCache: false };
    }

    this.cache = null;
    if (hasTokenCandidate) {
      return { success: false, reason: 'unauthorized' };
    }

    return { success: false, reason: 'no_token' };
  }

  static reasonToMessage(reason: ConnectionFailureReason): string {
    if (reason === 'no_tab') return 'Вкладка Veles (veles.finance) не найдена';
    if (reason === 'no_token') return 'Токен Veles не найден';
    if (reason === 'unauthorized') return 'Ошибка авторизации в Veles (401 Unauthorized)';
    return 'Подключение к Veles недоступно';
  }
}
