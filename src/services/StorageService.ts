import type {
  StorageData,
  BatchInfo,
  Template,
  BatchRunStatus,
  BatchStopReason,
  BatchRuntimeState,
  BacktestVersion
} from '../types';

const STORAGE_KEY = 'veles_bt_storage_v1';
const DEFAULT_BACKTEST_VERSION: BacktestVersion = 'v1';
const DEFAULT_TEST_QUEUE = 5;

export class StorageService {
  private static writeQueue: Promise<void> = Promise.resolve();

  private static normalizeBatch(batch: BatchInfo): BatchInfo {
    const velesIds = Array.isArray(batch.velesIds) ? batch.velesIds : [];
    const completedTests = batch.completedTests ?? velesIds.length;
    const runStatus =
      batch.runStatus ??
      (batch.totalTests > 0 && completedTests >= batch.totalTests ? 'DONE' : 'STOP');

    const backtestVersion: BacktestVersion =
      batch.backtestVersion ??
      (batch.apiVersion === 'v2' ? 'v2' : 'v1');

    return {
      ...batch,
      backtestVersion,
      velesIds,
      completedTests,
      runStatus,
      updatedAt: batch.updatedAt ?? batch.timestamp
    };
  }

  private static normalizeTemplate(template: Template): Template {
    const backtestVersion: BacktestVersion =
      template.backtestVersion ??
      (template.apiVersion === 'v2' ? 'v2' : 'v1');

    return {
      ...template,
      backtestVersion
    };
  }

  private static normalizeRuntime(runtime: BatchRuntimeState): BatchRuntimeState {
    const backtestVersion: BacktestVersion =
      runtime.backtestVersion ??
      (runtime.apiVersion === 'v2' ? 'v2' : 'v1');

    return {
      ...runtime,
      backtestVersion
    };
  }

  private static normalizeData(data: StorageData | undefined): StorageData {
    const rawBatches = data?.batches ?? {};
    const batches: Record<string, BatchInfo> = {};

    Object.entries(rawBatches).forEach(([id, batch]) => {
      batches[id] = this.normalizeBatch(batch);
    });

    const rawTemplates = data?.templates ?? {};
    const templates: Record<string, Template> = {};
    Object.entries(rawTemplates).forEach(([id, template]) => {
      templates[id] = this.normalizeTemplate(template);
    });

    const rawRuntimes = data?.runtimes ?? {};
    const runtimes: Record<string, BatchRuntimeState> = {};
    Object.entries(rawRuntimes).forEach(([id, runtime]) => {
      runtimes[id] = this.normalizeRuntime(runtime);
    });

    const backtestVersion: BacktestVersion = data?.backtestVersion ?? DEFAULT_BACKTEST_VERSION;
    const testQueue = Math.max(1, data?.testQueue ?? DEFAULT_TEST_QUEUE);

    return {
      batches,
      templates,
      runtimes,
      v2IntervalSeconds: data?.v2IntervalSeconds,
      backtestVersion,
      testQueue
    };
  }

  private static async loadDataRaw(): Promise<StorageData> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            console.error('StorageService.loadDataRaw failed:', error.message);
            resolve(this.normalizeData(undefined));
            return;
          }
          resolve(this.normalizeData(result[STORAGE_KEY] as StorageData | undefined));
        });
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        resolve(this.normalizeData(undefined));
        return;
      }

      try {
        resolve(this.normalizeData(JSON.parse(raw) as StorageData));
      } catch {
        resolve(this.normalizeData(undefined));
      }
    });
  }

  private static async updateData(
    mutator: (data: StorageData) => void | boolean | Promise<void | boolean>
  ): Promise<void> {
    const task = async () => {
      const data = await this.loadDataRaw();
      const shouldSave = await mutator(data);
      if (shouldSave !== false) {
        await this.saveData(data);
      }
    };

    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  static async loadData(): Promise<StorageData> {
    await this.writeQueue;
    return this.loadDataRaw();
  }

  private static async saveData(data: StorageData): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve();
        });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        resolve();
      }
    });
  }

  static async saveBatch(batch: BatchInfo): Promise<void> {
    await this.updateData((data) => {
      const normalized = this.normalizeBatch({
        ...batch,
        runStatus: batch.runStatus ?? 'STOP',
        completedTests: batch.completedTests ?? 0,
        updatedAt: Date.now()
      });

      data.batches[batch.id] = normalized;
    });
  }

  static async getBatchById(batchId: string): Promise<BatchInfo | null> {
    const data = await this.loadData();
    return data.batches[batchId] ?? null;
  }

  static async updateBatch(
    batchId: string,
    patch: Partial<Omit<BatchInfo, 'id' | 'timestamp'>>
  ): Promise<void> {
    await this.updateData((data) => {
      const existing = data.batches[batchId];
      if (!existing) return false;

      data.batches[batchId] = this.normalizeBatch({
        ...existing,
        ...patch,
        updatedAt: Date.now()
      });
      return true;
    });
  }

  static async updateBatchRunState(
    batchId: string,
    runStatus: BatchRunStatus,
    extras?: {
      completedTests?: number;
      stopReason?: BatchStopReason;
      lastError?: string;
    }
  ): Promise<void> {
    await this.updateBatch(batchId, {
      runStatus,
      completedTests: extras?.completedTests,
      stopReason: extras?.stopReason,
      lastError: extras?.lastError
    });
  }

  static async addTestIdToBatch(batchId: string, velesId: number): Promise<void> {
    await this.updateData((data) => {
      const batch = data.batches[batchId];
      if (!batch) return false;

      if (!batch.velesIds.includes(velesId)) {
        batch.velesIds.push(velesId);
      }

      batch.completedTests = Math.max(batch.completedTests ?? 0, batch.velesIds.length);
      batch.updatedAt = Date.now();
      return true;
    });
  }

  static async getBatches(): Promise<BatchInfo[]> {
    const data = await this.loadData();
    return Object.values(data.batches).sort((a, b) => b.timestamp - a.timestamp);
  }

  static async getStoppedBatches(): Promise<BatchInfo[]> {
    const batches = await this.getBatches();
    return batches.filter((batch) => batch.runStatus === 'STOP');
  }

  static async saveBatchRuntime(runtime: BatchRuntimeState): Promise<void> {
    await this.updateData((data) => {
      data.runtimes = data.runtimes ?? {};
      data.runtimes[runtime.batchId] = this.normalizeRuntime({
        ...runtime,
        updatedAt: Date.now()
      });
    });
  }

  static async getBatchRuntime(batchId: string): Promise<BatchRuntimeState | null> {
    const data = await this.loadData();
    return data.runtimes?.[batchId] ?? null;
  }

  static async removeBatchRuntime(batchId: string): Promise<void> {
    await this.updateData((data) => {
      if (!data.runtimes?.[batchId]) return false;
      delete data.runtimes[batchId];
      return true;
    });
  }

  static async clearHistory(): Promise<void> {
    await this.updateData((data) => {
      data.batches = {};
      data.runtimes = {};
    });
  }

  static async removeBatch(batchId: string): Promise<void> {
    await this.updateData((data) => {
      let changed = false;

      if (data.batches[batchId]) {
        delete data.batches[batchId];
        changed = true;
      }

      if (data.runtimes?.[batchId]) {
        delete data.runtimes[batchId];
        changed = true;
      }

      return changed;
    });
  }

  static async getEarliestTestId(): Promise<number | null> {
    const batches = await this.getBatches();
    if (batches.length === 0) return null;

    let minId: number | null = null;

    batches.forEach((batch) => {
      if (!batch.velesIds || batch.velesIds.length === 0) return;
      const batchMin = Math.min(...batch.velesIds);
      if (minId === null || batchMin < minId) {
        minId = batchMin;
      }
    });

    return minId;
  }

  static async saveTemplate(template: Template): Promise<void> {
    await this.updateData((data) => {
      data.templates = data.templates ?? {};
      data.templates[template.id] = this.normalizeTemplate(template);
    });
  }

  static async getTemplates(): Promise<Template[]> {
    const data = await this.loadData();
    return Object.values(data.templates ?? {}).sort((a, b) => b.timestamp - a.timestamp);
  }

  static async deleteTemplate(id: string): Promise<void> {
    await this.updateData((data) => {
      if (!data.templates?.[id]) return false;
      delete data.templates[id];
      return true;
    });
  }

  static async getV2IntervalSeconds(): Promise<number> {
    const data = await this.loadData();
    return data.v2IntervalSeconds ?? 5;
  }

  static async setV2IntervalSeconds(seconds: number): Promise<void> {
    await this.updateData((data) => {
      data.v2IntervalSeconds = Math.max(1, seconds);
    });
  }

  static async getBacktestVersion(): Promise<BacktestVersion> {
    const data = await this.loadData();
    return data.backtestVersion ?? DEFAULT_BACKTEST_VERSION;
  }

  static async setBacktestVersion(version: BacktestVersion): Promise<void> {
    await this.updateData((data) => {
      data.backtestVersion = version;
    });
  }

  static async getTestQueue(): Promise<number> {
    const data = await this.loadData();
    return Math.max(1, data.testQueue ?? DEFAULT_TEST_QUEUE);
  }

  static async setTestQueue(queue: number): Promise<void> {
    await this.updateData((data) => {
      data.testQueue = Math.max(1, queue);
    });
  }
}
