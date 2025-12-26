import { useState, useEffect } from 'react';
import { 
  Container, Title, Button, Stack, ThemeIcon, Group
} from '@mantine/core';
import { 
  IconSettings, IconPlayerPlay, IconDeviceFloppy, IconList, IconCalculator, IconPlayerStop
} from '@tabler/icons-react';

// --- Импорты компонентов настроек ---
import { StaticSettings } from '../StaticSettings';
import { OrderSettings } from '../OrderSettings';
import { EntrySettings } from '../EntrySettings';
import { ExitSettings } from '../ExitSettings';

// --- Импорт новой модалки ---
import { ResultsModal } from '../ResultsModal';

// --- Сервисы и Хуки ---
import { ConfigGenerator } from '../../services/ConfigGenerator';
import { ValidatorService } from '../../services/ValidatorService';
import { StorageService } from '../../services/StorageService';
import { useBacktestQueue, type QueueItem } from '../../hooks/useBacktestQueue';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from '../../types';

// --- Интерфейс пропсов ---
export interface BacktesterProps {
  staticConfig: StaticConfig;
  setStaticConfig: (v: StaticConfig) => void;
  
  entryConfig: EntryConfig;
  setEntryConfig: (v: EntryConfig) => void;
  
  orderState: OrderState;
  setOrderState: (v: OrderState) => void;
  
  exitConfig: ExitConfig;
  setExitConfig: (v: ExitConfig) => void;

  onSaveTemplate: () => void;
}

export function BacktesterView({
  staticConfig, setStaticConfig,
  entryConfig, setEntryConfig,
  orderState, setOrderState,
  exitConfig, setExitConfig,
  onSaveTemplate
}: BacktesterProps) {
  
  // Подключаем хук очереди
  const { 
    run, stop, 
    isRunning, progress, statusMessage, currentBatchIds,
    logs // <-- Достаем логи из хука
  } = useBacktestQueue();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBatchName, setCurrentBatchName] = useState('');

  // Автоматически открываем модалку при начале тестов
  useEffect(() => {
    if (isRunning) {
        setIsModalOpen(true);
    }
  }, [isRunning]);

  // --- ЛОГИКА ПОДСЧЕТА КОМБИНАЦИЙ И ВРЕМЕНИ ---
  const handleCheckCount = () => {
    // 1. Entry
    let entryCombinations = 1;
    if (entryConfig.filterSlots.length > 0) {
        entryCombinations = entryConfig.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }

    // 2. Orders
    let orderCombinations = 0;
    if (orderState.mode === 'SIMPLE') {
       const s = orderState.simple;
       orderCombinations = s.orders.length * s.martingale.length * s.indent.length * s.overlap.length * (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
    } else if (orderState.mode === 'CUSTOM') {
      const c = orderState.custom;
      let customComb = c.baseOrder.indent.length || 1;
      c.orders.forEach(o => { customComb *= (o.indent.length || 1); });
      orderCombinations = customComb;
    } else {
      let sigComb = orderState.signal.baseOrder.indent.length || 1;
      orderState.signal.orders.forEach(o => {
          let filterComb = 1;
          if (o.filterSlots?.length > 0) filterComb = o.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
          sigComb *= ((o.indent.length || 1) * filterComb);
      });
      orderCombinations = sigComb;
    }

    // 3. Exit
    let profitCombinations = 1;
    if (exitConfig.profitMode === 'SINGLE') profitCombinations = exitConfig.profitSingle.percents.length || 1;
    else if (exitConfig.profitMode === 'MULTIPLE') {
        if (exitConfig.profitMultiple.orders.length > 0) {
            exitConfig.profitMultiple.orders.forEach(o => { profitCombinations *= (o.indent.length || 1); });
        }
    } else if (exitConfig.profitMode === 'SIGNAL') {
        const pnl = exitConfig.profitSignal.checkPnl.length || 1;
        let ind = 1;
        if (exitConfig.profitSignal.filterSlots.length > 0) ind = exitConfig.profitSignal.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
        profitCombinations = pnl * ind;
    }

    let slCombinations = 1;
    if (exitConfig.stopLoss.enabledSimple) slCombinations *= (exitConfig.stopLoss.indent.length || 1);
    if (exitConfig.stopLoss.enabledSignal) {
        const slIndents = exitConfig.stopLoss.conditionalIndent.length || 1;
        let slIndics = 1;
        if (exitConfig.stopLoss.filterSlots.length > 0) slIndics = exitConfig.stopLoss.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
        slCombinations *= (slIndents * slIndics);
    }

    const totalCount = orderCombinations * entryCombinations * (profitCombinations * slCombinations);
    
    // --- Подсчет времени (30 сек на тест) ---
    const totalSeconds = totalCount * 30;
    
    // Форматирование времени
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);

    let timeString = '';
    if (d > 0) timeString += `${d} д `;
    if (h > 0) timeString += `${h} ч `;
    if (m > 0) timeString += `${m} мин`;
    if (timeString === '') timeString = '~ 30 сек'; // Если меньше минуты

    alert(
        `📊 Анализ конфигурации:\n\n` +
        `• Комбинаций входа: ${entryCombinations}\n` +
        `• Комбинаций сетки: ${orderCombinations}\n` +
        `• Комбинаций выхода: ${profitCombinations * slCombinations}\n\n` +
        `🔢 ИТОГО ТЕСТОВ: ${totalCount}\n` +
        `⏳ Примерное время: ${timeString}`
    );
  };

  const handleRunTests = async () => {
      // 1. Валидация
      const validation = ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig);
      if (!validation.valid) {
          alert(`❌ Ошибка валидации:\n${validation.error}`);
          return;
      }

      // 2. Генерация ID группы (ПЕРЕНЕСЕНО В НАЧАЛО)
      const batchId = `#${Math.floor(Date.now() % 1000000).toString(16).toUpperCase()}`;
      const namePrefix = staticConfig.namePrefix || "Backtest";

      // 3. Генерация конфигураций
      // Используем #TEMP как плейсхолдер при генерации
      const { configs } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig, "#TEMP");

      if (configs.length === 0) {
          alert("Ошибка: Не сгенерировано ни одной конфигурации.");
          return;
      }

      const confirmed = window.confirm(`Сгенерировано тестов: ${configs.length}.\n\nЗапустить выполнение?`);
      if (!confirmed) return;

      // 4. Подготовка очереди с ЗАМЕНОЙ ИМЕНИ
      const queueItems: QueueItem[] = configs.map(cfg => {
          // !!! ВОТ ЗДЕСЬ ИСПРАВЛЕНИЕ ИМЕНИ !!!
          // Заменяем #TEMP на реальный batchId перед добавлением в очередь
          const realName = cfg.name.replace('#TEMP', batchId);
          return {
            id: crypto.randomUUID(),
            config: { ...cfg, name: realName }, // Подставляем обновленный конфиг
            status: 'PENDING'
          };
      });

      // 5. Создаем запись в истории (StorageService)
      setCurrentBatchName(`${namePrefix} (${batchId})`);

      await StorageService.saveBatch({
          id: batchId,
          timestamp: Date.now(),
          namePrefix: namePrefix,
          symbol: staticConfig.symbol,
          exchange: staticConfig.exchange,
          totalTests: configs.length,
          velesIds: [] 
      });

      // 6. ЗАПУСК
      // Передаем queueItems напрямую, чтобы избежать Race Condition
      run(batchId, queueItems);
  };

  return (
    <Container size="md" py="xl" pb={100}>
      
      {/* HEADER */}
      <Group mb="lg" justify="space-between">
        <Group>
            <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
            <Title order={2}>Конфигуратор</Title>
        </Group>
        <Button 
            variant="default" 
            leftSection={<IconDeviceFloppy size={18} />}
            onClick={onSaveTemplate}
            disabled={isRunning}
        >
            Сохранить шаблон
        </Button>
      </Group>

      {/* SETTINGS BLOCKS */}
      <Stack gap="xl">
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        <EntrySettings config={entryConfig} onChange={setEntryConfig} />
        <OrderSettings state={orderState} onChange={setOrderState} />
        <ExitSettings config={exitConfig} onChange={setExitConfig} />

        {/* ACTION BAR */}
        <Group grow mt="md">
            <Button 
                size="md" 
                color="blue" 
                variant="light"
                leftSection={<IconCalculator size={20} />} 
                onClick={handleCheckCount}
                disabled={isRunning}
            >
                Проверить количество
            </Button>

            {!isRunning ? (
                <Button 
                    size="md" 
                    color="green" 
                    leftSection={<IconPlayerPlay size={20} />} 
                    onClick={handleRunTests}
                >
                    Запустить бектесты
                </Button>
            ) : (
                <Button 
                    size="md" 
                    color="blue" 
                    leftSection={<IconList size={20} />} 
                    onClick={() => setIsModalOpen(true)}
                >
                    Открыть таблицу (Запущено...)
                </Button>
            )}
        </Group>

        {isRunning && (
             <Button 
                color="red" 
                variant="outline" 
                fullWidth 
                leftSection={<IconPlayerStop size={18}/>}
                onClick={stop}
            >
                Остановить выполнение ({progress.current}/{progress.total})
            </Button>
        )}

      </Stack>

      {/* RESULTS MODAL (LIVE MODE) */}
      <ResultsModal 
         opened={isModalOpen} 
         onClose={() => setIsModalOpen(false)} 
         title={currentBatchName || 'Результаты'}
         targetIds={currentBatchIds}
         
         // Props для Live режима
         isLive={isRunning}
         status={statusMessage}
         progress={progress}
         onStop={stop}
         logs={logs} // <-- Передаем логи в модалку
      />
      
    </Container>
  );
}