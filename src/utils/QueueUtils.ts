/**
 * Queue utility functions
 * Вспомогательные функции для работы с очередью бэктестов
 */

import { configHash } from './configHash';
import { parseDateLike } from './datePolicy';

/**
 * Minimal queue item interface for utility functions
 */
interface QueueItemLike {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number;
  sourceTemplateUrl?: string;
  config: unknown;
}

function normalizeBaseSymbol(value: string): string {
  return value.replace('/USDT', '').replace(/USDT$/, '').trim().toUpperCase();
}

/**
 * Creates a delay promise
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if error is related to missing browser tab
 * @param error - Any error object
 * @returns True if error contains 'No tab with id'
 */
export function isNoTabError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('No tab with id');
}

/**
 * Checks if error is related to 401 unauthorized
 * @param error - Any error object
 * @returns True if error indicates unauthorized access
 */
export function isUnauthorizedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Unauthorized') || msg.includes('"status":401') || msg.includes('401');
}

/**
 * Checks if queue item status is terminal (completed)
 * @param status - QueueItem status
 * @returns True if status is FINISHED, ERROR or TIMEOUT
 */
export function isTerminalStatus(status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT'): boolean {
  return status === 'FINISHED' || status === 'ERROR' || status === 'TIMEOUT';
}

/**
 * Counts completed tests in queue
 * @param items - Array of queue items
 * @returns Number of items with terminal status
 */
export function calculateCompletedTests(items: QueueItemLike[]): number {
  return items.reduce((acc, item) => (isTerminalStatus(item.status) ? acc + 1 : acc), 0);
}

/**
 * Log message prefixes for queue operations
 * Used to avoid double-prefixing messages
 */
const LOG_PREFIXES = ['??', '?', '??', '?', '??', '?', '?', '??', '??', '??'] as const;

/**
 * Prevents double-decoration of log messages
 * @param message - Raw log message
 * @returns Message with preserved prefix or decorated
 */
export function decorateQueueLogMessage(message: string): string {
  if (LOG_PREFIXES.some((prefix) => message.startsWith(`${prefix} `))) {
    return message;
  }
  return message;
}

/**
 * Converts QueueItem to runtime representation (without config)
 * @param item - Queue item to convert
 * @returns Runtime representation of item
 */
export function toRuntimeItem(item: QueueItemLike) {
  return {
    id: item.id,
    status: item.status,
    error: item.error,
    resultId: item.resultId,
    sourceTemplateUrl: item.sourceTemplateUrl
  };
}

/**
 * FNV-1a 32-bit hash function for generating fingerprints
 * Used to create unique hash of queue configuration
 * @param input - String to hash
 * @returns 32-bit unsigned hash value
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return hash >>> 0;
}

/**
 * Builds fingerprint for queue items to detect changes
 * Format: "count:hashHex"
 * @param items - Array of queue items
 * @returns Fingerprint string
 */
export function buildQueueFingerprint(items: QueueItemLike[]): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const payload = `${i}|${configHash(item.config)}|${item.sourceTemplateUrl ?? ''};`;
    hash = fnv1a32(`${hash}:${payload}`);
  }

  return `${items.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Maximum number of log entries to keep in memory
 * Limits memory usage while preserving important history
 */
export const MAX_LOGS = 400;

/**
 * Extracts error message from error object
 * Strips "Error: " prefix for cleaner messages
 * @param error - Any error object
 * @returns Clean error message string
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error:\s*/, '');
  }
  return String(error).replace(/^Error:\s*/, '');
}

/**
 * Normalizes status to known QueueItem status values
 * Used when restoring queue from saved state
 * @param status - Any status value
 * @returns Known QueueItem status or PENDING default
 */
export function normalizeQueueStatus(status: unknown): 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT' {
  if (status === 'RUNNING' || status === 'FINISHED' || status === 'ERROR' || status === 'TIMEOUT') {
    return status;
  }
  return 'PENDING';
}

/**
 * Builds queue items from resume source (saved batch)
 * Uses ConfigGenerator to regenerate configs from saved source
 * @param batchId - Batch identifier
 * @param resumeSource - Saved batch configuration (entryConfig, orderState, exitConfig)
 * @returns Array of queue items with PENDING status
 */
export function buildResumeQueue(batchId: string, resumeSource: {
  entryConfig: unknown;
  orderState: unknown;
  exitConfig: unknown;
  staticConfig: {
    dateFrom: string | Date;
    dateTo: string | Date;
    symbol?: string;
    selectedSymbols?: unknown;
    dateFromBySymbol?: Record<string, string>;
    wholePeriodMode?: boolean;
    wholePeriodFromBySymbol?: Record<string, string>;
    [key: string]: unknown;
  };
}, ConfigGen: { generate: (staticConfig: unknown, entry: unknown, orders: unknown, exits: unknown, temp: string) => { configs: Array<Record<string, unknown>> } }): QueueItemLike[] {
  const staticConfig = {
    ...resumeSource.staticConfig,
    dateFrom: parseDateLike(resumeSource.staticConfig.dateFrom) ?? new Date(),
    dateTo: parseDateLike(resumeSource.staticConfig.dateTo) ?? new Date()
  };

  const rawSelected = Array.isArray(staticConfig.selectedSymbols)
    ? staticConfig.selectedSymbols.map((item) => String(item).trim().toUpperCase()).filter((item) => item.length > 0)
    : [];
  const uniqueSelected = Array.from(new Set(rawSelected));
  const fallbackSymbol = String(staticConfig.symbol ?? '').trim().toUpperCase();
  const symbols = uniqueSelected.length > 0
    ? uniqueSelected
    : (fallbackSymbol ? [fallbackSymbol] : []);

  const configs = (symbols.length > 0 ? symbols : ['']).flatMap((symbol) => {
    const base = normalizeBaseSymbol(symbol);
    const perSymbolFrom = parseDateLike(
      staticConfig.dateFromBySymbol?.[base] ??
      (staticConfig.wholePeriodMode ? staticConfig.wholePeriodFromBySymbol?.[base] : undefined)
    );
    const perSymbolConfig = symbol
      ? { ...staticConfig, symbol, selectedSymbols: [symbol], dateFrom: perSymbolFrom ?? staticConfig.dateFrom }
      : staticConfig;
    const generated = ConfigGen.generate(
      perSymbolConfig,
      resumeSource.entryConfig,
      resumeSource.orderState,
      resumeSource.exitConfig,
      '#TEMP'
    );
    return generated.configs;
  });

  return configs.map((cfg) => ({
    id: crypto.randomUUID(),
    config: { ...cfg, name: (cfg.name as string).replace('#TEMP', batchId) },
    status: 'PENDING' as const
  }));
}
