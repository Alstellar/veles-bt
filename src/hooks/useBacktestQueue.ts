import { useState, useRef, useCallback } from 'react';
import { VelesService, type VelesConfigPayload } from '../services/VelesService';
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

  const stopRef = useRef(false);

  // Хелпер для добавления лога и обновления статуса
  const addLog = useCallback((msg: string) => {
    // console.log(msg); // Можно включить для отладки в DevTools
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
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    setIsRunning(false);
    addLog('🛑 Остановлено пользователем');
  }, [addLog]);

  // Хелпер для вытаскивания текста ошибки из JSON (если он есть)
  const extractErrorMessage = (e: any): string => {
    let raw = e?.message || String(e);
    // Убираем префикс "Error: ", если он есть
    raw = raw.replace(/^Error:\s*/, '');
    
    try {
        // Пытаемся найти JSON-подобную структуру в строке
        // Например: '{"error":"Too Many Requests","message":"Лимит"}'
        const match = raw.match(/(\{.*\})/);
        if (match) {
            const json = JSON.parse(match[1]);
            // Приоритет: message -> error -> raw
            if (json.message) return json.message;
            if (json.error) return json.error;
        }
    } catch {
        // Если не удалось распарсить, возвращаем как есть
    }
    return raw;
  };

  const run = useCallback(async (batchId: string, initialItems?: QueueItem[]) => {
    setIsRunning(true);
    stopRef.current = false;
    setCurrentBatchIds([]); 
    setLogs([]); // Очищаем логи перед новым запуском

    let itemsToRun = initialItems || queue;
    if (itemsToRun.length === 0) {
        addLog('⚠️ Очередь пуста');
        setIsRunning(false);
        return;
    }
    if (initialItems) setQueue(initialItems);
    
    // Получаем доступ к API
    const tab = await VelesService.findTab();
    if (!tab || !tab.id) {
        addLog('❌ Ошибка: Вкладка Veles не найдена');
        return;
    }
    const tabId = tab.id;
    const token = await VelesService.getToken(tabId);
    if (!token) {
        addLog('❌ Ошибка: Не удалось получить токен');
        return;
    }

    const total = itemsToRun.length;
    setProgress({ current: 0, total });
    addLog(`🚀 Запуск очереди из ${total} тестов...`);

    // --- ГЛАВНЫЙ ЦИКЛ ---
    for (let i = 0; i < total; i++) {
        if (stopRef.current) break;

        // 1. ЗАСЕКАЕМ ВРЕМЯ СТАРТА ИТЕРАЦИИ
        const loopStartTime = Date.now();
        const item = itemsToRun[i];
        
        if (item.status === 'FINISHED') {
            setProgress(p => ({ ...p, current: p.current + 1 }));
            continue;
        }

        const testName = `Тест ${i + 1}/${total}`;
        addLog(`${testName}: Запуск...`);

        setQueue(prev => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], status: 'RUNNING', error: undefined };
            return next;
        });

        try {
            // 2. ЗАПУСК ТЕСТА
            const runRes = await VelesService.runTest(tabId, token, item.config);

            if (!runRes.success || !runRes.id) {
                throw new Error(runRes.error || `Ошибка запуска (${runRes.status})`);
            }

            const velesId = runRes.id;
            
            // 3. ОЖИДАНИЕ (POLLING) С ТАЙМАУТОМ 5 МИНУТ
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

            // 4. ПОЛУЧЕНИЕ СТАТИСТИКИ (С ПАУЗАМИ И RETRY)
            addLog(`${testName}: Обработка результатов (ждем 5 сек)...`);
            await new Promise(r => setTimeout(r, 5000));

            let statsRes = await VelesService.getStats(tabId, velesId);

            // Если неудача (404), пробуем еще раз
            if (!statsRes.success || !statsRes.stats) {
                console.warn(`Attempt 1 failed for ID ${velesId}: ${statsRes.error}`);
                
                addLog(`${testName}: Сервер занят, ждем еще 10 сек...`);
                await new Promise(r => setTimeout(r, 10000));

                statsRes = await VelesService.getStats(tabId, velesId);
            }

            if (!statsRes.success || !statsRes.stats) {
                throw new Error(statsRes.error || 'Не удалось получить статистику после повторной попытки');
            }

            // 5. СОХРАНЕНИЕ
            const stats = statsRes.stats;
            
            // МАППИНГ РЕЗУЛЬТАТОВ
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
             const rawMsg = extractErrorMessage(e); // Парсим сообщение об ошибке
             const status = rawMsg.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR';

             setQueue(prev => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], status: status, error: rawMsg };
                return next;
            });
            
            console.error(`Ошибка в тесте ${i+1}:`, e);
            addLog(`❌ Ошибка: ${rawMsg}`);
        } finally {
            // 6. УМНАЯ ЗАДЕРЖКА (Smart Delay)
            const elapsedTime = Date.now() - loopStartTime;
            const MIN_DELAY = 31000; // 31 секунда
            
            const remainingDelay = MIN_DELAY - elapsedTime;

            if (remainingDelay > 0 && !stopRef.current && i < total - 1) {
                const waitSeconds = Math.ceil(remainingDelay / 1000);
                addLog(`⏳ Пауза ${waitSeconds} сек. перед следующим тестом...`);
                await new Promise(r => setTimeout(r, remainingDelay));
            }
        }

        setProgress(p => ({ ...p, current: i + 1 }));
    }

    setIsRunning(false);
    addLog(stopRef.current ? '🛑 Выполнение остановлено.' : '✅ Выполнение завершено.');
  }, [queue, addLog]);

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
    logs // <-- Экспортируем логи
  };
}