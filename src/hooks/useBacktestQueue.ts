/**
 * useBacktestQueue - React hook for managing backtest queue
 * Управление очередью бэктестов: запуск, остановка, retry, resume
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../types/veles';
import type { BatchRuntimeActiveRun, BatchStopReason } from '../types';
import { StorageService } from '../services/StorageService';
import { DatabaseService } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';
import { LogService } from '../services/LogService';
import { QueueLockService } from '../services/QueueLockService';
import { ConfigGenerator } from '../services/ConfigGenerator';
import { ConnectionService } from '../services/ConnectionService';
import { configHash } from '../utils/configHash';
import { parseDateLike, toIsoDateTime } from '../utils/datePolicy';

// Импорт утилит
import {
  delay,
  isNoTabError,
  isTerminalStatus,
  calculateCompletedTests,
  buildQueueFingerprint,
  toRuntimeItem,
  MAX_LOGS,
  extractErrorMessage,
  isUnauthorizedError,
  normalizeQueueStatus,
  buildResumeQueue,
} from '../utils/QueueUtils';

// Импорт retry policy
import {
  RETRY_WAIT_MS,
  RETRY_MAX_ATTEMPTS,
  MIN_TEST_INTERVAL_MS,
  RETRY_429_COOLDOWN_MS,
  NETWORK_RETRY_WAIT_MS,
  NETWORK_MAX_RETRY_ATTEMPTS,
  parseApiError,
  isRateLimit429,
  isQueueLimit412,
  isValidation412,
  isServer5xx,
  isFailedToFetchError,
  type LaunchRetryState,
  type LaunchRetryReason,
} from '../services/QueueRetryPolicy';

// Импорт polling service
import {
  STATUS_POLL_INTERVAL_MS,
  MAX_TEST_DURATION_MS,
  MAX_TEST_DURATION_MINUTES,
  MAX_CONCURRENT_TESTS,
  WAIT_CHUNK_MS,
} from '../services/QueuePolling';

// Импорт notifications
import { requestNotificationPermission, notifyQueueComplete } from '../services/QueueNotifications';

/**
 * Queue item representing a single backtest in the queue
 */
export interface QueueItem {
  /** Unique identifier for the queue item */
  id: string;
  /** Veles configuration payload */
  config: VelesConfigPayload;
  /** Current status of the queue item */
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  /** Error message if status is ERROR or TIMEOUT */
  error?: string;
  /** Result ID from Veles if test completed successfully */
  resultId?: number;
  /** Source template URL if imported from template */
  sourceTemplateUrl?: string;
}

/**
 * BacktestQueueController - interface returned by useBacktestQueue hook
 * Used by components to interact with the queue
 */
export type BacktestQueueController = ReturnType<typeof useBacktestQueue>;

/**
 * Execution context for running tests
 */
interface ExecutionContext {
  /** Chrome tab ID where Veles is running */
  tabId: number;
  /** Authentication token for Veles API */
  token: string;
}

/**
 * Active run state with additional metadata
 */
interface ActiveRunState extends BatchRuntimeActiveRun {
  /** Human-readable test name for logging */
  testName: string;
}

/**
 * Options for resuming queue execution
 */
interface RunOptions {
  /** Resume from this index */
  resumeFrom?: number;
  /** Active runs to resume */
  resumeActiveRuns?: BatchRuntimeActiveRun[];
  /** Timestamp of last launch */
  resumeLastLaunchAt?: number;
  /** Queue fingerprint for validation */
  resumeFingerprint?: string;
}

/**
 * Lock heartbeat interval in milliseconds
 * How often we refresh the lock to keep it alive
 */
const LOCK_HEARTBEAT_MS = 2000;

/**
 * Warning threshold for detecting frozen execution (ms)
 * If a wait chunk takes longer than this, we warn about possible inactivity
 */
const FREEZE_WARN_THRESHOLD_MS = 60000;

/**
 * Runtime version for resume compatibility
 * Incremented when resume format changes
 */
const RUNTIME_VERSION = 2;

/**
 * Main hook for backtest queue management
 * Handles queue state, test execution, retry logic, and notifications
 */
export function useBacktestQueue() {
  // === STATE ===
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [currentBatchIds, setCurrentBatchIds] = useState<number[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // === REFS ===
  const stopRef = useRef(false);
  const originalTitleRef = useRef(document.title);
  const ownerIdRef = useRef(`runner_${crypto.randomUUID()}`);
  const currentBatchIdRef = useRef<string | null>(null);
  const lastLogTimestampRef = useRef<string>(new Date().toLocaleTimeString('ru-RU', { hour12: false }));
  const statusSnapshotRef = useRef<{ items: QueueItem[]; activeCount: number } | null>(null);

  // === EFFECTS ===

  /** Cleanup on unmount: restore title and release lock */
  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current;
      void QueueLockService.release(ownerIdRef.current, currentBatchIdRef.current ?? undefined);
    };
  }, []);

  // === CALLBACKS ===

  /**
   * Builds status message for queue progress display
   * @param ts - Timestamp for the message
   * @param items - Current queue items
   * @param activeCount - Number of active tests
   * @returns Formatted status message
   */
  const buildQueueStatusMessage = useCallback((ts: string, items: QueueItem[], activeCount: number): string => {
    const completed = calculateCompletedTests(items);
    const total = items.length;
    const errors = items.reduce((acc, item) => (item.status === 'ERROR' ? acc + 1 : acc), 0);
    const queueBusy = Math.max(0, Math.min(activeCount, MAX_CONCURRENT_TESTS));
    return `[${ts}] Завершено ${completed}/${total} | Очередь ${queueBusy}/${MAX_CONCURRENT_TESTS} | Ошибки ${errors}`;
  }, []);

  /**
   * Adds a log entry to the in-memory log buffer
   * Updates both logs state and status message
   * @param msg - Log message to add
   */
  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    lastLogTimestampRef.current = ts;
    const decorated = msg; // decorateQueueLogMessage(msg) removed
    const line = `[${ts}] ${decorated}`;

    setLogs((prev) => {
      const next = [...prev, line];
      if (next.length <= MAX_LOGS) return next;
      return next.slice(next.length - MAX_LOGS);
    });

    const snapshot = statusSnapshotRef.current;
    if (snapshot) {
      setStatusMessage(buildQueueStatusMessage(ts, snapshot.items, snapshot.activeCount));
    } else {
      setStatusMessage(line);
    }
  }, [buildQueueStatusMessage]);

  /**
   * Updates live queue status for UI display
   * @param items - Current queue items
   * @param activeCount - Number of active tests
   */
  const setLiveQueueStatus = useCallback((items: QueueItem[], activeCount: number) => {
    const ts = lastLogTimestampRef.current;
    statusSnapshotRef.current = {
      items: items.map((item) => ({ ...item })),
      activeCount
    };
    setStatusMessage(buildQueueStatusMessage(ts, items, activeCount));
  }, [buildQueueStatusMessage]);

  /**
   * Adds items to the queue
   * @param items - Items to add
   */
  const addItems = useCallback((items: QueueItem[]) => {
    setQueue((prev) => [...prev, ...items]);
  }, []);

  /**
   * Clears the queue and resets all state
   */
  const clearQueue = useCallback(() => {
    setQueue([]);
    setProgress({ current: 0, total: 0 });
    setCurrentBatchIds([]);
    setStatusMessage('');
    statusSnapshotRef.current = null;
    setLogs([]);
    document.title = originalTitleRef.current;
  }, []);

  /**
   * Saves runtime checkpoint for resume functionality
   * @param batchId - Batch identifier
   * @param items - Current queue items
   * @param activeRuns - Map of active run states
   * @param status - Run status (RUN or STOP)
   * @param lastLaunchAt - Timestamp of last launch
   */
  const saveRuntimeCheckpoint = useCallback(
    async (
      batchId: string,
      items: QueueItem[],
      activeRuns: Map<number, ActiveRunState>,
      status: 'RUN' | 'STOP',
      lastLaunchAt: number
    ) => {
      await StorageService.saveBatchRuntime({
        batchId,
        version: RUNTIME_VERSION,
        items: items.map(toRuntimeItem),
        nextIndex: calculateCompletedTests(items),
        total: items.length,
        status,
        fingerprint: buildQueueFingerprint(items),
        activeRuns: Array.from(activeRuns.values()).map((run) => ({
          index: run.index,
          velesId: run.velesId,
          launchedAt: run.launchedAt,
          launchAttemptStartedAt: run.launchAttemptStartedAt
        })),
        lastLaunchAt,
        updatedAt: Date.now()
      });
    },
    []
  );

  /**
   * Resolves execution context (tab ID and token) from connection service
   * Retries on failure up to RETRY_MAX_ATTEMPTS
   * @param batchId - Batch identifier for logging
   * @returns Execution context or null with failure reason
   */
  const resolveExecutionContext = useCallback(
    async (batchId: string): Promise<{ context: ExecutionContext | null; reason: 'no_tab' | 'no_token' | 'unauthorized' }> => {
      for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        const connection = await ConnectionService.getConnection({ force: true });
        if (connection.success) {
          return {
            context: {
              tabId: connection.connection.tabId,
              token: connection.connection.token
            },
            reason: 'no_token'
          };
        }

        const reason: 'no_tab' | 'no_token' | 'unauthorized' =
          connection.reason === 'unknown' ? 'unauthorized' : connection.reason;
        const reasonLabel = ConnectionService.reasonToMessage(reason);

        if (attempt < RETRY_MAX_ATTEMPTS) {
          addLog(`${reasonLabel}. Откройте Veles, повтор через 60с (${attempt}/${RETRY_MAX_ATTEMPTS - 1})`);
          await LogService.warn('queue', 'queue.context_retry', {
            batchId,
            attempt,
            reason
          }, batchId);
          await delay(RETRY_WAIT_MS);
          continue;
        }

        await LogService.error('queue', 'queue.context_missing', new Error(reasonLabel), {
          batchId,
          reason,
          attempts: RETRY_MAX_ATTEMPTS
        }, batchId);

        return { context: null, reason };
      }

      return { context: null, reason: 'unauthorized' };
    },
    [addLog]
  );

  /**
   * Stops the queue execution
   * Sets stop flag and requests lock stop
   */
  const stop = useCallback(() => {
    stopRef.current = true;
    addLog('Остановка запрошена. Завершаю текущий цикл...');
    document.title = originalTitleRef.current;

    const batchId = currentBatchIdRef.current;
    if (batchId) {
      void StorageService.updateBatchRunState(batchId, 'STOP', {
        stopReason: 'manual_stop'
      });
    }

    void LogService.warn('queue', 'queue.stop_requested');
  }, [addLog]);

  /**
   * Interruptible wait with optional heartbeat
   * Returns false if stopped or heartbeat failed
   * @param ms - Milliseconds to wait
   * @param options - Heartbeat and freeze warning options
   * @returns True if completed normally, false if interrupted
   */
  const waitInterruptible = useCallback(
    async (
      ms: number,
      options?: {
        onHeartbeat?: () => Promise<boolean> | boolean;
        heartbeatEveryMs?: number;
        warnOnFreeze?: boolean;
        onHeartbeatLost?: () => void;
      }
    ): Promise<boolean> => {
      let remaining = Math.max(0, ms);
      let lastHeartbeatAt = Date.now();
      let freezeWarned = false;
      const heartbeatEveryMs = Math.max(250, options?.heartbeatEveryMs ?? LOCK_HEARTBEAT_MS);

      while (remaining > 0) {
        if (stopRef.current) return false;

        const chunk = Math.min(WAIT_CHUNK_MS, remaining);
        const startedAt = Date.now();
        await delay(chunk);
        const actualSleepMs = Date.now() - startedAt;
        remaining -= chunk;

        if (options?.warnOnFreeze && !freezeWarned && actualSleepMs > FREEZE_WARN_THRESHOLD_MS) {
          freezeWarned = true;
          addLog(
            `Обнаружена длительная пауза ${Math.round(actualSleepMs / 1000)}с. Возможно, вкладка или система была неактивна.`
          );
        }

        const now = Date.now();
        if (options?.onHeartbeat && now - lastHeartbeatAt >= heartbeatEveryMs) {
          const ok = await options.onHeartbeat();
          lastHeartbeatAt = now;
          if (!ok) {
            options.onHeartbeatLost?.();
            return false;
          }
        }
      }

      return !stopRef.current;
    },
    [addLog]
  );

  /**
   * Checks for external stop request from history
   * @param batchId - Batch identifier
   * @returns True if stop was requested externally
   */
  const pullExternalStop = useCallback(
    async (batchId: string): Promise<boolean> => {
      const requested = await QueueLockService.isStopRequested(batchId);
      if (!requested) return false;

      await QueueLockService.clearStopRequest(batchId);
      stopRef.current = true;
      addLog('Получена команда остановки из истории запусков.');
      return true;
    },
    [addLog]
  );

  /**
   * Wraps operations with automatic context recovery
   * If tab error occurs, re-resolves context and retries once
   * @param batchId - Batch identifier
   * @param runRef - Ref to execution context
   * @param operation - Operation to execute
   * @returns Result of operation
   */
  const withContextRecovery = useCallback(
    async <T,>(
      batchId: string,
      runRef: { current: ExecutionContext },
      operation: (ctx: ExecutionContext) => Promise<T>
    ): Promise<T> => {
      try {
        return await operation(runRef.current);
      } catch (error) {
        if (!isNoTabError(error)) {
          throw error;
        }

        const resolved = await resolveExecutionContext(batchId);
        if (!resolved.context) {
          throw new Error(`QUEUE_STOP:${resolved.reason}`);
        }

        runRef.current = resolved.context;
        return operation(runRef.current);
      }
    },
    [resolveExecutionContext]
  );

  /**
   * Main run function - executes all queue items
   * Handles locking, retry, polling, and state management
   * @param batchId - Batch identifier
   * @param initialItems - Initial queue items (or uses current queue)
   * @param options - Run options for resume
   */
  const run = useCallback(
    async (batchId: string, initialItems?: QueueItem[], options?: RunOptions) => {
      if (isRunning) {
        if (currentBatchIdRef.current === batchId) {
          addLog(`Продолжаю выполнение задачи ${batchId}.`);
        } else {
          addLog('Уже выполняется другой запуск.');
        }
        return;
      }

      // === LOCK ACQUISITION ===
      let lockAcquired = await QueueLockService.acquire(ownerIdRef.current, batchId);
      if (!lockAcquired) {
        const activeLock = await QueueLockService.getLock();
        if (activeLock && activeLock.batchId !== batchId) {
          const confirmed = window.confirm(
            `Сейчас выполняется задача ${activeLock.batchId}. Остановить ее и запустить новую?`
          );
          if (!confirmed) {
            addLog('Запуск отменен пользователем.');
            return;
          }

          addLog(`Останавливаю активную задачу ${activeLock.batchId}...`);
          await QueueLockService.requestStop(activeLock.batchId);
          await delay(1000);
          await QueueLockService.forceAcquire(ownerIdRef.current, batchId);
          lockAcquired = true;
          addLog(`Предыдущая задача остановлена. Продолжаю запуск ${batchId}.`);
        }
      }

      if (!lockAcquired) {
        if (currentBatchIdRef.current === batchId) {
          addLog(`Продолжаю выполнение задачи ${batchId}.`);
          return;
        }

        addLog('Уже выполняется другой запуск. Параллельный запуск заблокирован.');
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'lock_busy'
        });
        await LogService.warn('queue', 'queue.lock_busy', { batchId }, batchId);
        return;
      }

      // === INITIALIZATION ===
      setIsRunning(true);
      stopRef.current = false;
      currentBatchIdRef.current = batchId;
      setCurrentBatchId(batchId);
      statusSnapshotRef.current = null;
      setLogs([]);
      setCurrentBatchIds([]);
      originalTitleRef.current = document.title;
      await QueueLockService.clearStopRequest(batchId);

      let itemsToRun = (initialItems || queue).map((item) => ({ ...item }));
      if (itemsToRun.length === 0) {
        addLog('Очередь пуста.');
        await QueueLockService.release(ownerIdRef.current, batchId);
        setIsRunning(false);
        return;
      }

      const resumeFrom = Math.max(0, Math.min(options?.resumeFrom ?? 0, itemsToRun.length));
      if (resumeFrom > 0) {
        itemsToRun = itemsToRun.map((item, index) => {
          if (index >= resumeFrom || isTerminalStatus(item.status)) return item;
          return { ...item, status: 'FINISHED' as const, error: undefined };
        });
      }

      setQueue([...itemsToRun]);

      try {
        // === LOCK MAINTENANCE HELPERS ===
        const ensureLockOwnership = async (): Promise<boolean> => {
          const lock = await QueueLockService.getLock();
          const owned = !!lock && lock.ownerId === ownerIdRef.current && lock.batchId === batchId;
          if (!owned) {
            stopRef.current = true;
          }
          return owned;
        };

        const touchLock = async (): Promise<boolean> => {
          if (!(await ensureLockOwnership())) return false;
          return QueueLockService.refresh(ownerIdRef.current, batchId);
        };

        // === NOTIFICATION SETUP ===
        if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
          await requestNotificationPermission();
        }

        setCurrentBatchIds([]);

        // === CONTEXT RESOLUTION ===
        const resolved = await resolveExecutionContext(batchId);
        if (!resolved.context) {
          const connectionError =
            resolved.reason === 'no_tab'
              ? 'Вкладка Veles не найдена'
              : resolved.reason === 'no_token'
                ? 'Токен Veles не найден'
                : 'Авторизация в Veles не подтверждена';

          const completedOnFail = calculateCompletedTests(itemsToRun);
          await StorageService.updateBatchRunState(batchId, 'STOP', {
            stopReason: resolved.reason,
            completedTests: completedOnFail,
            lastError: connectionError
          });

          await saveRuntimeCheckpoint(batchId, itemsToRun, new Map<number, ActiveRunState>(), 'STOP', 0);
          addLog('Выполнение остановлено: откройте Veles и продолжите запуск из истории.');
          return;
        }

        // === STATE INITIALIZATION ===
        const runContextRef = { current: resolved.context };
        const total = itemsToRun.length;
        const activeRuns = new Map<number, ActiveRunState>();
        const pendingIndices: number[] = itemsToRun
          .map((_, index) => index)
          .filter(index => itemsToRun[index].status === 'PENDING');
        let forcedStopReason: BatchStopReason | null = null;
        let forcedStopMessage: string | undefined;
        let launchRetryState: LaunchRetryState | null = null;
        const launchTransientRetryAttempts = new Map<number, number>();
        const statusNetworkRetryAttempts = new Map<number, number>();
        const statusNetworkRetryAt = new Map<number, number>();

        // === HELPER FUNCTIONS ===
        const markLockLost = () => {
          if (forcedStopReason) return;
          forcedStopReason = 'lock_lost';
          forcedStopMessage = 'Тестирование остановлено: потерян lock очереди (вкладка была неактивна или запущен другой процесс).';
        };

        const waitWithLockHeartbeat = async (ms: number): Promise<boolean> => {
          const completed = await waitInterruptible(ms, {
            onHeartbeat: touchLock,
            heartbeatEveryMs: LOCK_HEARTBEAT_MS,
            warnOnFreeze: true,
            onHeartbeatLost: markLockLost
          });

          if (!completed && !forcedStopReason && stopRef.current) {
            forcedStopReason = 'manual_stop';
            forcedStopMessage = 'Остановлено пользователем';
          }

          return completed;
        };

        const commitQueueState = () => {
          setQueue([...itemsToRun]);
        };

        const setQueueItem = (index: number, patch: Partial<QueueItem>) => {
          const current = itemsToRun[index];
          if (!current) return;
          itemsToRun[index] = { ...current, ...patch };
          commitQueueState();
        };

        const refreshProgressUi = () => {
          const completed = calculateCompletedTests(itemsToRun);
          const percent = Math.round((completed / total) * 100);
          document.title = `[${percent}%] Тесты ${completed}/${total}`;
          setProgress({ current: completed, total });
        };

        const refreshLiveQueueStatus = () => {
          setLiveQueueStatus(itemsToRun, activeRuns.size);
        };

        const queueContains = (target: number): boolean => pendingIndices.includes(target);

        const movePendingToFront = (index: number) => {
          const pos = pendingIndices.indexOf(index);
          if (pos > -1) {
            pendingIndices.splice(pos, 1);
          }
          pendingIndices.unshift(index);
        };

        const enqueuePending = (index: number, front = false) => {
          if (activeRuns.has(index)) return;
          if (isTerminalStatus(itemsToRun[index]?.status ?? 'PENDING')) return;
          if (queueContains(index)) return;
          if (front) pendingIndices.unshift(index);
          else pendingIndices.push(index);
        };

        const clearLaunchRetryState = () => {
          launchRetryState = null;
        };

        const clearStatusNetworkRetry = (index: number) => {
          statusNetworkRetryAttempts.delete(index);
          statusNetworkRetryAt.delete(index);
        };

        const scheduleLaunchRetry = (
          index: number,
          reason: LaunchRetryReason,
          attempts: number,
          nextRetryAt: number,
          waitForActiveBelow: number | null
        ) => {
          launchRetryState = { index, reason, attempts, nextRetryAt, waitForActiveBelow };
          movePendingToFront(index);
        };

        const isLaunchRetryBlocked = (nowTs: number): boolean => {
          if (!launchRetryState) return false;

          const item = itemsToRun[launchRetryState.index];
          if (!item || item.status !== 'PENDING' || isTerminalStatus(item.status)) {
            clearLaunchRetryState();
            return false;
          }

          movePendingToFront(launchRetryState.index);

          if (launchRetryState.waitForActiveBelow !== null && activeRuns.size >= launchRetryState.waitForActiveBelow) {
            return true;
          }

          if (nowTs < launchRetryState.nextRetryAt) {
            return true;
          }

          return false;
        };

        // === RESTORE ACTIVE RUNS FROM RESUME ===
        const resumeFingerprintsMatch =
          !!options?.resumeFingerprint &&
          options.resumeFingerprint === buildQueueFingerprint(itemsToRun);
        const restoreActiveRuns = resumeFingerprintsMatch
          ? (options?.resumeActiveRuns ?? [])
          : [];
        if (!resumeFingerprintsMatch && (options?.resumeActiveRuns?.length ?? 0) > 0) {
          addLog('Resume guard: active runs skipped because runtime fingerprint does not match current queue.');
        }
        for (const runState of restoreActiveRuns) {
          const index = runState.index;
          if (index < 0 || index >= total) continue;
          if (!Number.isFinite(runState.velesId) || runState.velesId <= 0) continue;
          if (isTerminalStatus(itemsToRun[index].status)) continue;

          const testName = `Тест ${index + 1}/${total}`;
          activeRuns.set(index, {
            ...runState,
            testName,
            launchedAt: runState.launchedAt || Date.now(),
            launchAttemptStartedAt: runState.launchAttemptStartedAt || runState.launchedAt || Date.now()
          });
          itemsToRun[index] = { ...itemsToRun[index], status: 'RUNNING', error: undefined };
        }

        if (activeRuns.size > 0) {
          const oldestLaunchAt = Math.min(...Array.from(activeRuns.values()).map((run) => run.launchedAt || Date.now()));
          const restoredAgeMinutes = Math.max(0, Math.floor((Date.now() - oldestLaunchAt) / 60000));
          addLog(`Resume: restored ${activeRuns.size} active run(s), oldest age ~${restoredAgeMinutes} min.`);
        }

        for (let i = 0; i < total; i++) {
          if (itemsToRun[i].status === 'RUNNING' && !activeRuns.has(i)) {
            itemsToRun[i] = { ...itemsToRun[i], status: 'PENDING', error: undefined };
          }
        }

        for (let i = 0; i < total; i++) {
          if (itemsToRun[i].status === 'PENDING') {
            pendingIndices.push(i);
          }
        }

        let lastLaunchAt = Math.max(0, options?.resumeLastLaunchAt ?? 0);
        let lastIntervalPauseLogTargetAt = 0;
        let lastPollAt = 0;

        commitQueueState();
        refreshProgressUi();
        refreshLiveQueueStatus();

        await StorageService.updateBatchRunState(batchId, 'RUN', {
          completedTests: calculateCompletedTests(itemsToRun),
          stopReason: undefined,
          lastError: undefined
        });

        await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
        addLog(`Запуск очереди: ${calculateCompletedTests(itemsToRun)}/${total}`);
        await LogService.info('queue', 'queue.started', { batchId, total });

        const syncRunningProgress = async () => {
          const completed = calculateCompletedTests(itemsToRun);
          await StorageService.updateBatchRunState(batchId, 'RUN', {
            completedTests: completed
          });
          await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
          refreshProgressUi();
          refreshLiveQueueStatus();
        };

        // === FINALIZE ACTIVE RUN ===
        const finalizeActiveRun = async (index: number, runState: ActiveRunState): Promise<boolean> => {
          const item = itemsToRun[index];
          if (!item) {
            activeRuns.delete(index);
            clearStatusNetworkRetry(index);
            return true;
          }

          let statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
            VelesService.getStats(ctx.tabId, runState.velesId)
          );

          if (!statsRes.success || !statsRes.stats) {
            if (!(await waitWithLockHeartbeat(10000))) {
              return false;
            }

            statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
              VelesService.getStats(ctx.tabId, runState.velesId)
            );
          }

          if (!statsRes.success || !statsRes.stats) {
            throw new Error(statsRes.error || 'Не удалось получить статистику');
          }

          addLog(`${runState.testName}: сбор статистики завершен`);

          const stats = statsRes.stats;
          const actualFrom = toIsoDateTime(parseDateLike(stats.from)) ?? item.config.from;
          const actualTo = toIsoDateTime(parseDateLike(stats.to)) ?? item.config.to;

          const resultItem: BacktestResultItem = {
            id: runState.velesId,
            name: item.config.name,
            date: new Date().toISOString(),
            from: actualFrom,
            to: actualTo,
            symbol: item.config.symbol,
            algorithm: item.config.algorithm,
            exchange: item.config.exchange,
            profitQuote: stats.profitQuote,
            profitBase: null,
            netQuote: stats.netQuote,
            netQuotePerDay: stats.netQuotePerDay ?? null,
            maePercent: stats.maePercent,
            maeAbsolute: stats.maeAbsolute ?? null,
            mfePercent: stats.mfePercent,
            mfeAbsolute: stats.mfeAbsolute ?? null,
            totalDeals: stats.totalDeals,
            profits: stats.profits ?? 0,
            losses: stats.losses ?? 0,
            breakevens: stats.breakevens ?? 0,
            duration: null,
            maxDuration: stats.maxDuration ?? null,
            avgDuration: stats.avgDuration,
            sourceTemplateUrl: item.sourceTemplateUrl
          };

          await DatabaseService.saveBatchTests(batchId, [resultItem]);
          setCurrentBatchIds((prev) => (prev.includes(runState.velesId) ? prev : [...prev, runState.velesId]));

          activeRuns.delete(index);
          clearStatusNetworkRetry(index);
          if (launchRetryState?.index === index) {
            clearLaunchRetryState();
          }
          setQueueItem(index, { status: 'FINISHED', resultId: runState.velesId, error: undefined });

          addLog(`${runState.testName}: готово`);
          await LogService.info('queue', 'test.finished', {
            batchId,
            index: index + 1,
            velesId: runState.velesId,
            configHash: configHash(item.config)
          }, batchId);

          return true;
        };

        // === MAIN LOOP ===
        while (calculateCompletedTests(itemsToRun) < total) {
          if (!(await touchLock())) {
            markLockLost();
            break;
          }

          await pullExternalStop(batchId);
          if (stopRef.current) {
            if (!forcedStopReason) {
              forcedStopReason = 'manual_stop';
              forcedStopMessage = 'Остановлено пользователем';
            }
            break;
          }

          let didWork = false;
          const now = Date.now();
          const launchBlockedByRetry = isLaunchRetryBlocked(now);
          const canLaunchByCapacity =
            pendingIndices.length > 0 &&
            activeRuns.size < MAX_CONCURRENT_TESTS &&
            !launchBlockedByRetry;
          const nextAllowedLaunchAt = lastLaunchAt > 0 ? lastLaunchAt + MIN_TEST_INTERVAL_MS : 0;
          const launchIntervalRemainingMs = canLaunchByCapacity && nextAllowedLaunchAt > now
            ? nextAllowedLaunchAt - now
            : 0;

          if (launchIntervalRemainingMs > 0 && nextAllowedLaunchAt !== lastIntervalPauseLogTargetAt) {
            lastIntervalPauseLogTargetAt = nextAllowedLaunchAt;
            addLog(`Пауза ${Math.ceil(launchIntervalRemainingMs / 1000)}с перед следующим тестом...`);
          }

          // === LAUNCH NEW TESTS ===
          if (
            pendingIndices.length > 0 &&
            activeRuns.size < MAX_CONCURRENT_TESTS &&
            !launchBlockedByRetry &&
            (lastLaunchAt === 0 || now - lastLaunchAt >= MIN_TEST_INTERVAL_MS)
          ) {
            const index = pendingIndices.shift();
            if (index !== undefined && itemsToRun[index] && itemsToRun[index].status === 'PENDING') {
              const item = itemsToRun[index];
              const testName = `Тест ${index + 1}/${total}`;
              addLog(`${testName}: запуск теста...`);
              setQueueItem(index, { status: 'RUNNING', error: undefined });
              await LogService.info('queue', 'test.start', {
                batchId,
                index: index + 1,
                configHash: configHash(item.config)
              }, batchId);

              try {
                const result = await withContextRecovery(batchId, runContextRef, (ctx) =>
                  VelesService.runTest(ctx.tabId, ctx.token, item.config)
                );

                if (!result.success) {
                  const parsed = parseApiError(result.error || '');
                  if (isRateLimit429(parsed)) {
                    addLog(`Ошибка: ${parsed.message}`);
                    launchTransientRetryAttempts.delete(index);
                    setQueueItem(index, { status: 'PENDING', error: undefined });
                    scheduleLaunchRetry(index, 'RATE_LIMIT_429', 1, Date.now() + RETRY_429_COOLDOWN_MS, null);
                    refreshLiveQueueStatus();
                    addLog('Пауза 35с после 429. Повторяю запуск текущего теста...');
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                    continue;
                  }

                  if (isQueueLimit412(parsed)) {
                    addLog(`Ошибка: ${parsed.message}`);
                    const waitForActiveBelow = activeRuns.size > 0 ? activeRuns.size : null;
                    launchTransientRetryAttempts.delete(index);
                    setQueueItem(index, { status: 'PENDING', error: undefined });
                    scheduleLaunchRetry(index, 'QUEUE_LIMIT_412', 1, Date.now() + RETRY_429_COOLDOWN_MS, waitForActiveBelow);
                    refreshLiveQueueStatus();
                    addLog('Очередь Veles заполнена (412). Жду освобождения слота и повторяю текущий тест...');
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                    continue;
                  }

                  if (isValidation412(parsed)) {
                    clearLaunchRetryState();
                    launchTransientRetryAttempts.delete(index);
                    setQueueItem(index, { status: 'ERROR', error: parsed.message });
                    addLog(`Ошибка: ${parsed.message}`);
                    await LogService.error('queue', 'test.failed', new Error(parsed.message), {
                      batchId,
                      index: index + 1,
                      status: 'ERROR',
                      configHash: configHash(item.config)
                    }, batchId);
                    await syncRunningProgress();
                    continue;
                  }

                  const status: QueueItem['status'] = parsed.status === 412 ? 'ERROR' : 'ERROR';
                  clearLaunchRetryState();
                  launchTransientRetryAttempts.delete(index);
                  setQueueItem(index, { status, error: parsed.message });
                  addLog(`Ошибка: ${parsed.message}`);
                  await LogService.error('queue', 'test.failed', new Error(parsed.message), {
                    batchId,
                    index: index + 1,
                    status,
                    configHash: configHash(item.config)
                  }, batchId);
                  await syncRunningProgress();
                  continue;
                }

                lastLaunchAt = Date.now();
                clearLaunchRetryState();
                launchTransientRetryAttempts.delete(index);
                const velesId = result.id!;
                activeRuns.set(index, {
                  velesId,
                  index,
                  testName,
                  launchedAt: Date.now(),
                  launchAttemptStartedAt: Date.now()
                });
                refreshLiveQueueStatus();
                await syncRunningProgress();
                didWork = true;
              } catch (error) {
                const rawMsg = extractErrorMessage(error);

                if (rawMsg.startsWith('QUEUE_STOP:')) {
                  const reason = rawMsg.includes('no_token')
                    ? 'no_token'
                    : rawMsg.includes('unauthorized')
                      ? 'unauthorized'
                      : 'no_tab';
                  forcedStopReason = reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(reason);
                  clearLaunchRetryState();
                  launchTransientRetryAttempts.delete(index);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  enqueuePending(index, true);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                  break;
                }

                if (isUnauthorizedError(rawMsg)) {
                  ConnectionService.invalidate();
                  addLog('Потеря авторизации (401). Ожидание восстановления подключения...');
                  const recovered = await resolveExecutionContext(batchId);

                  if (recovered.context) {
                    runContextRef.current = recovered.context;
                    addLog('Подключение восстановлено. Повторяю запуск текущего теста...');
                    setQueueItem(index, { status: 'PENDING', error: undefined });
                    enqueuePending(index, true);
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                    continue;
                  }

                  forcedStopReason = recovered.reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(recovered.reason);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  enqueuePending(index, true);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                  break;
                }

                const parsed = parseApiError(rawMsg);

                if (isFailedToFetchError(rawMsg)) {
                  const previousAttempts = launchTransientRetryAttempts.get(index) ?? 0;
                  const attempts = previousAttempts + 1;

                  if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = 'Сеть не доступна более 10 мин.';
                    launchTransientRetryAttempts.delete(index);
                    setQueueItem(index, { status: 'PENDING', error: undefined });
                    scheduleLaunchRetry(index, 'NETWORK_FAILED_FETCH', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                    addLog(`Ошибка: ${rawMsg}`);
                    addLog(`Ошибка: ${forcedStopMessage}`);
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                    break;
                  }

                  launchTransientRetryAttempts.set(index, attempts);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  scheduleLaunchRetry(index, 'NETWORK_FAILED_FETCH', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                  refreshLiveQueueStatus();
                  addLog(`Ошибка: ${rawMsg}`);
                  addLog(`Сеть недоступна. Повтор запуска текущего теста через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                  continue;
                }

                if (isServer5xx(parsed)) {
                  const attempts = (launchTransientRetryAttempts.get(index) ?? 0) + 1;
                  launchTransientRetryAttempts.set(index, attempts);

                  if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = 'Сервер Veles недоступен более 10 мин.';
                    addLog(`Ошибка: ${forcedStopMessage}`);
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                    break;
                  }

                  launchTransientRetryAttempts.set(index, attempts);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  scheduleLaunchRetry(index, 'SERVER_5XX', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                  refreshLiveQueueStatus();
                  addLog(`Ошибка: ${rawMsg}`);
                  addLog(`Сервер Veles временно недоступен. Повтор запуска текущего теста через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                  continue;
                }

                const status: QueueItem['status'] = rawMsg.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR';
                clearLaunchRetryState();
                launchTransientRetryAttempts.delete(index);
                setQueueItem(index, { status, error: rawMsg });

                addLog(`Ошибка: ${rawMsg}`);
                await LogService.error('queue', 'test.failed', error, {
                  batchId,
                  index: index + 1,
                  status,
                  configHash: configHash(item.config)
                }, batchId);

                await syncRunningProgress();
              }
            }
          }

          // === POLL ACTIVE RUNS ===
          if (forcedStopReason) {
            break;
          }

          if (activeRuns.size > 0 && (Date.now() - lastPollAt >= STATUS_POLL_INTERVAL_MS || didWork)) {
            lastPollAt = Date.now();
            didWork = true;

            for (const [index, runState] of Array.from(activeRuns.entries())) {
              if (forcedStopReason || stopRef.current) break;

              const item = itemsToRun[index];
              if (!item) {
                activeRuns.delete(index);
                clearStatusNetworkRetry(index);
                continue;
              }

              const now = Date.now();
              const statusRetryAt = statusNetworkRetryAt.get(index) ?? 0;
              if (statusRetryAt > 0 && now < statusRetryAt) {
                continue;
              }

              try {
                const check = await withContextRecovery(batchId, runContextRef, (ctx) =>
                  VelesService.checkStatus(ctx.tabId, ctx.token, runState.velesId)
                );

                if (!check.success) {
                  throw new Error(`Ошибка проверки статуса: ${String(check.error)}`);
                }

                clearStatusNetworkRetry(index);

                if (!check.data) {
                  continue;
                }

                const status = check.data.status;
                if (status === 'FINISHED') {
                  const completed = await finalizeActiveRun(index, runState);
                  if (!completed) {
                    break;
                  }
                  continue;
                }

                if (status === 'ERROR' || status === 'FAILED') {
                  throw new Error(check.data.error || 'Тест завершился с ошибкой');
                }
              } catch (error) {
                const rawMsg = extractErrorMessage(error);

                if (rawMsg.startsWith('QUEUE_STOP:')) {
                  const reason = rawMsg.includes('no_token')
                    ? 'no_token'
                    : rawMsg.includes('unauthorized')
                      ? 'unauthorized'
                      : 'no_tab';
                  forcedStopReason = reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(reason);
                  break;
                }

                if (isUnauthorizedError(error)) {
                  ConnectionService.invalidate();
                  addLog('Потеря авторизации (401). Ожидание восстановления подключения...');
                  const recovered = await resolveExecutionContext(batchId);

                  if (recovered.context) {
                    runContextRef.current = recovered.context;
                    addLog('Подключение восстановлено. Продолжаю ожидание по текущему тесту...');
                    continue;
                  }

                  forcedStopReason = recovered.reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(recovered.reason);
                  break;
                }

                if (isFailedToFetchError(rawMsg)) {
                  const attempts = (statusNetworkRetryAttempts.get(index) ?? 0) + 1;
                  statusNetworkRetryAttempts.set(index, attempts);

                  if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = 'Сеть не доступна более 10 мин.';
                    addLog(`Ошибка: ${rawMsg}`);
                    addLog(`Ошибка: ${forcedStopMessage}`);
                    break;
                  }

                  statusNetworkRetryAt.set(index, Date.now() + NETWORK_RETRY_WAIT_MS);
                  addLog(`Ошибка: ${rawMsg}`);
                  addLog(`${runState.testName}: повторная проверка статуса через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                  continue;
                }

                activeRuns.delete(index);
                clearStatusNetworkRetry(index);
                setQueueItem(index, { status: 'ERROR', error: rawMsg });

                addLog(`Ошибка: ${rawMsg}`);
                refreshLiveQueueStatus();
                await LogService.error('queue', 'test.failed', error, {
                  batchId,
                  index: index + 1,
                  status: 'ERROR',
                  configHash: configHash(item.config)
                }, batchId);
              }

              if (!activeRuns.has(index)) {
                continue;
              }

              // === TIMEOUT CHECK ===
              if (Date.now() - runState.launchedAt > MAX_TEST_DURATION_MS) {
                const timeoutMessage = `TIMEOUT: тест не завершился за ${MAX_TEST_DURATION_MINUTES} минут`;
                activeRuns.delete(index);
                clearStatusNetworkRetry(index);
                setQueueItem(index, { status: 'TIMEOUT', error: timeoutMessage });
                addLog(`Ошибка: ${timeoutMessage}`);
                refreshLiveQueueStatus();
              }
            }

            await syncRunningProgress();
          }

          if (forcedStopReason) {
            break;
          }

          if (!didWork) {
            const fullWaitCompleted = await waitWithLockHeartbeat(WAIT_CHUNK_MS);
            if (!fullWaitCompleted && !forcedStopReason) {
              stopRef.current = true;
            }
          }
        }

        // === CLEANUP ===
        if (forcedStopReason || stopRef.current) {
          const reason = forcedStopReason ?? 'manual_stop';
          const completed = calculateCompletedTests(itemsToRun);

          await StorageService.updateBatchRunState(batchId, 'STOP', {
            completedTests: completed,
            stopReason: reason,
            lastError: forcedStopMessage
          });

          await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);

          const stopMessage = forcedStopMessage || 'Остановлено. Продолжите запуск из истории.';
          const isConnectionStop =
            reason === 'no_tab' ||
            reason === 'no_token' ||
            reason === 'unauthorized';
          addLog(isConnectionStop ? `вќЊ ${stopMessage}` : stopMessage);
        } else {
          await StorageService.updateBatchRunState(batchId, 'DONE', {
            completedTests: itemsToRun.length,
            stopReason: undefined,
            lastError: undefined
          });
          await StorageService.removeBatchRuntime(batchId);

          addLog('Очередь завершена.');
          notifyQueueComplete(itemsToRun.length, notificationsEnabled);
          await LogService.info('queue', 'queue.finished', { batchId, total: itemsToRun.length }, batchId);
        }
      } catch (error) {
        const message = extractErrorMessage(error);
        addLog(`Критическая ошибка: ${message}`);

        const activeRuns = new Map<number, ActiveRunState>();
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          completedTests: calculateCompletedTests(itemsToRun),
          stopReason: 'runtime_error',
          lastError: message
        });

        await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', 0);
        await LogService.critical('queue', 'queue.crashed', error, { batchId }, batchId);
      } finally {
        setIsRunning(false);
        document.title = originalTitleRef.current;
        currentBatchIdRef.current = null;
        setCurrentBatchId(null);
        statusSnapshotRef.current = null;
        await QueueLockService.release(ownerIdRef.current, batchId);
      }
    },
    [
      isRunning,
      addLog,
      notificationsEnabled,
      queue,
      pullExternalStop,
      resolveExecutionContext,
      saveRuntimeCheckpoint,
      waitInterruptible,
      withContextRecovery,
      setLiveQueueStatus
    ]
  );

  /**
   * Resumes queue execution from saved state
   * Uses BatchInfo.resumeSource to regenerate configs, then merges with saved runtime state
   * @param batchId - Batch identifier to resume
   */
  const resume = useCallback(
    async (batchId: string) => {
      const runtime = await StorageService.getBatchRuntime(batchId);
      if (!runtime) {
        addLog('Не найдено сохраненное состояние для продолжения.');
        return;
      }

      if (runtime.status === 'DONE') {
        addLog('Этот запуск уже завершен.');
        return;
      }

      const batch = await StorageService.getBatchById(batchId);
      if (!batch || !batch.resumeSource) {
        addLog('Нет исходной конфигурации для продолжения этого запуска.');
        return;
      }

      const regenerated = buildResumeQueue(batchId, batch.resumeSource, ConfigGenerator as unknown as { generate: (staticConfig: unknown, entry: unknown, orders: unknown, exits: unknown, temp: string) => { configs: Array<Record<string, unknown>> } });
      const regeneratedFingerprint = buildQueueFingerprint(regenerated);
      const expectedTotal = runtime.total || regenerated.length;
      if (regenerated.length !== expectedTotal) {
        addLog('Не удалось продолжить: изменился набор комбинаций (порядок или количество).');
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'runtime_error',
          lastError: 'Resume mismatch: generated combinations count differs'
        });
        return;
      }

      const runtimeFingerprint = runtime.fingerprint;
      const canRestoreRuntimeState =
        runtime.version === RUNTIME_VERSION &&
        !!runtimeFingerprint &&
        runtimeFingerprint === regeneratedFingerprint &&
        runtime.items &&
        runtime.items.length === regenerated.length;

      if (runtime.version === RUNTIME_VERSION && runtimeFingerprint && runtimeFingerprint !== regeneratedFingerprint) {
        addLog('Конфигурация изменилась. Запуск сначала.');
        await run(batchId, regenerated as QueueItem[]);
        return;
      }

      if (canRestoreRuntimeState) {
        const activeIndices = new Set((runtime.activeRuns ?? []).map((item: { index: number }) => item.index));

        const prepared = regenerated.map((item, idx) => {
          const runtimeItem = runtime.items?.[idx] as { status: unknown; error?: string } | undefined;
          if (!runtimeItem) return item;

          const runtimeStatus = normalizeQueueStatus(runtimeItem.status);
          const status = runtimeStatus === 'RUNNING' && !activeIndices.has(idx)
            ? 'PENDING' as const
            : runtimeStatus;

          return {
            ...item,
            status,
            error: runtimeItem.error
          };
        });

        addLog(`Восстановление состояния: ${runtime.nextIndex}/${runtime.total}`);

        const resumeOptions: RunOptions = {
          resumeFrom: runtime.nextIndex,
          resumeActiveRuns: runtime.activeRuns,
          resumeLastLaunchAt: runtime.lastLaunchAt,
          resumeFingerprint: runtime.fingerprint
        };

        await run(batchId, prepared as QueueItem[], resumeOptions);
      } else {
        addLog(`Восстановление состояния: 0/${runtime.total}`);
        await run(batchId, regenerated as QueueItem[]);
      }
    },
    [addLog, run]
  );

  /**
   * Returns current queue items (read-only copy)
   */
  const getQueue = useCallback(() => queue, [queue]);

  /**
   * Toggles notifications enabled state
   */
  const toggleNotifications = useCallback((enabled: boolean) => {
    setNotificationsEnabled(enabled);
  }, []);

  return {
    queue,
    isRunning,
    progress,
    statusMessage,
    logs,
    currentBatchId,
    currentBatchIds,
    notificationsEnabled,
    setNotificationsEnabled,
    addItems,
    clearQueue,
    run,
    resume,
    stop,
    getQueue,
    toggleNotifications
  };
}
