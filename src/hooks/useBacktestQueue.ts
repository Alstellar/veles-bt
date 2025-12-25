import { useState, useRef, useCallback } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../services/VelesService';
import type { TestResult } from '../types';
import { StorageService } from '../services/StorageService'; // <-- Новое

export function useBacktestQueue() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('Готов к запуску');
  
  const abortRef = useRef(false);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // Теперь принимаем не просто массив конфигов, а объект с ID группы
  const startQueue = useCallback(async (data: { configs: VelesConfigPayload[], batchId: string }) => {
    const { configs, batchId } = data;

    if (configs.length === 0) {
        alert("Список конфигураций пуст!");
        return;
    }

    setIsRunning(true);
    abortRef.current = false;
    setResults([]); 
    setProgress({ current: 0, total: configs.length });

    // 1. Ищем вкладку Veles
    setCurrentStatus("Поиск вкладки Veles...");
    const tab = await VelesService.findTab();
    if (!tab || !tab.id) {
        alert("Вкладка Veles не найдена! Откройте veles.finance и войдите в аккаунт.");
        setIsRunning(false);
        return;
    }

    // 2. Получаем токен
    setCurrentStatus("Получение токена авторизации...");
    const token = await VelesService.getToken(tab.id);
    if (!token) {
        alert("Не удалось получить токен. Обновите страницу Veles и попробуйте снова.");
        setIsRunning(false);
        return;
    }

    // --- NEW: Сохраняем группу в историю ---
    try {
        const firstConfig = configs[0];
        await StorageService.saveBatch({
            id: batchId,
            timestamp: Date.now(),
            namePrefix: firstConfig.name.split('|')[0].trim(), // "My Test HYPE"
            symbol: firstConfig.symbol,
            exchange: firstConfig.exchange as any,
            totalTests: configs.length,
            velesIds: []
        });
        console.log(`📦 Batch ${batchId} created in storage`);
    } catch (e) {
        console.error("Failed to save batch history", e);
    }
    // ----------------------------------------

    // 3. Запуск цикла
    for (let i = 0; i < configs.length; i++) {
        const iterationStartTime = Date.now();

        if (abortRef.current) {
            setCurrentStatus("Остановлено пользователем");
            break;
        }

        const config = configs[i];
        const internalId = Math.random().toString(36).substr(2, 9);
        const testNum = i + 1;
        const totalTests = configs.length;

        console.group(`🚀 Test ${testNum}/${totalTests} [ID: ${internalId}]`);
        console.log("Payload:", JSON.stringify(config, null, 2));
        
        const newResultItem: TestResult = {
            id: internalId,
            config: config,
            status: 'RUNNING',
            timestamp: Date.now(),
            batchId: batchId // <-- Привязываем к группе
        };
        
        setResults(prev => [newResultItem, ...prev]); 
        setProgress({ current: testNum, total: totalTests });
        setCurrentStatus(`Тест ${testNum}/${totalTests}: Запуск...`);

        try {
            // А. ЗАПУСК
            // Обработка 429 ошибки (Rate Limit) внутри VelesService
            const runRes = await VelesService.runTest(tab.id!, token, config);
            console.log("Start Response:", JSON.stringify(runRes, null, 2));
            
            if (!runRes.success || !runRes.id) {
                // Если получили 429, можно попробовать подождать и повторить (продвинутая логика)
                // Но пока просто падаем с ошибкой
                const errorDetails = runRes.error || JSON.stringify(runRes);
                throw new Error(`Ошибка запуска (Code ${runRes.status}): ${errorDetails}`);
            }

            updateResult(internalId, { backtestId: runRes.id });
            setCurrentStatus(`Тест ${testNum}/${totalTests}: Ожидание (ID: ${runRes.id})...`);

            // Б. ОЖИДАНИЕ
            const startTime = Date.now();
            const MAX_TIME = 5 * 60 * 1000;
            let isFinished = false;

            while (!isFinished) {
                if (abortRef.current) throw new Error("Остановлено");
                if (Date.now() - startTime > MAX_TIME) {
                      updateResult(internalId, { status: 'TIMEOUT' });
                      throw new Error("Таймаут (5 мин)");
                }

                await delay(5000); 

                const statusRes = await VelesService.checkStatus(tab.id!, token, runRes.id);
                
                if (statusRes.success && statusRes.data) {
                    const s = statusRes.data.status;
                    if (s === 'FINISHED') {
                        isFinished = true;
                    } else if (s === 'ERROR' || s === 'FAILED') {
                        throw new Error(`Ошибка сервера Veles (Status: ${s}): ${statusRes.data.error || 'Unknown error'}`);
                    }
                }
            }

            // В. СТАТИСТИКА
            setCurrentStatus(`Тест ${testNum}/${totalTests}: Загрузка статистики...`);
            await delay(1000); 

            const statsRes = await VelesService.getStats(tab.id!, token, runRes.id);
            console.log("Stats Response:", JSON.stringify(statsRes, null, 2));

            if (statsRes.success && statsRes.stats) {
                // 1. Обновляем UI
                updateResult(internalId, { 
                    status: 'FINISHED', 
                    stats: statsRes.stats, 
                    shareToken: statsRes.shareToken,
                    duration: ((Date.now() - startTime) / 1000).toFixed(0) + 's'
                });

                // --- NEW: Сохраняем успешный ID в историю ---
                if (runRes.id) {
                    await StorageService.updateBatchIds(batchId, runRes.id);
                }
                // --------------------------------------------

            } else {
                throw new Error(statsRes.error || "Нет данных статистики");
            }

        } catch (err: any) {
            console.error("❌ Test Failed:", err);
            updateResult(internalId, { 
                status: 'ERROR', 
                error: err.message 
            });
        } finally {
            console.groupEnd();
            
            // Г. УМНАЯ ПАУЗА (31 сек минимум)
            const elapsed = Date.now() - iterationStartTime;
            const MIN_DELAY = 31000; 
            
            if (elapsed < MIN_DELAY && !abortRef.current && i < configs.length - 1) {
                const waitTime = MIN_DELAY - elapsed;
                const secondsLeft = Math.ceil(waitTime / 1000);
                
                console.log(`⏳ Cooldown: Waiting ${secondsLeft}s before next test...`);
                
                for (let s = secondsLeft; s > 0; s--) {
                    if (abortRef.current) break;
                    setCurrentStatus(`Остываем: ждем ${s} сек...`);
                    await delay(1000);
                }
            } else {
                if (i < configs.length - 1) await delay(1000);
            }
        }
    }

    setIsRunning(false);
    if (!abortRef.current) setCurrentStatus("Все тесты завершены!");
  }, []);

  const stopQueue = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setCurrentStatus("Остановка...");
  }, []);

  const updateResult = (id: string, updates: Partial<TestResult>) => {
    setResults(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  return {
    isRunning,
    progress,
    results,
    currentStatus,
    startQueue,
    stopQueue
  };
}