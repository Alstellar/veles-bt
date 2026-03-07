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
  sourceTemplateUrl?: string;
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
const PRECHECK_INTERVAL_MS = 1500;
const WAIT_CHUNK_MS = 250;
const LOCK_HEARTBEAT_MS = 2000;
const FREEZE_WARN_THRESHOLD_MS = 60000;

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

const LOG_PREFIXES = ['🚀', '⏳', '📊', '✅', '⚠️', '⛔', '❌', '🛑', '🔐', '🔄'] as const;

function decorateQueueLogMessage(message: string): string {
  if (LOG_PREFIXES.some((prefix) => message.startsWith(`${prefix} `))) {
    return message;
  }

  const text = message.trim();

  if (
    /^Запуск очереди:/u.test(text) ||
    /^Тест \d+\/\d+: запуск/u.test(text) ||
    /^Продолжаю выполнение задачи/u.test(text) ||
    /^Останавливаю активную задачу/u.test(text) ||
    /^Предыдущая задача остановлена/u.test(text)
  ) {
    return `🚀 ${message}`;
  }

  if (
    /выполняется \(ID:/u.test(text) ||
    /^Пауза \d+с/u.test(text) ||
    /через \d+с/u.test(text)
  ) {
    return `⏳ ${message}`;
  }

  if (/сбор статистики/u.test(text) || /повторный запрос статистики/u.test(text)) {
    return `📊 ${message}`;
  }

  if (/^Очередь завершена\./u.test(text) || /: готово$/u.test(text)) {
    return `✅ ${message}`;
  }

  if (/ошибка валидации конфигурации/u.test(text)) {
    return `⛔ ${message}`;
  }

  if (
    /не найден API-ключ/u.test(text) ||
    /Проверка Veles недоступна/u.test(text) ||
    /Запрос проверки Veles отклонен/u.test(text) ||
    /вернула неожиданный результат/u.test(text)
  ) {
    return `⚠️ ${message}`;
  }

  if (/Потеря авторизации/u.test(text)) {
    return `🔐 ${message}`;
  }

  if (/Подключение восстановлено/u.test(text) || /Повторяю запуск/u.test(text)) {
    return `🔄 ${message}`;
  }

  if (/остановлен/u.test(text) || /Остановлено/u.test(text) || /команда остановки/u.test(text)) {
    return `🛑 ${message}`;
  }

  if (/^Ошибка:/u.test(text) || /^Критическая ошибка:/u.test(text) || /^Не удалось/u.test(text)) {
    return `❌ ${message}`;
  }

  return message;
}

function buildTestLaunchLogMessage(testName: string, item: QueueItem): string {
  const symbol = String(item.config.symbol || '').trim().toUpperCase();
  const templateLink = typeof item.sourceTemplateUrl === 'string'
    ? item.sourceTemplateUrl.trim()
    : '';
  const safeSymbol = symbol || 'UNKNOWN';

  return templateLink
    ? `${testName}: запуск ${safeSymbol} на шаблоне ${templateLink}...`
    : `${testName}: запуск ${safeSymbol}...`;
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
  const [validationEnabled, setValidationEnabled] = useState(true);

  const stopRef = useRef(false);
  const originalTitleRef = useRef(document.title);
  const ownerIdRef = useRef(`runner_${crypto.randomUUID()}`);
  const currentBatchIdRef = useRef<string | null>(null);
  const lastPrecheckApiCallAtRef = useRef(0);
  const validationEnabledRef = useRef(true);
  const apiKeyByExchangeRef = useRef<Map<string, number>>(new Map());
  const apiKeysLoadedRef = useRef(false);

  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current;
      void QueueLockService.release(ownerIdRef.current, currentBatchIdRef.current ?? undefined);
    };
  }, []);

  useEffect(() => {
    validationEnabledRef.current = validationEnabled;
  }, [validationEnabled]);

  const setValidationEnabledRuntime = useCallback((enabled: boolean) => {
    validationEnabledRef.current = enabled;
    setValidationEnabled(enabled);
  }, []);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const decorated = decorateQueueLogMessage(msg);
    const line = `[${ts}] ${decorated}`;

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

  const waitPrecheckApiSlot = useCallback(async () => {
    const now = Date.now();
    const diff = now - lastPrecheckApiCallAtRef.current;
    if (diff < PRECHECK_INTERVAL_MS) {
      await delay(PRECHECK_INTERVAL_MS - diff);
    }
    lastPrecheckApiCallAtRef.current = Date.now();
  }, []);

  const normalizeSymbolKey = useCallback((value: string): string => {
    return value.trim().toUpperCase().replace('/', '');
  }, []);

  const normalizeExchangeKey = useCallback((value: string): string => {
    return value.trim().toUpperCase();
  }, []);

  const getApiKeyForExchange = useCallback(
    async (
      batchId: string,
      runRef: { current: ExecutionContext },
      exchange: string
    ): Promise<number | null> => {
      const exchangeKey = normalizeExchangeKey(exchange);
      if (!exchangeKey) return null;

      const cached = apiKeyByExchangeRef.current.get(exchangeKey);
      if (typeof cached === 'number') {
        return cached;
      }

      if (!apiKeysLoadedRef.current) {
        await waitPrecheckApiSlot();

        const apiKeys = await withContextRecovery(batchId, runRef, (ctx) =>
          VelesService.getApiKeys(ctx.tabId, ctx.token)
        );

        if (!apiKeys.success) {
          throw new Error(apiKeys.error || `HTTP ${apiKeys.status}`);
        }

        apiKeyByExchangeRef.current.clear();
        for (const keyItem of apiKeys.items) {
          const key = normalizeExchangeKey(keyItem.exchange);
          if (!key) continue;
          if (!apiKeyByExchangeRef.current.has(key)) {
            apiKeyByExchangeRef.current.set(key, keyItem.id);
          }
        }
        apiKeysLoadedRef.current = true;
      }

      return apiKeyByExchangeRef.current.get(exchangeKey) ?? null;
    },
    [normalizeExchangeKey, waitPrecheckApiSlot, withContextRecovery]
  );

  const buildValidateSymbolsPayload = useCallback((item: QueueItem, symbol: string, apiKey: number) => {
    const configAny = item.config as unknown as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      name: item.config.name,
      exchange: item.config.exchange,
      apiKey,
      algorithm: item.config.algorithm,
      pullUp: item.config.pullUp,
      portion: item.config.portion,
      commissions: item.config.commissions,
      deposit: item.config.deposit,
      conditions: item.config.conditions,
      settings: item.config.settings,
      profit: item.config.profit,
      stopLoss: item.config.stopLoss,
      public: item.config.public,
      symbols: [symbol]
    };

    if (typeof configAny.id === 'number') {
      payload.id = configAny.id;
    }

    return payload;
  }, []);

  const runRuntimePrecheck = useCallback(
    async (
      batchId: string,
      runRef: { current: ExecutionContext },
      item: QueueItem
    ): Promise<{ ok: boolean; message?: string; warning?: string }> => {
      const symbol = String(item.config.symbol || '').trim().toUpperCase();
      if (!symbol) {
        return { ok: false, message: 'некорректная конфигурация: не указан актив.' };
      }

      try {
        const apiKey = await getApiKeyForExchange(batchId, runRef, item.config.exchange);
        if (!apiKey) {
          return {
            ok: true,
            warning: `Для биржи ${item.config.exchange} не найден API-ключ. Проверка пропущена, тест отправлен в Veles.`
          };
        }

        await waitPrecheckApiSlot();
        const payload = buildValidateSymbolsPayload(item, symbol, apiKey);

        const validation = await withContextRecovery(batchId, runRef, (ctx) =>
          VelesService.validateSymbols(ctx.tabId, ctx.token, payload)
        );

        if (!validation.success) {
          const reason = validation.error || `HTTP ${validation.status}`;
          if (validation.status === 0 || validation.status >= 500) {
            return {
              ok: true,
              warning: `Проверка Veles недоступна (${reason}), тест отправлен в Veles.`
            };
          }
          return {
            ok: false,
            message: `Запрос проверки Veles отклонен (${reason}).`
          };
        }

        const failed = validation.failed.map(normalizeSymbolKey);
        const successful = validation.successful.map(normalizeSymbolKey);
        const symbolKey = normalizeSymbolKey(symbol);

        if (failed.includes(symbolKey)) {
          const templateLink = typeof item.sourceTemplateUrl === 'string'
            ? item.sourceTemplateUrl.trim()
            : '';
          return {
            ok: false,
            message: templateLink
              ? `Ошибка валидации конфигурации (${templateLink}) и актива ${symbol} на Veles.`
              : `Ошибка валидации конфигурации и актива ${symbol} на Veles.`
          };
        }

        if (successful.length > 0 && !successful.includes(symbolKey)) {
          return {
            ok: true,
            warning: `Проверка Veles вернула неожиданный результат для ${symbol}, тест отправлен в Veles.`
          };
        }

        return { ok: true };
      } catch (error) {
        const rawMsg = extractErrorMessage(error);
        if (rawMsg.startsWith('QUEUE_STOP:')) {
          throw error;
        }
        return {
          ok: true,
          warning: `Проверка Veles недоступна (${rawMsg}), тест отправлен в Veles.`
        };
      }
    },
    [
      addLog,
      buildValidateSymbolsPayload,
      extractErrorMessage,
      getApiKeyForExchange,
      normalizeSymbolKey,
      waitPrecheckApiSlot,
      withContextRecovery
    ]
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
      lastPrecheckApiCallAtRef.current = 0;
      apiKeyByExchangeRef.current.clear();
      apiKeysLoadedRef.current = false;
      originalTitleRef.current = document.title;
      await QueueLockService.clearStopRequest(batchId);

      let itemsToRun = initialItems || queue;
      if (itemsToRun.length === 0) {
        addLog('Очередь пуста.');
        await QueueLockService.release(ownerIdRef.current, batchId);
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
          return QueueLockService.refresh(ownerIdRef.current, batchId);
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

        for (let i = startIndex; i < total; i++) {
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
          addLog(buildTestLaunchLogMessage(testName, item));

          let launchAttemptStartedAt = Date.now();
          let minIntervalAfterIteration = MIN_TEST_INTERVAL_MS;
          let usedRemoteRun = false;
          let retryCurrentItem = false;
          try {
            if (validationEnabledRef.current) {
              const precheck = await runRuntimePrecheck(batchId, runContextRef, item);
              if (precheck.warning) {
                addLog(`${testName}: ${precheck.warning}`);
              }

              if (!precheck.ok) {
                const precheckMessage = precheck.message || 'Ошибка валидации конфигурации и актива на Veles.';
                setQueue((prev) => {
                  const next = [...prev];
                  if (next[i]) next[i] = { ...next[i], status: 'ERROR', error: precheckMessage };
                  itemsToRun = next;
                  return next;
                });

                addLog(`⛔ ${testName}: ${precheckMessage}`);
                await LogService.warn('queue', 'test.skipped_precheck', {
                  batchId,
                  index: currentTestNum,
                  symbol: item.config.symbol,
                  template: item.sourceTemplateUrl ?? null,
                  configHash: configHash(item.config)
                }, batchId);

                nextIndex = i + 1;
                await saveRuntimeCheckpoint(batchId, nextIndex, itemsToRun.length, 'RUN');
                minIntervalAfterIteration = PRECHECK_INTERVAL_MS;
                continue;
              }
            }

            const runRes = await withContextRecovery(batchId, runContextRef, (ctx) => {
              launchAttemptStartedAt = Date.now();
              return VelesService.runTest(ctx.tabId, ctx.token, item.config);
            });
            usedRemoteRun = true;

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
                if (!forcedStopReason) {
                  forcedStopReason = 'manual_stop';
                  forcedStopMessage = 'Остановлено пользователем';
                }
                break;
              }

              if (Date.now() - pollingStart > maxPollingTime) {
                throw new Error('TIMEOUT: тест не завершился за 5 минут');
              }

              if (!(await touchLock())) {
                markLockLost();
                break;
              }

              if (!(await waitWithLockHeartbeat(1000))) {
                break;
              }

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
              markLockLost();
              break;
            }
            if (!(await waitWithLockHeartbeat(5000))) {
              break;
            }

            let statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
              VelesService.getStats(ctx.tabId, velesId)
            );

            if (!statsRes.success || !statsRes.stats) {
              addLog(`${testName}: повторный запрос статистики через 10с...`);
              if (!(await waitWithLockHeartbeat(10000))) {
                break;
              }
              statsRes = await withContextRecovery(batchId, runContextRef, (ctx) =>
                VelesService.getStats(ctx.tabId, velesId)
              );
            }

            if (!statsRes.success || !statsRes.stats) {
              throw new Error(statsRes.error || 'Не удалось получить статистику');
            }

            const stats = statsRes.stats;
            const actualFrom = typeof stats.from === 'string' && !Number.isNaN(Date.parse(stats.from))
              ? stats.from
              : item.config.from;
            const actualTo = typeof stats.to === 'string' && !Number.isNaN(Date.parse(stats.to))
              ? stats.to
              : item.config.to;
            const resultItem: BacktestResultItem = {
              id: velesId,
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
            const lockStillOwned = await touchLock();
            if (!lockStillOwned) {
              markLockLost();
            }
            if (retryCurrentItem) {
              if (forcedStopReason) {
                stopRef.current = true;
              } else {
                i -= 1;
                continue;
              }
            }
            if (!usedRemoteRun) {
              minIntervalAfterIteration = PRECHECK_INTERVAL_MS;
            }
            const elapsed = Date.now() - launchAttemptStartedAt;
            const remaining = minIntervalAfterIteration - elapsed;
            if (remaining > 0 && !stopRef.current && i < total - 1) {
              const waitSec = Math.ceil(remaining / 1000);
              addLog(`Пауза ${waitSec}с перед следующим тестом...`);
              const fullWaitCompleted = await waitWithLockHeartbeat(remaining);
              if (!fullWaitCompleted) {
                stopRef.current = true;
              }
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
          const stopMessage = forcedStopMessage || 'Остановлено. Продолжите запуск из истории.';
          const isConnectionStop =
            reason === 'no_tab' ||
            reason === 'no_token' ||
            reason === 'unauthorized';
          addLog(isConnectionStop ? `❌ ${stopMessage}` : stopMessage);
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
      runRuntimePrecheck,
      saveRuntimeCheckpoint,
      waitInterruptible,
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
    setNotificationsEnabled,
    validationEnabled,
    setValidationEnabled: setValidationEnabledRuntime
  };
}

export type BacktestQueueController = ReturnType<typeof useBacktestQueue>;
