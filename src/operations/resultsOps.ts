import { DatabaseService } from '../services/DatabaseService';
import { StorageService } from '../services/StorageService';
import { OpError, OpErrorCode } from '../bridge/errors';

const DEFAULT_LIMIT = 50;
const HARD_MAX = 200;

function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(HARD_MAX, Math.floor(n)));
}

function clampOffset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function listBatches(params?: { limit?: unknown }) {
  const limit = clampLimit(params?.limit, 100);
  const batches = await StorageService.getBatches();
  const sliced = batches.slice(0, limit);
  return {
    total: batches.length,
    limit,
    truncated: batches.length > sliced.length,
    batches: sliced.map((batch) => ({
      id: batch.id,
      timestamp: batch.timestamp,
      updatedAt: batch.updatedAt ?? null,
      totalTests: batch.totalTests,
      completedTests: batch.completedTests ?? null,
      runStatus: batch.runStatus ?? null,
      stopReason: batch.stopReason ?? null,
      lastError: batch.lastError ?? null,
      backtestVersion: batch.backtestVersion ?? batch.apiVersion ?? null,
      mode: batch.mode ?? null,
      namePrefix: batch.namePrefix ?? null,
      symbol: batch.symbol ?? null,
      exchange: batch.exchange ?? null
    }))
  };
}

export async function getBatch(params?: { batchId?: unknown }) {
  const batchId = typeof params?.batchId === 'string' ? params.batchId.trim() : '';
  if (!batchId) {
    throw new OpError(OpErrorCode.VALIDATION, 'batchId is required');
  }
  const batch = await StorageService.getBatchById(batchId);
  if (!batch) {
    throw new OpError(OpErrorCode.NOT_FOUND, `Batch not found: ${batchId}`);
  }
  return { batch };
}

export async function listResults(params?: {
  batchId?: unknown;
  limit?: unknown;
  offset?: unknown;
}) {
  const batchId = typeof params?.batchId === 'string' ? params.batchId.trim() : '';
  if (!batchId) {
    throw new OpError(OpErrorCode.VALIDATION, 'batchId is required');
  }

  const batch = await StorageService.getBatchById(batchId);
  if (!batch) {
    throw new OpError(OpErrorCode.NOT_FOUND, `Batch not found: ${batchId}`);
  }

  const limit = clampLimit(params?.limit);
  const offset = clampOffset(params?.offset);

  const page = await DatabaseService.getBatchTestsPage({
    batchId,
    sortKey: 'date',
    reversed: true,
    offset,
    limit
  });

  return {
    batchId,
    total: page.total,
    limit,
    offset,
    items: page.items
  };
}
