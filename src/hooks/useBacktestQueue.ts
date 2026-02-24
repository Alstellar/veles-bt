import { useState, useRef, useCallback, useEffect } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../types/veles';
import type { BatchResumeSource, BatchStopReason, StaticConfig } from '../types';
import { StorageService } from '../services/StorageService';
import { DatabaseService } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';
import { LogService } from '../services/LogService';
import { configHash } from '../utils/configHash';
import { QueueLockService } from '../services/QueueLockService';
import { ConfigGenerator } from '../services/ConfigGenerator';
import { ConnectionService } from '../services/ConnectionService';

export interface QueueItem {
  id: string;
  config: VelesConfigPayload;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number;
}

interface ExecutionContext {
  tabId: number;
  token: string;
}

interface RunOptions {
  resumeFrom?: number;
}

const RETRY_WAIT_MS = 60000;
const RETRY_MAX_ATTEMPTS = 3;
const MIN_TEST_INTERVAL_MS = 31000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoTabError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('No tab with id');
}

function isUnauthorizedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Unauthorized') || msg.includes('"status":401') || msg.includes('401');
}

function buildResumeQueue(batchId: string, resumeSource: BatchResumeSource): QueueItem[] {
  const staticConfig: StaticConfig = {
    ...resumeSource.staticConfig,
    dateFrom: new Date(resumeSource.staticConfig.dateFrom),
    dateTo: new Date(resumeSource.staticConfig.dateTo)
  };

  const { configs } = ConfigGenerator.generate(
    staticConfig,
    resumeSource.entryConfig,
    resumeSource.orderState,
    resumeSource.exitConfig,
    '#TEMP'
  );

  return configs.map((cfg) => ({
    id: crypto.randomUUID(),
    config: { ...cfg, name: cfg.name.replace('#TEMP', batchId) },
    status: 'PENDING'
  }));
}

export function useBacktestQueue() {
  const MAX_LOGS = 400;

  const [queue, setQueue] = useState<QueueItem[]>([]);
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

  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current;
      void QueueLockService.release(ownerIdRef.current);
    };
  }, []);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const line = `[${ts}] ${msg}`;

    setLogs((prev) => {
      const next = [...prev, line];
      if (next.length <= MAX_LOGS) return next;
      return next.slice(next.length - MAX_LOGS);
    });

    setStatusMessage(line);
  }, []);

  const addItems = useCallback((items: QueueItem[]) => {
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setProgress({ current: 0, total: 0 });
    setCurrentBatchIds([]);
    setStatusMessage('');
    setLogs([]);
    document.title = originalTitleRef.current;
  }, []);

  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message.replace(/^Error:\s*/, '');
    }
    return String(error).replace(/^Error:\s*/, '');
  };

  const sendNotification = (title: string, body: string) => {
    if (!notificationsEnabled || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-128.png' });
    }
  };

  const saveRuntimeCheckpoint = useCallback(
    async (batchId: string, nextIndex: number, total: number, status: 'RUN' | 'STOP') => {
      await StorageService.saveBatchRuntime({
        batchId,
        nextIndex,
        total,
        status,
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

  const stop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
    addLog('Выполнение остановлено. Можно продолжить позже.');
    document.title = originalTitleRef.current;

    const batchId = currentBatchIdRef.current;
    if (batchId) {
      void StorageService.updateBatchRunState(batchId, 'STOP', {
        stopReason: 'manual_stop'
      });
    }

    void QueueLockService.release(ownerIdRef.current);
    void LogService.warn('queue', 'queue.stop_requested');
  }, [addLog]);

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
    async (batchId: string, initialItems?: QueueItem[], options?: RunOptions) => {
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
        } else {
          addLog('Уже выполняется другой запуск. Параллельный запуск заблокирован.');
        }
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
      setLogs([]);
      setCurrentBatchIds([]);
      originalTitleRef.current = document.title;
      await QueueLockService.clearStopRequest(batchId);

      let itemsToRun = initialItems || queue;
      if (itemsToRun.length === 0) {
        addLog('Очередь пуста.');
        await QueueLockService.release(ownerIdRef.current);
        setIsRunning(false);
        return;
      }

      if (initialItems) {
        setQueue(initialItems);
      }

      const startIndex = Math.max(0, Math.min(options?.resumeFrom ?? 0, itemsToRun.length));
      let nextIndex = startIndex;

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
          await QueueLockService.refresh(ownerIdRef.current);
          return true;
        };

        if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }

        const batchMeta = await StorageService.getBatchById(batchId);
        setCurrentBatchIds(batchMeta?.velesIds ?? []);

        const resolved = await resolveExecutionContext(batchId);
        if (!resolved.context) {
          const connectionError =
            resolved.reason === 'no_tab'
              ? 'Вкладка Veles не найдена'
              : resolved.reason === 'no_token'
                ? 'Токен Veles не найден'
                : 'Авторизация в Veles не подтверждена';

          await StorageService.updateBatchRunState(batchId, 'STOP', {
            stopReason: resolved.reason,
            completedTests: Math.max(startIndex, batchMeta?.completedTests ?? 0),
            lastError: connectionError
          });

          await saveRuntimeCheckpoint(batchId, startIndex, itemsToRun.length, 'STOP');
          addLog('Выполнение остановлено: откройте Veles и продолжите запуск из истории.');
          return;
        }

        const runContextRef = { current: resolved.context };

        await StorageService.updateBatchRunState(batchId, 'RUN', {
          completedTests: startIndex,
          stopReason: undefined,
          lastError: undefined
        });

        await saveRuntimeCheckpoint(batchId, startIndex, itemsToRun.length, 'RUN');

        const total = itemsToRun.length;
        setProgress({ current: startIndex, total });
        addLog(`Запуск очереди: ${startIndex}/${total}`);

        let forcedStopReason: BatchStopReason | null = null;
        let forcedStopMessage: string | undefined;

        for (let i = startIndex; i < total; i++) {
          if (!(await touchLock())) {
            forcedStopReason = 'manual_stop';
            forcedStopMessage = 'Запуск остановлен (перехвачен новым процессом).';
            break;
          }

          await pullExternalStop(batchId);

          if (stopRef.current) {
            forcedStopReason = 'manual_stop';
            forcedStopMessage = 'Остановлено пользователем';
            break;
          }

          const currentTestNum = i + 1;
          const item = itemsToRun[i];

          if (item.status === 'FINISHED') {
            nextIndex = i + 1;
            setProgress({ current: currentTestNum, total });
            continue;
          }

          const percent = Math.round((currentTestNum / total) * 100);
          document.title = `[${percent}%] Тест ${currentTestNum}/${total}`;
          setProgress({ current: currentTestNum, total });

          setQueue((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], status: 'RUNNING', error: undefined };
            itemsToRun = next;
            return next;
          });

          await saveRuntimeCheckpoint(batchId, i, itemsToRun.length, 'RUN');

          const testName = `Тест ${currentTestNum}/${total}`;
          addLog(`${testName}: запуск...`);

          let launchAttemptStartedAt = Date.now();
          let retryCurrentItem = false;
          try {
            const runRes = await withContextRecovery(batchId, runContextRef, (ctx) => {
              launchAttemptStartedAt = Date.now();
              return VelesService.runTest(ctx.tabId, ctx.token, item.config);
            });

            if (!runRes.success || !runRes.id) {
              throw new Error(runRes.error || `Ошибка запуска (${runRes.status})`);
            }

            const velesId = runRes.id;
            addLog(`${testName}: выполняется (ID: ${velesId})...`);

            const pollingStart = Date.now();
            const maxPollingTime = 5 * 60 * 1000;
            let isFinished = false;

            while (!isFinished) {
              await pullExternalStop(batchId);

              if (stopRef.current) {
                forcedStopReason = 'manual_stop';
                forcedStopMessage = 'Остановлено пользователем';
                break;
              }

              if (Date.now() - pollingStart > maxPollingTime) {
                throw new Error('TIMEOUT: тест не завершился за 5 минут');
              }

              if (!(await touchLock())) {
                forcedStopReason = 'manual_stop';
                forcedStopMessage = 'Запуск остановлен (перехвачен новым процессом).';
                break;
              }

              await delay(1000);

              const check = await withContextRecovery(batchId, runContextRef, (ctx) =>
                VelesService.checkStatus(ctx.tabId, ctx.token, velesId)
              );

              if (!check.success) {
                throw new Error(`Ошибка проверки статуса: ${String(check.error)}`);
              }

              if (check.data) {
                const status = check.data.status;
                if (status === 'FINISHED') {
                  isFinished = true;
                }
                if (status === 'ERROR' || status === 'FAILED') {
                  throw new Error(check.data.error || 'Тест завершился с ошибкой');
                }
              }
            }

            if (forcedStopReason) {
              setQueue((prev) => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], status: 'PENDING', error: undefined };
                itemsToRun = next;
                return next;
              });
              break;
            }

            addLog(`${testName}: сбор статистики...`);
            if (!(await touchLock())) {
              forcedStopReason = 'manual_stop';
              forcedStopMessage = 'Запуск остановлен (перехвачен новым процессом).';
              break;
            }
            await delay(5000);

            let statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
              VelesService.getStats(ctx.tabId, velesId)
            );

            if (!statsRes.success || !statsRes.stats) {
              addLog(`${testName}: повторный запрос статистики через 10с...`);
              await delay(10000);
              statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
                VelesService.getStats(ctx.tabId, velesId)
              );
            }

            if (!statsRes.success || !statsRes.stats) {
              throw new Error(statsRes.error || 'Не удалось получить статистику');
            }

            const stats = statsRes.stats;
            const resultItem: BacktestResultItem = {
              id: velesId,
              name: item.config.name,
              date: new Date().toISOString(),
              from: item.config.from,
              to: item.config.to,
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
              avgDuration: stats.avgDuration
            };

            await DatabaseService.saveTests([resultItem]);
            await StorageService.addTestIdToBatch(batchId, velesId);
            setCurrentBatchIds((prev) => (prev.includes(velesId) ? prev : [...prev, velesId]));

            setQueue((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], status: 'FINISHED', resultId: velesId };
              itemsToRun = next;
              return next;
            });

            nextIndex = i + 1;
            await StorageService.updateBatchRunState(batchId, 'RUN', {
              completedTests: nextIndex
            });
            await saveRuntimeCheckpoint(batchId, nextIndex, itemsToRun.length, 'RUN');

            addLog(`${testName}: готово`);
            await LogService.info('queue', 'test.finished', {
              batchId,
              index: currentTestNum,
              velesId,
              configHash: configHash(item.config)
            }, batchId);
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

              await saveRuntimeCheckpoint(batchId, i, itemsToRun.length, 'STOP');
              break;
            }

            if (isUnauthorizedError(rawMsg)) {
              ConnectionService.invalidate();
              addLog('Потеря авторизации (401). Ожидание восстановления подключения...');
              const recovered = await resolveExecutionContext(batchId);

              if (recovered.context) {
                runContextRef.current = recovered.context;
                addLog('Подключение восстановлено. Повторяю запуск текущего теста...');
                retryCurrentItem = true;
                continue;
              }

              forcedStopReason = recovered.reason;
              forcedStopMessage = ConnectionService.reasonToMessage(recovered.reason);
              await saveRuntimeCheckpoint(batchId, i, itemsToRun.length, 'STOP');
              break;
            }

            const status: QueueItem['status'] = rawMsg.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR';

            setQueue((prev) => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], status, error: rawMsg };
              itemsToRun = next;
              return next;
            });

            addLog(`Ошибка: ${rawMsg}`);
            await LogService.error('queue', 'test.failed', error, {
              batchId,
              index: currentTestNum,
              status,
              configHash: configHash(item.config)
            }, batchId);
          } finally {
            await touchLock();
            if (retryCurrentItem) {
              i -= 1;
              continue;
            }
            const elapsed = Date.now() - launchAttemptStartedAt;
            const remaining = MIN_TEST_INTERVAL_MS - elapsed;
            if (remaining > 0 && !stopRef.current && i < total - 1) {
              const waitSec = Math.ceil(remaining / 1000);
              addLog(`Пауза ${waitSec}с перед следующим тестом...`);
              await delay(remaining);
            }
          }
        }

        if (forcedStopReason || stopRef.current) {
          const reason = forcedStopReason ?? 'manual_stop';
          const nextIndexForStop = Math.min(nextIndex, itemsToRun.length);

          await StorageService.updateBatchRunState(batchId, 'STOP', {
            completedTests: nextIndexForStop,
            stopReason: reason,
            lastError: forcedStopMessage
          });

          await saveRuntimeCheckpoint(batchId, nextIndexForStop, itemsToRun.length, 'STOP');
          addLog(forcedStopMessage || 'Остановлено. Продолжите запуск из истории.');
        } else {
          await StorageService.updateBatchRunState(batchId, 'DONE', {
            completedTests: itemsToRun.length,
            stopReason: undefined,
            lastError: undefined
          });
          await StorageService.removeBatchRuntime(batchId);

          addLog('Очередь завершена.');
          sendNotification('Veles Helper', 'Тесты завершены: ' + itemsToRun.length);
          await LogService.info('queue', 'queue.finished', { batchId, total: itemsToRun.length }, batchId);
        }
      } catch (error) {
        const message = extractErrorMessage(error);
        addLog(`Критическая ошибка: ${message}`);

        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'runtime_error',
          lastError: message
        });

        await saveRuntimeCheckpoint(batchId, Math.min(nextIndex, itemsToRun.length), itemsToRun.length, 'STOP');
        await LogService.critical('queue', 'queue.crashed', error, { batchId }, batchId);
      } finally {
        setIsRunning(false);
        document.title = originalTitleRef.current;
        currentBatchIdRef.current = null;
        setCurrentBatchId(null);
        await QueueLockService.release(ownerIdRef.current);
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
      withContextRecovery
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

      if (runtime.items && runtime.items.length > 0) {
        addLog('Не удалось продолжить: обнаружен устаревший формат состояния запуска.');
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'runtime_error',
          lastError: 'Legacy runtime format is not supported'
        });
        return;
      }

      const batch = await StorageService.getBatchById(batchId);
      if (!batch || !batch.resumeSource) {
        addLog('Нет исходной конфигурации для продолжения этого запуска.');
        return;
      }

      const regenerated = buildResumeQueue(batchId, batch.resumeSource);
      const expectedTotal = runtime.total || regenerated.length;
      if (regenerated.length !== expectedTotal) {
        addLog('Не удалось продолжить: изменился набор комбинаций (порядок или количество).');
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'runtime_error',
          lastError: 'Resume mismatch: generated combinations count differs'
        });
        return;
      }

      const nextIndex = Math.max(0, Math.min(runtime.nextIndex, regenerated.length));
      const prepared = regenerated.map((item, idx) => (
        idx < nextIndex
          ? { ...item, status: 'FINISHED' as const }
          : item
      ));

      await run(batchId, prepared, { resumeFrom: nextIndex });
    },
    [addLog, run]
  );

  return {
    queue,
    addItems,
    clearQueue,
    run,
    resume,
    stop,
    isRunning,
    progress,
    statusMessage,
    currentBatchIds,
    currentBatchId,
    logs,
    notificationsEnabled,
    setNotificationsEnabled
  };
}

export type BacktestQueueController = ReturnType<typeof useBacktestQueue>;
