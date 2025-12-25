import { useState, useRef, useCallback } from 'react';
import { VelesService } from '../services/VelesService';
import type { VelesConfigPayload } from '../services/VelesService';
import type { TestResult } from '../types';

export function useBacktestQueue() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('Готов к запуску');
  
  const abortRef = useRef(false);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  const startQueue = useCallback(async (configs: VelesConfigPayload[]) => {
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

    // 3. Запуск цикла
    for (let i = 0; i < configs.length; i++) {
        // Засекаем время начала итерации для контроля тайминга (31 сек)
        const iterationStartTime = Date.now();

        if (abortRef.current) {
            setCurrentStatus("Остановлено пользователем");
            break;
        }

        const config = configs[i];
        const internalId = Math.random().toString(36).substr(2, 9);
        const testNum = i + 1;
        const totalTests = configs.length;

        // Группировка логов в консоли для удобства
        console.group(`🚀 Test ${testNum}/${totalTests} [ID: ${internalId}]`);
        console.log("Payload:", JSON.stringify(config, null, 2));
        
        // Создаем "черновик" результата
        const newResultItem: TestResult = {
            id: internalId,
            config: config,
            status: 'RUNNING',
            timestamp: Date.now()
        };
        
        setResults(prev => [newResultItem, ...prev]); 
        setProgress({ current: testNum, total: totalTests });
        setCurrentStatus(`Тест ${testNum}/${totalTests}: Запуск...`);

        try {
            // А. ОТПРАВКА ЗАПРОСА НА ЗАПУСК
            const runRes = await VelesService.runTest(tab.id!, token, config);
            console.log("Start Response:", JSON.stringify(runRes, null, 2));
            
            if (!runRes.success || !runRes.id) {
                // Пытаемся достать текст ошибки из тела ответа
                const errorDetails = runRes.error || JSON.stringify(runRes);
                throw new Error(`Ошибка запуска: ${errorDetails}`);
            }

            updateResult(internalId, { backtestId: runRes.id });
            setCurrentStatus(`Тест ${testNum}/${totalTests}: Ожидание (ID: ${runRes.id})...`);

            // Б. ОЖИДАНИЕ (POLLING)
            const startTime = Date.now();
            const MAX_TIME = 5 * 60 * 1000; // 5 минут макс
            let isFinished = false;

            while (!isFinished) {
                if (abortRef.current) throw new Error("Остановлено");
                if (Date.now() - startTime > MAX_TIME) {
                     updateResult(internalId, { status: 'TIMEOUT' });
                     throw new Error("Таймаут (5 мин)");
                }

                await delay(5000); // Опрос каждые 5 сек

                const statusRes = await VelesService.checkStatus(tab.id!, token, runRes.id);
                // Логируем статус, если он изменился или интересный (опционально можно убрать, чтобы не спамить)
                // console.log("Status Poll:", statusRes);
                
                if (statusRes.success && statusRes.data) {
                    const s = statusRes.data.status;
                    if (s === 'FINISHED') {
                        isFinished = true;
                    } else if (s === 'ERROR' || s === 'FAILED') {
                        throw new Error(`Ошибка сервера Veles (Status: ${s}): ${statusRes.data.error || 'Unknown error'}`);
                    }
                }
            }

            // В. ПОЛУЧЕНИЕ РЕЗУЛЬТАТОВ (STATISTICS)
            setCurrentStatus(`Тест ${testNum}/${totalTests}: Загрузка статистики...`);
            await delay(1000); // Даем базе Veles секунду на прогрузку

            const statsRes = await VelesService.getStats(tab.id!, token, runRes.id);
            console.log("Stats Response:", JSON.stringify(statsRes, null, 2));

            if (statsRes.success && statsRes.stats) {
                updateResult(internalId, { 
                    status: 'FINISHED', 
                    stats: statsRes.stats, 
                    shareToken: statsRes.shareToken,
                    duration: ((Date.now() - startTime) / 1000).toFixed(0) + 's'
                });
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
            const MIN_DELAY = 31000; // 31 секунда
            
            if (elapsed < MIN_DELAY && !abortRef.current && i < configs.length - 1) {
                const waitTime = MIN_DELAY - elapsed;
                const secondsLeft = Math.ceil(waitTime / 1000);
                
                console.log(`⏳ Cooldown: Waiting ${secondsLeft}s before next test...`);
                
                // Обратный отсчет в статусе для красоты
                for (let s = secondsLeft; s > 0; s--) {
                    if (abortRef.current) break;
                    setCurrentStatus(`Остываем: ждем ${s} сек...`);
                    await delay(1000);
                }
            } else {
                // Если тест шел дольше 31 сек, просто небольшая пауза перед следующим
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