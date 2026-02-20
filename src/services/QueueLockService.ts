interface QueueLockRecord {
  ownerId: string;
  batchId: string;
  updatedAt: number;
}

const LOCK_KEY = 'vh_queue_lock_v1';
const STOP_KEY_PREFIX = 'vh_queue_stop_v1_';
const LOCK_TTL_MS = 5 * 60 * 1000;

export class QueueLockService {
  private static stopKey(batchId: string): string {
    return `${STOP_KEY_PREFIX}${batchId}`;
  }

  private static async sessionGet<T>(key: string): Promise<T | undefined> {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      return new Promise((resolve) => {
        chrome.storage.session.get([key], (result) => resolve(result[key] as T | undefined));
      });
    }

    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private static async sessionSet<T>(key: string, value: T): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      return new Promise((resolve) => {
        chrome.storage.session.set({ [key]: value }, () => resolve());
      });
    }

    sessionStorage.setItem(key, JSON.stringify(value));
  }

  private static async sessionRemove(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      return new Promise((resolve) => {
        chrome.storage.session.remove(key, () => resolve());
      });
    }

    sessionStorage.removeItem(key);
  }

  static async getLock(): Promise<QueueLockRecord | null> {
    const lock = (await this.sessionGet<QueueLockRecord>(LOCK_KEY)) ?? null;
    if (!lock) return null;

    const isExpired = Date.now() - lock.updatedAt > LOCK_TTL_MS;
    if (isExpired) {
      await this.sessionRemove(LOCK_KEY);
      return null;
    }

    return lock;
  }

  static async acquire(ownerId: string, batchId: string): Promise<boolean> {
    const lock = await this.getLock();
    if (lock && lock.ownerId !== ownerId) {
      return false;
    }

    await this.sessionSet<QueueLockRecord>(LOCK_KEY, {
      ownerId,
      batchId,
      updatedAt: Date.now()
    });

    return true;
  }

  static async refresh(ownerId: string): Promise<void> {
    const lock = await this.getLock();
    if (!lock || lock.ownerId !== ownerId) return;

    await this.sessionSet<QueueLockRecord>(LOCK_KEY, {
      ...lock,
      updatedAt: Date.now()
    });
  }

  static async forceAcquire(ownerId: string, batchId: string): Promise<void> {
    await this.sessionSet<QueueLockRecord>(LOCK_KEY, {
      ownerId,
      batchId,
      updatedAt: Date.now()
    });
  }

  static async release(ownerId: string): Promise<void> {
    const lock = await this.getLock();
    if (!lock || lock.ownerId !== ownerId) return;
    await this.sessionRemove(LOCK_KEY);
  }

  static async forceClear(): Promise<void> {
    await this.sessionRemove(LOCK_KEY);
  }

  static async requestStop(batchId: string): Promise<void> {
    await this.sessionSet<boolean>(this.stopKey(batchId), true);
  }

  static async isStopRequested(batchId: string): Promise<boolean> {
    return (await this.sessionGet<boolean>(this.stopKey(batchId))) === true;
  }

  static async clearStopRequest(batchId: string): Promise<void> {
    await this.sessionRemove(this.stopKey(batchId));
  }
}
