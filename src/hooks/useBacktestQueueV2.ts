// src/hooks/useBacktestQueueV2.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { VelesServiceV2 } from '../services/VelesServiceV2';
import type { VelesConfigPayloadV2 } from '../types/velesV2';
import type { VelesHttpTrace } from '../types/velesTrace';
import type { BatchRuntimeActiveRun, BatchStopReason } from '../types';
import { StorageService } from '../services/StorageService';
import { DatabaseService } from '../services/DatabaseService';
import { clampV2TestQueue } from '../config/backtestQueue';
import type { BacktestResultItem } from '../types';
import { LogService } from '../services/LogService';
import { QueueLockService } from '../services/QueueLockService';
import { ConfigGeneratorV2 } from '../services/ConfigGeneratorV2';
import { ConnectionService } from '../services/ConnectionService';
import { MarketDataHealthService } from '../services/MarketDataHealthService';
import { configHash } from '../utils/configHash';
import { parseDateLike, toIsoDateTime } from '../utils/datePolicy';
import { markNoMarketDataItems } from '../utils/queueErrorActions';
import {
  buildQueueErrorSummary,
  getBacktestNameTooLongStopMessage,
  isBacktestNameTooLongError
} from '../utils/velesErrorSummary';

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

import {
  RETRY_WAIT_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_429_COOLDOWN_MS,
  getMinTestInterval,
  setMinTestInterval,
  NETWORK_RETRY_WAIT_MS,
  NETWORK_MAX_RETRY_ATTEMPTS,
  parseApiError,
  isServer5xx,
  isFailedToFetchError,
  isRateLimit429,
  isQueueLimit412,
  isValidation412,
  type LaunchRetryState,
  type LaunchRetryReason,
} from '../services/QueueRetryPolicy';

import {
  STATUS_POLL_INTERVAL_MS,
  MAX_TEST_DURATION_MS,
  MAX_TEST_DURATION_MINUTES,
  MAX_CONCURRENT_TESTS,
  WAIT_CHUNK_MS,
} from '../services/QueuePolling';

import { requestNotificationPermission, notifyQueueComplete } from '../services/QueueNotifications';

export interface QueueItemV2 {
  id: string;
  config: VelesConfigPayloadV2;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number;
  sourceTemplateUrl?: string;
}

export type BacktestQueueControllerV2 = ReturnType<typeof useBacktestQueueV2>;

interface ExecutionContext {
  tabId: number;
  token: string;
}

interface ActiveRunState extends BatchRuntimeActiveRun {
  testName: string;
}

interface RunOptions {
  resumeFrom?: number;
  resumeActiveRuns?: BatchRuntimeActiveRun[];
  resumeLastLaunchAt?: number;
  resumeFingerprint?: string;
}

const LOCK_HEARTBEAT_MS = 2000;
const FREEZE_WARN_THRESHOLD_MS = 60000;
const RUNTIME_VERSION = 2;

export function useBacktestQueueV2() {
  const [queue, setQueue] = useState<QueueItemV2[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [currentBatchIds, setCurrentBatchIds] = useState<number[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const stopRef = useRef(false);
  const originalTitleRef = useRef(document.title);
  const ownerIdRef = useRef(`runner_${crypto.randomUUID()}`);
  const currentBatchIdRef = useRef<string | null>(null);
  const lastLogTimestampRef = useRef<string>(new Date().toLocaleTimeString('ru-RU', { hour12: false }));
  const statusSnapshotRef = useRef<{ items: QueueItemV2[]; activeCount: number } | null>(null);
  const maxConcurrentTestsRef = useRef<number>(MAX_CONCURRENT_TESTS);

  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current;
      void QueueLockService.release(ownerIdRef.current, currentBatchIdRef.current ?? undefined);
    };
  }, []);

  const buildQueueStatusMessage = useCallback((ts: string, items: QueueItemV2[], activeCount: number): string => {
    const completed = calculateCompletedTests(items);
    const total = items.length;
    const errors = items.reduce((acc, item) => (item.status === 'ERROR' ? acc + 1 : acc), 0);
    const currentMaxConcurrent = Math.max(1, maxConcurrentTestsRef.current || MAX_CONCURRENT_TESTS);
    const queueBusy = Math.max(0, Math.min(activeCount, currentMaxConcurrent));
    return `[${ts}] Завершено ${completed}/${total} | Очередь ${queueBusy}/${currentMaxConcurrent} | Ошибки ${errors}`;
  }, []);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    lastLogTimestampRef.current = ts;
    const line = `[${ts}] ${msg}`;

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

  const setLiveQueueStatus = useCallback((items: QueueItemV2[], activeCount: number) => {
    const ts = lastLogTimestampRef.current;
    statusSnapshotRef.current = {
      items: items.map((item) => ({ ...item })),
      activeCount
    };
    setStatusMessage(buildQueueStatusMessage(ts, items, activeCount));
  }, [buildQueueStatusMessage]);

  const addItems = useCallback((items: QueueItemV2[]) => {
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setProgress({ current: 0, total: 0 });
    setCurrentBatchIds([]);
    setStatusMessage('');
    statusSnapshotRef.current = null;
    setLogs([]);
    document.title = originalTitleRef.current;
  }, []);

  const saveRuntimeCheckpoint = useCallback(
    async (
      batchId: string,
      items: QueueItemV2[],
      activeRuns: Map<number, ActiveRunState>,
      status: 'RUN' | 'STOP',
      lastLaunchAt: number
    ) => {
      const savedV2Interval = await StorageService.getV2IntervalSeconds();
      await StorageService.saveBatchRuntime({
        batchId,
        version: RUNTIME_VERSION,
        apiVersion: 'v2',
        v2IntervalSeconds: savedV2Interval,
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
            reason: 'no_token' as const
          };
        }

        const reason: 'no_tab' | 'no_token' | 'unauthorized' =
          connection.reason === 'unknown' ? 'unauthorized' : connection.reason;
        const reasonLabel = ConnectionService.reasonToMessage(reason);

        if (attempt < RETRY_MAX_ATTEMPTS) {
          addLog(`${reasonLabel}. Повтор через 60с (${attempt}/${RETRY_MAX_ATTEMPTS - 1})`);
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
          addLog(`Обнаружена длительная пауза ${Math.round(actualSleepMs / 1000)}с. Возможно, вкладка или система была неактивна.`);
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

  const run = useCallback(
    async (batchId: string, initialItems?: QueueItemV2[], options?: RunOptions) => {
      const v2Interval = await StorageService.getV2IntervalSeconds();
      setMinTestInterval(v2Interval * 1000);

      if (isRunning) {
        if (currentBatchIdRef.current === batchId) {
          addLog(`Продолжаю выполнение задачи ${batchId}.`);
        } else {
          addLog('Уже выполняется другой запуск.');
        }
        return;
      }

      let lockAcquired = await QueueLockService.acquire(ownerIdRef.current, batchId);
      if (!lockAcquired) {
        const activeLock = await QueueLockService.getLock();
        if (activeLock && activeLock.batchId !== batchId) {
          const confirmed = window.confirm(`Сейчас выполняется задача ${activeLock.batchId}. Остановить ее и запустить новую?`);
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

      const storedQueueSize = await StorageService.getTestQueue();
      maxConcurrentTestsRef.current = clampV2TestQueue(storedQueueSize);

      const resumeFrom = Math.max(0, Math.min(options?.resumeFrom ?? 0, itemsToRun.length));
      if (resumeFrom > 0) {
        itemsToRun = itemsToRun.map((item, index) => {
          if (index >= resumeFrom || isTerminalStatus(item.status)) return item;
          return { ...item, status: 'FINISHED' as const, error: undefined };
        });
      }

      setQueue([...itemsToRun]);

      try {
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

        if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
          await requestNotificationPermission();
        }

        setCurrentBatchIds([]);

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

        const markLockLost = () => {
          if (forcedStopReason) return;
          forcedStopReason = 'lock_lost';
          forcedStopMessage = 'Тестирование остановлено: потерян lock очереди.';
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

        const setQueueItem = (index: number, patch: Partial<QueueItemV2>) => {
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

        const queueContains = (index: number) => pendingIndices.includes(index);

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

        const getErrorTrace = (error: unknown): VelesHttpTrace | undefined => {
          return typeof error === 'object' && error !== null
            ? (error as { trace?: VelesHttpTrace }).trace
            : undefined;
        };

        const logTestFailure = async (
          stage: 'launch' | 'status' | 'stats',
          index: number,
          item: QueueItemV2,
          error: unknown,
          status: QueueItemV2['status'],
          trace?: VelesHttpTrace,
          extra?: Record<string, unknown>
        ) => {
          const errorSummary = buildQueueErrorSummary({
            stage,
            index: index + 1,
            total,
            fallback: error,
            trace
          });
          const snapshotId = await LogService.createSnapshot(`queue.${stage}_failure`, {
            stage,
            batchId,
            index: index + 1,
            status,
            errorSummary,
            configHash: configHash(item.config as any),
            queueItem: {
              index: index + 1,
              name: item.config.name,
              configHash: configHash(item.config as any),
              payload: item.config
            },
            trace: trace ?? null,
            ...(extra ?? {})
          }, { batchId, runId: batchId, testId: String(index + 1) });

          await LogService.log({
            level: 'error',
            source: 'queue',
            event: 'test.failed',
            batchId,
            runId: batchId,
            testId: String(index + 1),
            stage,
            snapshotId,
            error: new Error(errorSummary),
            context: {
              batchId,
              index: index + 1,
              status,
              errorSummary,
              configHash: configHash(item.config as any),
              httpStatus: trace?.response?.status ?? null,
              url: trace?.url ?? null
            }
          });
        };

        const buildNoMarketDataMessage = (item: QueueItemV2): string => {
          return MarketDataHealthService.buildNoMarketDataMessage(item.config);
        };

        const checkNoMarketDataAfter5xx = async (item: QueueItemV2) => {
          try {
            const classification = await withContextRecovery(batchId, runContextRef, (ctx) =>
              MarketDataHealthService.classifyNoMarketDataAfterLaunch5xx(ctx.tabId, item.config)
            );
            return {
              noMarketData: classification.classification !== null,
              message: classification.message,
              probe: classification.candleProbe
            };
          } catch (error) {
            return {
              noMarketData: false,
              message: null,
              probe: {
                success: false,
                alive: null,
                candlesCount: null,
                error: error instanceof Error ? error.message : String(error),
                trace: getErrorTrace(error)
              }
            };
          }
        };

        const markNoMarketDataSymbol = async (
          index: number,
          item: QueueItemV2,
          message: string,
          launchTrace?: VelesHttpTrace,
          candleProbe?: unknown
        ) => {
          clearLaunchRetryState();
          const skipped = markNoMarketDataItems(itemsToRun, index, message, pendingIndices, (markedIndex) => {
            launchTransientRetryAttempts.delete(markedIndex);
          });
          commitQueueState();
          addLog(`Ошибка запуска теста ${index + 1}/${total}: ${message}`);
          if (skipped > 0) {
            addLog(`Пропущено тестов по этому активу: ${skipped}.`);
          }

          await logTestFailure('launch', index, item, new Error(message), 'ERROR', launchTrace, {
            classification: 'DELISTED_OR_NO_MARKET_DATA',
            candleProbe: candleProbe ?? null,
            skippedSameSymbol: skipped
          });
          await syncRunningProgress();
        };

        const logTestRetry = async (
          stage: 'launch' | 'status' | 'stats',
          index: number,
          item: QueueItemV2,
          reason: string,
          attempts: number,
          trace?: VelesHttpTrace
        ) => {
          const errorSummary = buildQueueErrorSummary({
            stage,
            index: index + 1,
            total,
            fallback: reason,
            trace
          });
          const snapshotId = await LogService.createSnapshot(`queue.${stage}_retry`, {
            stage,
            batchId,
            index: index + 1,
            reason,
            attempts,
            errorSummary,
            configHash: configHash(item.config as any),
            queueItem: {
              index: index + 1,
              name: item.config.name,
              configHash: configHash(item.config as any),
              payload: item.config
            },
            trace: trace ?? null
          }, { batchId, runId: batchId, testId: String(index + 1) });

          await LogService.log({
            level: 'warn',
            source: 'queue',
            event: 'test.retry',
            batchId,
            runId: batchId,
            testId: String(index + 1),
            stage,
            snapshotId,
            context: {
              batchId,
              index: index + 1,
              reason,
              attempts,
              errorSummary,
              configHash: configHash(item.config as any),
              httpStatus: trace?.response?.status ?? null,
              url: trace?.url ?? null
            }
          });
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
        addLog(`Запуск очереди V2: ${calculateCompletedTests(itemsToRun)}/${total}`);
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

        const finalizeActiveRun = async (index: number, runState: ActiveRunState): Promise<boolean> => {
          const item = itemsToRun[index];
          if (!item) {
            activeRuns.delete(index);
            clearStatusNetworkRetry(index);
            return true;
          }

          let statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
            VelesServiceV2.getStats(ctx.tabId, runState.velesId)
          );

          if (!statsRes.success || !statsRes.stats) {
            if (!(await waitWithLockHeartbeat(10000))) {
              return false;
            }

            statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
              VelesServiceV2.getStats(ctx.tabId, runState.velesId)
            );
          }

          if ((!statsRes.success || !statsRes.stats) && statsRes.trace) {
            await logTestFailure(
              'stats',
              index,
              item,
              new Error(statsRes.error || 'Stats request failed'),
              'ERROR',
              statsRes.trace
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
            configHash: configHash(item.config as any)
          }, batchId);

          await syncRunningProgress();
          return true;
        };

        const statusChecksInFlight = new Set<number>();
        const finalizeInFlight = new Set<number>();

        const shouldContinueLoops = () =>
          !forcedStopReason &&
          !stopRef.current &&
          calculateCompletedTests(itemsToRun) < total;

        const ensureRunCanContinue = async (): Promise<boolean> => {
          if (!(await touchLock())) {
            markLockLost();
            return false;
          }

          await pullExternalStop(batchId);
          if (stopRef.current) {
            if (!forcedStopReason) {
              forcedStopReason = 'manual_stop';
              forcedStopMessage = 'Остановлено пользователем';
            }
            return false;
          }

          return true;
        };

        const launchLoop = async () => {
          while (shouldContinueLoops()) {
            if (!(await ensureRunCanContinue())) {
              break;
            }

            const now = Date.now();
            const launchBlockedByRetry = isLaunchRetryBlocked(now);
            const canLaunchByCapacity =
              pendingIndices.length > 0 &&
              activeRuns.size < maxConcurrentTestsRef.current &&
              !launchBlockedByRetry;
            const nextAllowedLaunchAt = lastLaunchAt > 0 ? lastLaunchAt + getMinTestInterval() : 0;
            const launchIntervalRemainingMs = canLaunchByCapacity && nextAllowedLaunchAt > now
              ? nextAllowedLaunchAt - now
              : 0;

            if (launchIntervalRemainingMs > 0 && nextAllowedLaunchAt !== lastIntervalPauseLogTargetAt) {
              lastIntervalPauseLogTargetAt = nextAllowedLaunchAt;
              addLog(`Пауза ${Math.ceil(launchIntervalRemainingMs / 1000)}с перед следующим тестом...`);
            }

            if (!canLaunchByCapacity || (lastLaunchAt !== 0 && now - lastLaunchAt < getMinTestInterval())) {
              const fullWaitCompleted = await waitWithLockHeartbeat(WAIT_CHUNK_MS);
              if (!fullWaitCompleted && !forcedStopReason) {
                stopRef.current = true;
              }
              continue;
            }

            const index = pendingIndices.shift();
            if (index === undefined || !itemsToRun[index] || itemsToRun[index].status !== 'PENDING') {
              continue;
            }

            const item = itemsToRun[index];
            const testName = `Тест ${index + 1}/${total}`;
            addLog(`${testName}: запуск теста...`);
            setQueueItem(index, { status: 'RUNNING', error: undefined });
            await LogService.info('queue', 'test.start', {
              batchId,
              index: index + 1,
              configHash: configHash(item.config as any)
            }, batchId);

            try {
              const result = await withContextRecovery(batchId, runContextRef, (ctx) =>
                VelesServiceV2.runTest(ctx.tabId, ctx.token, item.config)
              );

              if (!result.success) {
                const parsed = parseApiError(result.error || '');
                const userErrorSummary = buildQueueErrorSummary({
                  stage: 'launch',
                  index: index + 1,
                  total,
                  fallback: parsed.message,
                  trace: result.trace
                });
                if (isBacktestNameTooLongError(result.trace)) {
                  clearLaunchRetryState();
                  launchTransientRetryAttempts.delete(index);
                  setQueueItem(index, { status: 'ERROR', error: userErrorSummary });
                  addLog(userErrorSummary);
                  await logTestFailure('launch', index, item, new Error(userErrorSummary), 'ERROR', result.trace);
                  await syncRunningProgress();
                  forcedStopReason = 'runtime_error';
                  forcedStopMessage = getBacktestNameTooLongStopMessage();
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                  break;
                }
                if (isRateLimit429(parsed)) {
                  addLog(userErrorSummary);
                  await logTestRetry('launch', index, item, 'RATE_LIMIT_429', 1, result.trace);
                  launchTransientRetryAttempts.delete(index);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  scheduleLaunchRetry(index, 'RATE_LIMIT_429', 1, Date.now() + RETRY_429_COOLDOWN_MS, null);
                  refreshLiveQueueStatus();
                  addLog('Пауза 35с после 429. Повторяю запуск текущего теста...');
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                  continue;
                }

                if (isQueueLimit412(parsed)) {
                  addLog(userErrorSummary);
                  const waitForActiveBelow = activeRuns.size > 0 ? activeRuns.size : null;
                  await logTestRetry('launch', index, item, 'QUEUE_LIMIT_412', 1, result.trace);
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
                  setQueueItem(index, { status: 'ERROR', error: userErrorSummary });
                  addLog(userErrorSummary);
                  await logTestFailure('launch', index, item, new Error(userErrorSummary), 'ERROR', result.trace);
                  await syncRunningProgress();
                  if (isBacktestNameTooLongError(result.trace)) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = getBacktestNameTooLongStopMessage();
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                    break;
                  }
                  continue;
                }

                if (isServer5xx(parsed)) {
                  const marketDataProbe = await checkNoMarketDataAfter5xx(item);
                  if (marketDataProbe.noMarketData) {
                    const noMarketDataMessage = marketDataProbe.message ?? buildNoMarketDataMessage(item);
                    await markNoMarketDataSymbol(
                      index,
                      item,
                      noMarketDataMessage,
                      result.trace,
                      marketDataProbe.probe
                    );
                    continue;
                  }

                  const attempts = (launchTransientRetryAttempts.get(index) ?? 0) + 1;
                  launchTransientRetryAttempts.set(index, attempts);

                  if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = 'Veles возвращает HTTP 5xx при запуске теста более 10 минут.';
                    addLog(`Очередь остановлена: ${forcedStopMessage}`);
                    await logTestFailure('launch', index, item, new Error(userErrorSummary), 'ERROR', result.trace);
                    await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                    break;
                  }

                  await logTestRetry('launch', index, item, 'SERVER_5XX', attempts, result.trace);
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  scheduleLaunchRetry(index, 'SERVER_5XX', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                  refreshLiveQueueStatus();
                  addLog(`Veles вернул HTTP ${parsed.status ?? '5xx'} при запуске теста. Повтор через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                  continue;
                }

                const status: QueueItemV2['status'] = 'ERROR';
                clearLaunchRetryState();
                launchTransientRetryAttempts.delete(index);
                setQueueItem(index, { status, error: userErrorSummary });
                addLog(userErrorSummary);
                await logTestFailure('launch', index, item, new Error(userErrorSummary), status, result.trace);
                await syncRunningProgress();
                continue;
              }

              const launchedAt = Date.now();
              lastLaunchAt = launchedAt;
              clearLaunchRetryState();
              launchTransientRetryAttempts.delete(index);
              const velesId = result.id!;
              activeRuns.set(index, {
                velesId,
                index,
                testName,
                launchedAt,
                launchAttemptStartedAt: launchedAt
              });
              refreshLiveQueueStatus();
              await syncRunningProgress();
            } catch (error) {
              const rawMsg = extractErrorMessage(error);
              const rawSummary = buildQueueErrorSummary({
                stage: 'launch',
                index: index + 1,
                total,
                fallback: rawMsg,
                trace: getErrorTrace(error)
              });

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

              if (isFailedToFetchError(rawMsg)) {
                const previousAttempts = launchTransientRetryAttempts.get(index) ?? 0;
                const attempts = previousAttempts + 1;

                if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                  forcedStopReason = 'runtime_error';
                  forcedStopMessage = 'Сеть не доступна более 10 мин.';
                  launchTransientRetryAttempts.delete(index);
                  await logTestFailure('launch', index, item, error, 'ERROR', getErrorTrace(error));
                  setQueueItem(index, { status: 'PENDING', error: undefined });
                  scheduleLaunchRetry(index, 'NETWORK_FAILED_FETCH', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                  addLog(`Ошибка: ${rawMsg}`);
                  addLog(`Ошибка: ${forcedStopMessage}`);
                  await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);
                  break;
                }

                launchTransientRetryAttempts.set(index, attempts);
                await logTestRetry('launch', index, item, 'NETWORK_FAILED_FETCH', attempts, getErrorTrace(error));
                setQueueItem(index, { status: 'PENDING', error: undefined });
                scheduleLaunchRetry(index, 'NETWORK_FAILED_FETCH', attempts, Date.now() + NETWORK_RETRY_WAIT_MS, null);
                refreshLiveQueueStatus();
                addLog(`Ошибка: ${rawMsg}`);
                addLog(`Сеть недоступна. Повтор запуска через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'RUN', lastLaunchAt);
                continue;
              }

              const status: QueueItemV2['status'] = rawMsg.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR';
              clearLaunchRetryState();
              launchTransientRetryAttempts.delete(index);
              setQueueItem(index, { status, error: rawSummary });

              addLog(rawSummary);
              await logTestFailure('launch', index, item, error, status, getErrorTrace(error));

              await syncRunningProgress();
            }
          }
        };

        const pollLoop = async () => {
          while (shouldContinueLoops()) {
            if (activeRuns.size === 0) {
              await delay(WAIT_CHUNK_MS);
              continue;
            }

            const waitForPollMs = Math.max(0, STATUS_POLL_INTERVAL_MS - (Date.now() - lastPollAt));
            if (waitForPollMs > 0) {
              await delay(Math.min(WAIT_CHUNK_MS, waitForPollMs));
              continue;
            }

            lastPollAt = Date.now();

            const tasks = Array.from(activeRuns.entries()).map(async ([index, runState]) => {
              if (
                forcedStopReason ||
                stopRef.current ||
                statusChecksInFlight.has(index) ||
                finalizeInFlight.has(index)
              ) {
                return;
              }

              const item = itemsToRun[index];
              if (!item) {
                activeRuns.delete(index);
                clearStatusNetworkRetry(index);
                return;
              }

              const now = Date.now();
              const statusRetryAt = statusNetworkRetryAt.get(index) ?? 0;
              if (statusRetryAt > 0 && now < statusRetryAt) {
                return;
              }

              statusChecksInFlight.add(index);

              try {
                const check = await withContextRecovery(batchId, runContextRef, (ctx) =>
                  VelesServiceV2.checkStatus(ctx.tabId, ctx.token, runState.velesId)
                );

                if (!check.success && check.trace) {
                  throw Object.assign(new Error(`Status request failed: ${String(check.error)}`), { trace: check.trace });
                }
                if (!check.success) {
                  throw new Error(`Ошибка проверки статуса: ${String(check.error)}`);
                }

                clearStatusNetworkRetry(index);

                if (!check.data) {
                  return;
                }

                const status = check.data.status;
                if (status === 'FINISHED') {
                  statusChecksInFlight.delete(index);
                  finalizeInFlight.add(index);
                  try {
                    const completed = await finalizeActiveRun(index, runState);
                    if (!completed && !forcedStopReason) {
                      stopRef.current = true;
                    }
                  } finally {
                    finalizeInFlight.delete(index);
                  }
                  return;
                }

                if (status === 'ERROR' || status === 'FAILED') {
                  throw new Error(check.data.error || 'Тест завершился с ошибкой');
                }

                if (Date.now() - runState.launchedAt > MAX_TEST_DURATION_MS) {
                  const timeoutMessage = `TIMEOUT: тест не завершился за ${MAX_TEST_DURATION_MINUTES} минут`;
                  activeRuns.delete(index);
                  clearStatusNetworkRetry(index);
                  setQueueItem(index, { status: 'TIMEOUT', error: timeoutMessage });
                  addLog(`Ошибка: ${timeoutMessage}`);
                  refreshLiveQueueStatus();
                  await syncRunningProgress();
                }
              } catch (error) {
                const rawMsg = extractErrorMessage(error);
                const statusSummary = buildQueueErrorSummary({
                  stage: 'status',
                  index: index + 1,
                  total,
                  fallback: rawMsg,
                  trace: getErrorTrace(error)
                });

                if (rawMsg.startsWith('QUEUE_STOP:')) {
                  const reason = rawMsg.includes('no_token')
                    ? 'no_token'
                    : rawMsg.includes('unauthorized')
                      ? 'unauthorized'
                      : 'no_tab';
                  forcedStopReason = reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(reason);
                  return;
                }

                if (isUnauthorizedError(error)) {
                  ConnectionService.invalidate();
                  addLog('Потеря авторизации (401). Ожидание восстановления подключения...');
                  const recovered = await resolveExecutionContext(batchId);

                  if (recovered.context) {
                    runContextRef.current = recovered.context;
                    addLog('Подключение восстановлено. Продолжаю ожидание...');
                    return;
                  }

                  forcedStopReason = recovered.reason;
                  forcedStopMessage = ConnectionService.reasonToMessage(recovered.reason);
                  return;
                }

                if (isFailedToFetchError(rawMsg)) {
                  const attempts = (statusNetworkRetryAttempts.get(index) ?? 0) + 1;
                  statusNetworkRetryAttempts.set(index, attempts);

                  if (attempts >= NETWORK_MAX_RETRY_ATTEMPTS) {
                    forcedStopReason = 'runtime_error';
                    forcedStopMessage = 'Сеть не доступна более 10 мин.';
                    await logTestFailure('status', index, item, error, 'ERROR', getErrorTrace(error));
                    addLog(`Ошибка: ${rawMsg}`);
                    addLog(`Ошибка: ${forcedStopMessage}`);
                    return;
                  }

                  await logTestRetry('status', index, item, 'NETWORK_FAILED_FETCH', attempts, getErrorTrace(error));
                  statusNetworkRetryAt.set(index, Date.now() + NETWORK_RETRY_WAIT_MS);
                  addLog(`Ошибка: ${rawMsg}`);
                  addLog(`${runState.testName}: повторная проверка статуса через 60с (${attempts}/${NETWORK_MAX_RETRY_ATTEMPTS})...`);
                  return;
                }

                activeRuns.delete(index);
                clearStatusNetworkRetry(index);
                setQueueItem(index, { status: 'ERROR', error: statusSummary });

                addLog(statusSummary);
                refreshLiveQueueStatus();
                await logTestFailure('status', index, item, error, 'ERROR', getErrorTrace(error));
                await syncRunningProgress();
              } finally {
                statusChecksInFlight.delete(index);
              }
            });

            if (tasks.length > 0) {
              await Promise.allSettled(tasks);
            }
          }
        };

        await Promise.all([launchLoop(), pollLoop()]);
        if (forcedStopReason || stopRef.current) {
          const reason: BatchStopReason = forcedStopReason ?? 'manual_stop';
          const completed = calculateCompletedTests(itemsToRun);

          await StorageService.updateBatchRunState(batchId, 'STOP', {
            completedTests: completed,
            stopReason: reason,
            lastError: forcedStopMessage
          });

          await saveRuntimeCheckpoint(batchId, itemsToRun, activeRuns, 'STOP', lastLaunchAt);

          const stopMessage = forcedStopMessage || 'Остановлено. Продолжите запуск из истории.';
          const isConnectionStop = ['no_tab', 'no_token', 'unauthorized'].includes(reason);
          addLog(isConnectionStop ? `Остановка: ${stopMessage}` : stopMessage);
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

      if (runtime.apiVersion !== 'v2') {
        addLog('Этот запуск был создан на старом API V1 и не может быть продолжен в Конфигураторе 2.0.');
        return;
      }

      const v2Interval = await StorageService.getV2IntervalSeconds();
      setMinTestInterval(v2Interval * 1000);

      const regenerated = buildResumeQueue(batchId, batch.resumeSource, ConfigGeneratorV2 as unknown as { generate: (staticConfig: unknown, entry: unknown, orders: unknown, exits: unknown, temp: string) => { configs: Array<Record<string, unknown>> } });
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
        await run(batchId, regenerated as QueueItemV2[]);
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

        await run(batchId, prepared as QueueItemV2[], resumeOptions);
      } else {
        addLog(`Восстановление состояния: 0/${runtime.total}`);
        await run(batchId, regenerated as QueueItemV2[]);
      }
    },
    [addLog, run]
  );

  const getQueue = useCallback(() => queue, [queue]);

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
