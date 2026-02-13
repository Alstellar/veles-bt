// src/hooks/useBacktestQueue.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../types/veles';
import { StorageService } from '../services/StorageService';
import { DatabaseService } from '../services/DatabaseService'; 
import type { BacktestResultItem } from '../types';

export interface QueueItem {
  id: string; 
  config: VelesConfigPayload;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  resultId?: number; 
}

export function useBacktestQueue() {
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
    setLogs(prev => [...prev, msg]);
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
          new Notification(title, { body, icon: '/icons/icon128.png' });
      }
  };

  const run = useCallback(async (batchId: string, initialItems?: QueueItem[]) => {
    setIsRunning(true);
    stopRef.current = false;
    setCurrentBatchIds([]); 
    setLogs([]); 

    // Запоминаем оригинальный заголовок перед стартом
    originalTitleRef.current = document.title;

    // Запрашиваем права на уведомления, если еще не даны
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }

    let itemsToRun = initialItems || queue;
    if (itemsToRun.length === 0) {
        addLog('⚠️ Очередь пуста');
        setIsRunning(false);
        return;
    }
    if (initialItems) setQueue(initialItems);
    
    const tab = await VelesService.findTab();
    if (!tab || !tab.id) {
        addLog('❌ Ошибка: Вкладка Veles не найдена');
        return;
    }
    const tabId = tab.id;
    const token = await VelesService.getToken(tabId);
    if (!token) {
        addLog('❌ Ошибка: Не удалось получить токен. Попробуйте обновить вкладку Велеса. (Вкладка Велеса должна быть только ОДНА!)');
        return;
    }

    const total = itemsToRun.length;
    // Инициализируем 0, но в цикле сразу обновим на 1
    setProgress({ current: 0, total });
    addLog(`🚀 Запуск очереди из ${total} тестов...`);

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
            await StorageService.addTestIdToBatch(batchId, velesId);
            setCurrentBatchIds(prev => [...prev, velesId]);

            setQueue(prev => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], status: 'FINISHED', resultId: velesId };
                return next;
            });
            
            addLog(`${testName}: ✅ Успешно`);

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

    setIsRunning(false);
    
    // Восстанавливаем заголовок
    document.title = originalTitleRef.current;
    
    const finalMsg = stopRef.current ? '🛑 Выполнение остановлено.' : '✅ Выполнение завершено.';
    addLog(finalMsg);

    if (!stopRef.current) {
        sendNotification('Veles Helper', `Бектесты завершены! Проверено ${total} конфигураций.`);
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