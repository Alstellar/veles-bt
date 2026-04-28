import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { StorageService } from './StorageService';
import type {
  BacktestResultItem,
  BatchInfo,
  ExchangeInfo,
  SymbolAvailability,
  SymbolLimitation
} from '../types';

export type BatchTestSortKey =
  | 'date'
  | 'name'
  | 'exchange'
  | 'symbol'
  | 'sourceTemplateUrl'
  | 'from'
  | 'netQuote'
  | 'recoveryFactor'
  | 'netQuotePerDay'
  | 'totalDeals'
  | 'dealsPerDay'
  | 'mfeAbsolute'
  | 'mfePercent'
  | 'maeAbsolute'
  | 'maePercent'
  | 'avgDuration'
  | 'maxDuration'
  | 'days';

interface BatchTestRecord {
  pk: string;
  batchId: string;
  testId: number;
  payload: BacktestResultItem;
  createdAt: number;
  nameSort: string;
  exchangeSort: string;
  symbolSort: string;
  sourceTemplateUrlSort: string;
  fromTs: number;
  netQuoteSort: number;
  recoveryFactorSort: number;
  netQuotePerDaySort: number;
  totalDealsSort: number;
  dealsPerDaySort: number;
  mfeAbsoluteSort: number;
  mfePercentSort: number;
  maeAbsoluteSort: number;
  maePercentSort: number;
  avgDurationSort: number;
  maxDurationSort: number;
  daysSort: number;
}

interface VelesDB extends DBSchema {
  tests: {
    key: number;
    value: BacktestResultItem;
    indexes: { 'by-date': string };
  };
  batch_tests: {
    key: string;
    value: BatchTestRecord;
    indexes: {
      'by-batch': string;
      'by-test-id': number;
      'by-batch-createdAt': [string, number];
      'by-batch-name': [string, string];
      'by-batch-exchange': [string, string];
      'by-batch-symbol': [string, string];
      'by-batch-sourceTemplateUrl': [string, string];
      'by-batch-fromTs': [string, number];
      'by-batch-netQuote': [string, number];
      'by-batch-recoveryFactor': [string, number];
      'by-batch-netQuotePerDay': [string, number];
      'by-batch-totalDeals': [string, number];
      'by-batch-dealsPerDay': [string, number];
      'by-batch-mfeAbsolute': [string, number];
      'by-batch-mfePercent': [string, number];
      'by-batch-maeAbsolute': [string, number];
      'by-batch-maePercent': [string, number];
      'by-batch-avgDuration': [string, number];
      'by-batch-maxDuration': [string, number];
      'by-batch-days': [string, number];
    };
  };
  reference_cache: {
    key: string;
    value: ReferenceCacheRecord;
    indexes: {
      'by-updatedAt': number;
    };
  };
}

const DB_NAME = 'VelesHelperDB';
const DB_VERSION = 3;
const MIGRATION_STATE_KEY = 'vh_batch_tests_migration_v1';
const MIGRATION_CHUNK_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const POSITIVE_SENTINEL = Number.MAX_SAFE_INTEGER;
const NEGATIVE_SENTINEL = Number.MIN_SAFE_INTEGER;

interface MigrationState {
  status: 'running' | 'done';
  batchIndex: number;
  offset: number;
  migratedLinks: number;
  updatedAt: number;
}

export interface ReferenceCacheExchangeRecord {
  limitations: SymbolLimitation[];
  availability: SymbolAvailability[];
  updatedAt: number;
}

export interface ReferenceCacheRecord {
  key: 'global';
  updatedAt: number;
  exchanges: ExchangeInfo[];
  byExchange: Partial<Record<string, ReferenceCacheExchangeRecord>>;
}

interface BatchPageQuery {
  batchId: string;
  sortKey: BatchTestSortKey;
  reversed: boolean;
  offset: number;
  limit: number;
}

interface BatchPageResult {
  items: BacktestResultItem[];
  total: number;
}

type SortIndexMeta =
  | { index: keyof VelesDB['batch_tests']['indexes']; valueType: 'number' }
  | { index: keyof VelesDB['batch_tests']['indexes']; valueType: 'string' };

const SORT_INDEX_BY_KEY: Record<BatchTestSortKey, SortIndexMeta> = {
  date: { index: 'by-batch-createdAt', valueType: 'number' },
  name: { index: 'by-batch-name', valueType: 'string' },
  exchange: { index: 'by-batch-exchange', valueType: 'string' },
  symbol: { index: 'by-batch-symbol', valueType: 'string' },
  sourceTemplateUrl: { index: 'by-batch-sourceTemplateUrl', valueType: 'string' },
  from: { index: 'by-batch-fromTs', valueType: 'number' },
  netQuote: { index: 'by-batch-netQuote', valueType: 'number' },
  recoveryFactor: { index: 'by-batch-recoveryFactor', valueType: 'number' },
  netQuotePerDay: { index: 'by-batch-netQuotePerDay', valueType: 'number' },
  totalDeals: { index: 'by-batch-totalDeals', valueType: 'number' },
  dealsPerDay: { index: 'by-batch-dealsPerDay', valueType: 'number' },
  mfeAbsolute: { index: 'by-batch-mfeAbsolute', valueType: 'number' },
  mfePercent: { index: 'by-batch-mfePercent', valueType: 'number' },
  maeAbsolute: { index: 'by-batch-maeAbsolute', valueType: 'number' },
  maePercent: { index: 'by-batch-maePercent', valueType: 'number' },
  avgDuration: { index: 'by-batch-avgDuration', valueType: 'number' },
  maxDuration: { index: 'by-batch-maxDuration', valueType: 'number' },
  days: { index: 'by-batch-days', valueType: 'number' }
};

const migrationStateDefault: MigrationState = {
  status: 'running',
  batchIndex: 0,
  offset: 0,
  migratedLinks: 0,
  updatedAt: Date.now()
};

const normalizeStringSort = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

const normalizeNumberSort = (value: number | null | undefined): number => {
  if (value === null || value === undefined) return NEGATIVE_SENTINEL;
  if (!Number.isFinite(value)) return NEGATIVE_SENTINEL;
  return value;
};

const buildPrimaryKey = (batchId: string, testId: number): string => `${batchId}:${testId}`;

const createPlaceholderResult = (testId: number): BacktestResultItem => {
  const nowIso = new Date().toISOString();
  return {
    id: testId,
    name: `Test ${testId}`,
    date: nowIso,
    from: nowIso,
    to: nowIso,
    symbol: '-',
    algorithm: 'LONG',
    exchange: '-',
    profitQuote: null,
    profitBase: null,
    netQuote: null,
    netQuotePerDay: null,
    maePercent: null,
    maeAbsolute: null,
    mfePercent: null,
    mfeAbsolute: null,
    totalDeals: null,
    profits: 0,
    losses: 0,
    breakevens: 0,
    duration: null,
    maxDuration: null,
    avgDuration: null
  };
};

const toBatchTestRecord = (batchId: string, item: BacktestResultItem): BatchTestRecord => {
  const createdAt = Number.isFinite(Date.parse(item.date)) ? Date.parse(item.date) : Date.now();
  const fromTs = Number.isFinite(Date.parse(item.from)) ? Date.parse(item.from) : createdAt;
  const toTs = Number.isFinite(Date.parse(item.to)) ? Date.parse(item.to) : fromTs;
  const days = Math.max(1, Math.floor(Math.max(0, toTs - fromTs) / DAY_MS));
  const totalDeals = item.totalDeals ?? 0;
  const dealsPerDay = totalDeals / days;
  const maeAbs = Math.abs(item.maeAbsolute ?? 0);
  const net = item.netQuote ?? 0;
  const recoveryFactor =
    maeAbs > 0
      ? net / maeAbs
      : net >= 0
        ? POSITIVE_SENTINEL
        : NEGATIVE_SENTINEL;

  return {
    pk: buildPrimaryKey(batchId, item.id),
    batchId,
    testId: item.id,
    payload: item,
    createdAt,
    nameSort: normalizeStringSort(item.name),
    exchangeSort: normalizeStringSort(item.exchange),
    symbolSort: normalizeStringSort(item.symbol),
    sourceTemplateUrlSort: normalizeStringSort(item.sourceTemplateUrl),
    fromTs,
    netQuoteSort: normalizeNumberSort(item.netQuote),
    recoveryFactorSort: normalizeNumberSort(recoveryFactor),
    netQuotePerDaySort: normalizeNumberSort(item.netQuotePerDay),
    totalDealsSort: normalizeNumberSort(totalDeals),
    dealsPerDaySort: normalizeNumberSort(dealsPerDay),
    mfeAbsoluteSort: normalizeNumberSort(item.mfeAbsolute),
    mfePercentSort: normalizeNumberSort(item.mfePercent),
    maeAbsoluteSort: normalizeNumberSort(item.maeAbsolute),
    maePercentSort: normalizeNumberSort(item.maePercent),
    avgDurationSort: normalizeNumberSort(item.avgDuration),
    maxDurationSort: normalizeNumberSort(item.maxDuration),
    daysSort: normalizeNumberSort(days)
  };
};

const createBatchTestsStore = (db: IDBPDatabase<VelesDB>) => {
  if (db.objectStoreNames.contains('batch_tests')) return;
  const store = db.createObjectStore('batch_tests', { keyPath: 'pk' });
  store.createIndex('by-batch', 'batchId');
  store.createIndex('by-test-id', 'testId');
  store.createIndex('by-batch-createdAt', ['batchId', 'createdAt']);
  store.createIndex('by-batch-name', ['batchId', 'nameSort']);
  store.createIndex('by-batch-exchange', ['batchId', 'exchangeSort']);
  store.createIndex('by-batch-symbol', ['batchId', 'symbolSort']);
  store.createIndex('by-batch-sourceTemplateUrl', ['batchId', 'sourceTemplateUrlSort']);
  store.createIndex('by-batch-fromTs', ['batchId', 'fromTs']);
  store.createIndex('by-batch-netQuote', ['batchId', 'netQuoteSort']);
  store.createIndex('by-batch-recoveryFactor', ['batchId', 'recoveryFactorSort']);
  store.createIndex('by-batch-netQuotePerDay', ['batchId', 'netQuotePerDaySort']);
  store.createIndex('by-batch-totalDeals', ['batchId', 'totalDealsSort']);
  store.createIndex('by-batch-dealsPerDay', ['batchId', 'dealsPerDaySort']);
  store.createIndex('by-batch-mfeAbsolute', ['batchId', 'mfeAbsoluteSort']);
  store.createIndex('by-batch-mfePercent', ['batchId', 'mfePercentSort']);
  store.createIndex('by-batch-maeAbsolute', ['batchId', 'maeAbsoluteSort']);
  store.createIndex('by-batch-maePercent', ['batchId', 'maePercentSort']);
  store.createIndex('by-batch-avgDuration', ['batchId', 'avgDurationSort']);
  store.createIndex('by-batch-maxDuration', ['batchId', 'maxDurationSort']);
  store.createIndex('by-batch-days', ['batchId', 'daysSort']);
};

const createReferenceCacheStore = (db: IDBPDatabase<VelesDB>) => {
  if (db.objectStoreNames.contains('reference_cache')) return;
  const store = db.createObjectStore('reference_cache', { keyPath: 'key' });
  store.createIndex('by-updatedAt', 'updatedAt');
};

export class DatabaseService {
  private static dbPromise: Promise<IDBPDatabase<VelesDB>>;

  private static getDB() {
    if (!this.dbPromise) {
      this.dbPromise = openDB<VelesDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          if (!db.objectStoreNames.contains('tests')) {
            const store = db.createObjectStore('tests', { keyPath: 'id' });
            store.createIndex('by-date', 'date');
          }

          if (oldVersion < 2) {
            createBatchTestsStore(db);
          }
          if (oldVersion < 3) {
            createReferenceCacheStore(db);
          }
        }
      });
    }
    return this.dbPromise;
  }

  private static async storageGet<T>(key: string): Promise<T | undefined> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (result) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(result[key] as T | undefined);
        });
      });
    }

    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private static async storageSet<T>(key: string, value: T): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve();
        });
      });
    }

    localStorage.setItem(key, JSON.stringify(value));
  }

  static async saveTests(tests: BacktestResultItem[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readwrite');
    await Promise.all([...tests.map((test) => tx.store.put(test)), tx.done]);
  }

  static async saveBatchTests(batchId: string, tests: BacktestResultItem[]): Promise<void> {
    if (!batchId || tests.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction(['tests', 'batch_tests'], 'readwrite');
    const testsStore = tx.objectStore('tests');
    const batchStore = tx.objectStore('batch_tests');

    tests.forEach((test) => {
      testsStore.put(test);
      batchStore.put(toBatchTestRecord(batchId, test));
    });

    await tx.done;
  }

  static async linkLegacyTestsToBatch(batchId: string, ids: number[]): Promise<number> {
    if (!batchId || ids.length === 0) return 0;
    const db = await this.getDB();
    const tx = db.transaction(['tests', 'batch_tests'], 'readwrite');
    const testsStore = tx.objectStore('tests');
    const batchStore = tx.objectStore('batch_tests');

    let written = 0;
    for (const id of ids) {
      const existing = await testsStore.get(id);
      const payload = existing ?? createPlaceholderResult(id);
      batchStore.put(toBatchTestRecord(batchId, payload));
      written += 1;
    }

    await tx.done;
    return written;
  }

  static async getBatchTestsCount(batchId: string): Promise<number> {
    const db = await this.getDB();
    return db.countFromIndex('batch_tests', 'by-batch', IDBKeyRange.only(batchId));
  }

  static async getBatchTestsPage(query: BatchPageQuery): Promise<BatchPageResult> {
    const { batchId, sortKey, reversed, offset, limit } = query;
    if (!batchId || limit <= 0) return { items: [], total: 0 };

    const db = await this.getDB();
    const total = await db.countFromIndex('batch_tests', 'by-batch', IDBKeyRange.only(batchId));
    if (total === 0) return { items: [], total: 0 };

    const normalizedOffset = Math.max(0, offset);
    const normalizedLimit = Math.max(1, limit);
    const sortMeta = SORT_INDEX_BY_KEY[sortKey] ?? SORT_INDEX_BY_KEY.date;
    const tx = db.transaction('batch_tests', 'readonly');
    const index = tx.store.index(sortMeta.index);
    const direction = reversed ? 'prev' : 'next';
    const range =
      sortMeta.valueType === 'number'
        ? IDBKeyRange.bound([batchId, NEGATIVE_SENTINEL], [batchId, POSITIVE_SENTINEL])
        : IDBKeyRange.bound([batchId, ''], [batchId, '\uffff']);

    let cursor = await index.openCursor(range, direction);
    let skipped = 0;
    const items: BacktestResultItem[] = [];

    while (cursor && items.length < normalizedLimit) {
      if (skipped < normalizedOffset) {
        skipped += 1;
        cursor = await cursor.continue();
        continue;
      }

      items.push(cursor.value.payload);
      cursor = await cursor.continue();
    }

    await tx.done;
    return { items, total };
  }

  static async getBatchTestIds(batchId: string): Promise<number[]> {
    if (!batchId) return [];
    const db = await this.getDB();
    const tx = db.transaction('batch_tests', 'readonly');
    const store = tx.objectStore('batch_tests');
    const index = store.index('by-batch');
    const ids: number[] = [];
    let cursor = await index.openCursor(IDBKeyRange.only(batchId));
    while (cursor) {
      ids.push(cursor.value.testId);
      cursor = await cursor.continue();
    }
    await tx.done;
    return ids;
  }

  static async getAllTrackedTestIds(): Promise<Set<number>> {
    const db = await this.getDB();
    const tx = db.transaction('batch_tests', 'readonly');
    const index = tx.objectStore('batch_tests').index('by-test-id');
    const ids = new Set<number>();
    let cursor = await index.openKeyCursor();
    while (cursor) {
      ids.add(cursor.key as number);
      cursor = await cursor.continue();
    }
    await tx.done;
    return ids;
  }

  static async getEarliestTrackedTestId(): Promise<number | null> {
    const db = await this.getDB();
    const tx = db.transaction('batch_tests', 'readonly');
    const index = tx.objectStore('batch_tests').index('by-test-id');
    const cursor = await index.openKeyCursor(null, 'next');
    await tx.done;
    return cursor ? (cursor.key as number) : null;
  }

  static async getLastTestId(): Promise<number | null> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readonly');
    const cursor = await tx.store.openCursor(null, 'prev');
    return cursor ? cursor.key : null;
  }

  static async getAllTests(): Promise<BacktestResultItem[]> {
    const db = await this.getDB();
    return db.getAllFromIndex('tests', 'by-date');
  }

  static async getTestsByIds(ids: number[]): Promise<BacktestResultItem[]> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readonly');
    const results = await Promise.all(ids.map((id) => tx.store.get(id)));
    await tx.done;
    return results.filter((item): item is BacktestResultItem => item !== undefined);
  }

  static async getCount(): Promise<number> {
    const db = await this.getDB();
    return db.count('tests');
  }

  static async deleteBatchTests(batchId: string): Promise<void> {
    if (!batchId) return;
    const db = await this.getDB();
    const tx = db.transaction('batch_tests', 'readwrite');
    const store = tx.objectStore('batch_tests');
    const index = store.index('by-batch');
    let cursor = await index.openCursor(IDBKeyRange.only(batchId));
    while (cursor) {
      await store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  static async clearAll(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['tests', 'batch_tests', 'reference_cache'], 'readwrite');
    await Promise.all([
      tx.objectStore('tests').clear(),
      tx.objectStore('batch_tests').clear(),
      tx.objectStore('reference_cache').clear(),
      tx.done
    ]);
  }

  static async getReferenceCache(): Promise<ReferenceCacheRecord | null> {
    const db = await this.getDB();
    const tx = db.transaction('reference_cache', 'readonly');
    const payload = await tx.store.get('global');
    await tx.done;
    return payload ?? null;
  }

  static async setReferenceCache(payload: Omit<ReferenceCacheRecord, 'key'>): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('reference_cache', 'readwrite');
    await tx.store.put({
      key: 'global',
      updatedAt: payload.updatedAt,
      exchanges: payload.exchanges,
      byExchange: payload.byExchange
    });
    await tx.done;
  }

  private static async readMigrationState(): Promise<MigrationState | null> {
    try {
      const state = await this.storageGet<MigrationState>(MIGRATION_STATE_KEY);
      if (!state) return null;
      if (state.status !== 'running' && state.status !== 'done') return null;
      return state;
    } catch {
      return null;
    }
  }

  private static async writeMigrationState(state: MigrationState): Promise<void> {
    await this.storageSet(MIGRATION_STATE_KEY, state);
  }

  private static async migrateBatch(batch: BatchInfo, startOffset: number): Promise<{ migrated: number; done: boolean; offset: number }> {
    const legacyIds = Array.isArray(batch.velesIds) ? batch.velesIds : [];
    if (legacyIds.length === 0) {
      await StorageService.updateBatch(batch.id, { velesIds: [] });
      return { migrated: 0, done: true, offset: 0 };
    }

    let offset = Math.max(0, startOffset);
    let migrated = 0;

    while (offset < legacyIds.length) {
      const chunk = legacyIds.slice(offset, offset + MIGRATION_CHUNK_SIZE);
      migrated += await this.linkLegacyTestsToBatch(batch.id, chunk);
      offset += chunk.length;
      if (offset < legacyIds.length) {
        return { migrated, done: false, offset };
      }
    }

    await StorageService.updateBatch(batch.id, { velesIds: [] });
    return { migrated, done: true, offset: 0 };
  }

  static async runLegacyMigration(): Promise<{ done: boolean; migratedLinks: number }> {
    await this.getDB();
    const batches = await StorageService.getBatches();
    if (batches.length === 0) {
      const doneState: MigrationState = { ...migrationStateDefault, status: 'done', migratedLinks: 0 };
      await this.writeMigrationState(doneState);
      return { done: true, migratedLinks: 0 };
    }

    let state = (await this.readMigrationState()) ?? migrationStateDefault;
    if (state.status === 'done') {
      return { done: true, migratedLinks: state.migratedLinks };
    }

    let batchIndex = Math.min(state.batchIndex, batches.length - 1);
    let migratedLinks = state.migratedLinks;
    let offset = state.offset;

    for (; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      while (true) {
        const result = await this.migrateBatch(batch, offset);
        migratedLinks += result.migrated;

        if (!result.done) {
          offset = result.offset;
          const runningState: MigrationState = {
            status: 'running',
            batchIndex,
            offset,
            migratedLinks,
            updatedAt: Date.now()
          };
          await this.writeMigrationState(runningState);
          continue;
        }

        offset = 0;
        const runningState: MigrationState = {
          status: 'running',
          batchIndex: batchIndex + 1,
          offset: 0,
          migratedLinks,
          updatedAt: Date.now()
        };
        await this.writeMigrationState(runningState);
        break;
      }
    }

    const doneState: MigrationState = {
      status: 'done',
      batchIndex: batches.length,
      offset: 0,
      migratedLinks,
      updatedAt: Date.now()
    };
    await this.writeMigrationState(doneState);
    return { done: true, migratedLinks };
  }
}
