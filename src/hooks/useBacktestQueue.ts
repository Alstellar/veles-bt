// src/hooks/useBacktestQueue.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../types/veles';
import { StorageService } from '../services/StorageService';
import { DatabaseService } from '../services/DatabaseService'; 
import type { BacktestResultItem } from '../types';
import { LogService } from '../services/LogService';
import { configHash } from '../utils/configHash';

export interface QueueItem {
  id: string; 
  config: VelesConfigPayload;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number; 
}

export function useBacktestQueue() {
  const MAX_LOGS = 400;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Статус для шапки
  const [statusMessage, setStatusMessage] = useState('');
  // История логов для консоли
  const [logs, setLogs] = useState<string[]>([]);
  
  const [currentBatchIds, setCurrentBatchIds] = useState<number[]>([]);
  
  // Состояние для уведомлений
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const stopRef = useRef(false);
  // Храним оригинальный заголовок страницы
  const originalTitleRef = useRef(document.title);

  // Восстанавливаем заголовок при размонтировании компонента
  useEffect(() => {
      return () => {
          document.title = originalTitleRef.current;
      };
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => {
      const next = [...prev, msg];
      if (next.length <= MAX_LOGS) return next;
      return next.slice(next.length - MAX_LOGS);
    });
    setStatusMessage(msg);
  }, []);

  const addItems = useCallback((items: QueueItem[]) => {
    setQueue(prev => [...prev, ...items]);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setProgress({ current: 0, total: 0 });
    setCurrentBatchIds([]); 
    setStatusMessage('');
    setLogs([]);
    document.title = originalTitleRef.current; // Сброс заголовка
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
    addLog('🛑 Остановлено пользователем');
    document.title = originalTitleRef.current; // Сброс заголовка
    void LogService.warn('queue', 'queue.stop_requested');
  }, [addLog]);

  const extractErrorMessage = (e: any): string => {
    let raw = e?.message || String(e);
    raw = raw.replace(/^Error:\s*/, '');
    try {
        const match = raw.match(/(\{.*\})/);
        if (match) {
            const json = JSON.parse(match[1]);
            if (json.message) return json.message;
            if (json.error) return json.error;
        }
    } catch { }
    return raw;
  };

  // Функция отправки уведомления
  const sendNotification = (title: string, body: string) => {
      if (!notificationsEnabled || !('Notification' in window)) return;
      
      if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icons/icon-128.png' });
      }
  };

  const run = useCallback(async (batchId: string, initialItems?: QueueItem[]) => {
    setIsRunning(true);
    stopRef.current = false;
    setCurrentBatchIds([]); 
    setLogs([]); 

    // Запоминаем оригинальный заголовок перед стартом
    originalTitleRef.current = document.title;
    let total = 0;
    let queueStarted = false;
    const buildConfigContext = (cfg: VelesConfigPayload) => ({
      name: cfg.name,
      symbol: cfg.symbol,
      exchange: cfg.exchange,
      algorithm: cfg.algorithm,
      from: cfg.from,
      to: cfg.to,
      settingsType: (cfg.settings as { type?: string } | undefined)?.type || 'unknown',
      configHash: configHash(cfg)
    });

    try {
      await LogService.info('queue', 'queue.run_requested', {
        batchId,
        initialItems: initialItems?.length || queue.length
      }, batchId);

      // Запрашиваем права на уведомления, если еще не даны
      if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
          await LogService.info('queue', 'notifications.permission_requested', {
            permission: Notification.permission
          }, batchId);
      }

      let itemsToRun = initialItems || queue;
      if (itemsToRun.length === 0) {
          addLog('⚠️ Очередь пуста');
          await LogService.warn('queue', 'queue.empty', { batchId }, batchId);
          return;
      }
      if (initialItems) setQueue(initialItems);
      
      const tab = await VelesService.findTab();
      if (!tab || !tab.id) {
          addLog('❌ Ошибка: Вкладка Veles не найдена');
          await LogService.error('queue', 'queue.no_tab', new Error('Veles tab not found'), { batchId }, batchId);
          return;
      }
      const tabId = tab.id;
      const token = await VelesService.getToken(tabId);
      if (!token) {
          addLog('❌ Ошибка: Не удалось получить токен. Попробуйте обновить вкладку Велеса. (Вкладка Велеса должна быть только ОДНА!)');
          await LogService.error('queue', 'queue.no_token', new Error('Veles token not found'), { tabId, batchId }, batchId);
          return;
      }

      total = itemsToRun.length;
      queueStarted = true;
      // Инициализируем 0, но в цикле сразу обновим на 1
      setProgress({ current: 0, total });
      addLog(`🚀 Запуск очереди из ${total} тестов...`);
      await LogService.info('queue', 'queue.started', { batchId, total }, batchId);

      // --- ГЛАВНЫЙ ЦИКЛ ---
      for (let i = 0; i < total; i++) {
          if (stopRef.current) break;

          // 🔄 СИНХРОНИЗАЦИЯ:
          // Обновляем UI в начале итерации, чтобы "Тест 1/6" отображался сразу везде
          const currentTestNum = i + 1;
          const percent = Math.round((currentTestNum / total) * 100);
          
          document.title = `[${percent}%] Тест ${currentTestNum}/${total}`;
          setProgress({ current: currentTestNum, total }); // Бадж теперь показывает "4/6", когда идет 4-й тест

          const loopStartTime = Date.now();
          const item = itemsToRun[i];
          
          if (item.status === 'FINISHED') {
              // Прогресс уже обновлен выше, просто пропускаем
              continue;
          }

          const testName = `Тест ${currentTestNum}/${total}`;
          addLog(`${testName}: Запуск...`);
          await LogService.info('queue', 'test.start', {
            batchId,
            index: currentTestNum,
            total,
            ...buildConfigContext(item.config)
          }, batchId);

          setQueue(prev => {
              const next = [...prev];
              if (next[i]) next[i] = { ...next[i], status: 'RUNNING', error: undefined };
              return next;
          });

          try {
              const runRes = await VelesService.runTest(tabId, token, item.config);

              if (!runRes.success || !runRes.id) {
                  throw new Error(runRes.error || `Ошибка запуска (${runRes.status})`);
              }

              const velesId = runRes.id;
              await LogService.info('queue', 'test.run_success', {
                batchId,
                index: currentTestNum,
                velesId,
                status: runRes.status
              }, batchId);
              
              addLog(`${testName}: Выполнение (ID: ${velesId})...`);
              
              let isFinished = false;
              const pollingStart = Date.now();
              const MAX_POLLING_TIME = 5 * 60 * 1000; 

              while (!isFinished) {
                  if (stopRef.current) throw new Error('Остановлено пользователем');
                  
                  if (Date.now() - pollingStart > MAX_POLLING_TIME) {
                      throw new Error('TIMEOUT: Тест не завершился за 5 минут');
                  }
                  
                  await new Promise(r => setTimeout(r, 1000)); 
                  const check = await VelesService.checkStatus(tabId, token, velesId);
                  
                  if (check.success && check.data) {
                      const s = check.data.status;
                      await LogService.debug('queue', 'test.status_poll', {
                        batchId,
                        index: currentTestNum,
                        velesId,
                        status: s
                      }, batchId);
                      if (s === 'FINISHED') isFinished = true;
                      if (s === 'ERROR' || s === 'FAILED') throw new Error(check.data.error || 'Статус теста: ОШИБКА');
                  }
              }

              addLog(`${testName}: Обработка результатов (ждем 5 сек)...`);
              await new Promise(r => setTimeout(r, 5000));

              let statsRes = await VelesService.getStats(tabId, velesId);

              if (!statsRes.success || !statsRes.stats) {
                  console.warn(`Attempt 1 failed for ID ${velesId}: ${statsRes.error}`);
                  addLog(`${testName}: Сервер занят, ждем еще 10 сек...`);
                  await LogService.warn('queue', 'stats.fetch_retry', {
                    batchId,
                    index: currentTestNum,
                    velesId,
                    error: statsRes.error
                  }, batchId);
                  await new Promise(r => setTimeout(r, 10000));
                  statsRes = await VelesService.getStats(tabId, velesId);
              }

              if (!statsRes.success || !statsRes.stats) {
                  throw new Error(statsRes.error || 'Не удалось получить статистику после повторной попытки');
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
              await LogService.info('queue', 'db.save_success', {
                batchId,
                index: currentTestNum,
                velesId
              }, batchId);
              await StorageService.addTestIdToBatch(batchId, velesId);
              await LogService.info('queue', 'storage.batch_id_saved', {
                batchId,
                index: currentTestNum,
                velesId
              }, batchId);
              setCurrentBatchIds(prev => [...prev, velesId]);

              setQueue(prev => {
                  const next = [...prev];
                  if (next[i]) next[i] = { ...next[i], status: 'FINISHED', resultId: velesId };
                  return next;
              });
              
              addLog(`${testName}: ✅ Успешно`);
              await LogService.info('queue', 'test.finished', {
                batchId,
                index: currentTestNum,
                velesId
              }, batchId);

          } catch (e: any) {
               const rawMsg = extractErrorMessage(e);
               const status = rawMsg.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR';

               // 👇👇👇 НОВОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ 👇👇👇
               console.group(`❌ Ошибка запуска теста #${currentTestNum}`);
               console.error('Текст ошибки:', rawMsg);
               
               // Выводим проблемный конфиг как объект (раскрываемый)
               console.dir(item.config);
               
               // Выводим как JSON строку для копирования
               console.log('JSON конфига:', JSON.stringify(item.config));
               console.groupEnd();
               // 👆👆👆 -------------------------------- 👆👆👆

               setQueue(prev => {
                  const next = [...prev];
                  if (next[i]) next[i] = { ...next[i], status: status, error: rawMsg };
                  return next;
               });
              
              addLog(`❌ Ошибка: ${rawMsg}`);
              await LogService.error('queue', 'test.failed', e, {
                batchId,
                index: currentTestNum,
                total,
                status,
                errorMessage: rawMsg,
                config: item.config,
                configHash: configHash(item.config)
              }, batchId);
          } finally {
              const elapsedTime = Date.now() - loopStartTime;
              const MIN_DELAY = 31000;
              
              const remainingDelay = MIN_DELAY - elapsedTime;

              if (remainingDelay > 0 && !stopRef.current && i < total - 1) {
                  const waitSeconds = Math.ceil(remainingDelay / 1000);
                  addLog(`⏳ Пауза ${waitSeconds} сек. перед следующим тестом...`);
                  await new Promise(r => setTimeout(r, remainingDelay));
              }
          }
      }

      if (queueStarted) {
        const finalMsg = stopRef.current ? '🛑 Выполнение остановлено.' : '✅ Выполнение завершено.';
        addLog(finalMsg);
        await LogService.info('queue', 'queue.finished', {
          batchId,
          stopped: stopRef.current,
          total
        }, batchId);

        if (!stopRef.current) {
            sendNotification('Veles Helper', `Бектесты завершены! Проверено ${total} конфигураций.`);
        }
      }
    } catch (e: any) {
      addLog(`❌ Критическая ошибка очереди: ${extractErrorMessage(e)}`);
      await LogService.critical('queue', 'queue.crashed', e, { batchId }, batchId);
    } finally {
      setIsRunning(false);
      document.title = originalTitleRef.current;
    }

  }, [queue, addLog, notificationsEnabled]);

  return {
    queue,
    addItems,
    clearQueue,
    run,
    stop,
    isRunning,
    progress,
    statusMessage,
    currentBatchIds,
    logs,
    notificationsEnabled,
    setNotificationsEnabled 
  };
}
