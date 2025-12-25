import { useState, useEffect } from 'react';
import { 
  Container, Title, Button, Stack, Paper, Text, Center, ThemeIcon, Group, 
  Progress, Badge, Modal, Code, ScrollArea, CopyButton 
} from '@mantine/core';
import { 
  IconExternalLink, IconRocket, IconSettings, IconPlayerPlay, 
  IconPlayerStop, IconCode, IconCopy, IconCheck 
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';

// Компоненты настроек
import { StaticSettings } from './components/StaticSettings';
import { OrderSettings } from './components/OrderSettings';
import { EntrySettings } from './components/EntrySettings';
import { ExitSettings } from './components/ExitSettings';

// Компоненты результатов и логика
import { ResultsTable } from './components/ResultsTable';
import { ConfigGenerator } from './services/ConfigGenerator';
import { useBacktestQueue } from './hooks/useBacktestQueue';

import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from './types';

// --- КОМПОНЕНТ: МАЛЕНЬКИЙ ПОПАП ---
function PopupMode() {
  const openFullTab = () => {
    if (chrome.tabs) {
      chrome.tabs.create({ url: 'index.html?mode=fullscreen' });
    } else {
      window.open('?mode=fullscreen', '_blank');
    }
  };

  return (
    <Center h={600} bg="gray.1" p="md">
      <Paper shadow="md" p="xl" radius="md" w="100%" withBorder ta="center">
        <ThemeIcon size={60} radius="xl" color="blue" variant="light" mb="md">
          <IconRocket size={34} />
        </ThemeIcon>
        <Title order={3} mb="sm">VelesBT Pro</Title>
        <Text size="sm" c="dimmed" mb="xl">
          Конфигуратор стратегий и менеджер очередей бектестов.
        </Text>
        <Button 
          fullWidth size="md" 
          rightSection={<IconExternalLink size={20} />}
          onClick={openFullTab}
        >
          Открыть конфигуратор
        </Button>
      </Paper>
    </Center>
  );
}

// --- КОМПОНЕНТ: ПОЛНОЦЕННАЯ ВКЛАДКА ---
function FullscreenMode() {
  
  // --- 1. STATE НАСТРОЕК ---
  
  const [staticConfig, setStaticConfig] = useState<StaticConfig>({
    namePrefix: 'Test_HYPE',
    exchange: 'BINANCE_FUTURES',
    algo: 'LONG',
    symbol: 'HYPE',
    deposit: 50,
    leverage: 10,
    marginType: 'CROSS',
    portion: 7,
    dateFrom: dayjs().subtract(7, 'day').toDate(),
    dateTo: new Date(),
    makerFee: '0.02',
    takerFee: '0.055',
    isPublic: true,
    useWicks: true
  });

  const [entryConfig, setEntryConfig] = useState<EntryConfig>({
    filterSlots: []
  });

  const [orderState, setOrderState] = useState<OrderState>({
    mode: 'SIMPLE',
    // ИСПРАВЛЕНО: pullUp теперь строка '0.2'
    general: { pullUp: '0.2' },
    simple: {
      orders: ['10'], martingale: ['5'], indent: ['0.2'], overlap: ['15'],
      logarithmicEnabled: true, logarithmicFactor: ['2.1'], includePosition: true
    },
    custom: { baseOrder: { indent: [], volume: 100 }, orders: [] },
    signal: {
      baseOrder: { indent: ['0'], volume: 10 },
      indentType: 'ORDER', 
      orders: [
        { id: 'init-1', indent: ['0.5'], volume: 10, filterSlots: [] }, 
        { id: 'init-2', indent: ['1.0'], volume: 20, filterSlots: [] }, 
      ]
    }
  });

  const [exitConfig, setExitConfig] = useState<ExitConfig>({
    profitMode: 'SINGLE',
    profitSingle: { percents: ['1.0'] },
    profitMultiple: { orders: [{ id: 'init-exit-1', indent: ['1.0'], volume: 100 }], breakeven: null },
    profitSignal: { checkPnl: ['null'], filterSlots: [] },
    stopLoss: {
        enabledSimple: false, indent: [], 
        enabledSignal: false, conditionalIndent: [], conditionalIndentType: 'AVERAGE', filterSlots: []
    }
  });

  // --- 2. ЛОГИКА ОЧЕРЕДИ (HOOK) ---
  const { 
    isRunning, 
    progress, 
    results, 
    currentStatus, 
    startQueue, 
    stopQueue 
  } = useBacktestQueue();

  // --- 3. STATE ПРЕДПРОСМОТРА JSON ---
  const [previewOpened, { open: openPreview, close: closePreview }] = useDisclosure(false);
  const [previewJson, setPreviewJson] = useState('');


  // --- 4. HANDLERS ---

  // Просто подсчет (без запуска)
  const handleLogConfig = () => {
    // 1. Entry
    let entryCombinations = 1;
    if (entryConfig.filterSlots.length > 0) {
        entryCombinations = entryConfig.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }

    // 2. Orders
    let orderCombinations = 0;
    // ИСПРАВЛЕНО: pullUp исключен из множителей
    
    if (orderState.mode === 'SIMPLE') {
       const s = orderState.simple;
       // Только множители параметров сетки
       orderCombinations = 
         s.orders.length * s.martingale.length * s.indent.length * s.overlap.length * (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
    } 
    else if (orderState.mode === 'CUSTOM') {
      const c = orderState.custom;
      let customComb = c.baseOrder.indent.length || 1;
      c.orders.forEach(o => { customComb *= (o.indent.length || 1); });
      orderCombinations = customComb;
    }
    else {
      // SIGNAL
      let sigComb = orderState.signal.baseOrder.indent.length || 1;
      orderState.signal.orders.forEach(o => {
         let filterComb = 1;
         if (o.filterSlots?.length > 0) filterComb = o.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
         sigComb *= ((o.indent.length || 1) * filterComb);
      });
      orderCombinations = sigComb;
    }

    // 3. Exit (Profit * StopLoss)
    let profitCombinations = 1;
    if (exitConfig.profitMode === 'SINGLE') profitCombinations = exitConfig.profitSingle.percents.length || 1;
    else if (exitConfig.profitMode === 'MULTIPLE') {
        if (exitConfig.profitMultiple.orders.length > 0) {
            exitConfig.profitMultiple.orders.forEach(o => { profitCombinations *= (o.indent.length || 1); });
        }
    }
    else if (exitConfig.profitMode === 'SIGNAL') {
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
    alert(`Комбинаций входа: ${entryCombinations}\nКомбинаций сетки: ${orderCombinations}\nКомбинаций выхода: ${profitCombinations * slCombinations}\n\nИТОГО ТЕСТОВ: ${totalCount}`);
  };

  // Предпросмотр JSON
  const handlePreview = () => {
    // Валидация условий
    const hasConditions = entryConfig.filterSlots.length > 0 && 
                          entryConfig.filterSlots.some(slot => slot.variants.length > 0);
    if (!hasConditions) {
        alert("Ошибка: Не заданы условия входа (Индикаторы).\nДобавьте хотя бы одно условие для корректного предпросмотра.");
        return;
    }

    const configs = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig);
    if (configs.length === 0) {
        alert("Ошибка: Конфигурации не сгенерированы.");
        return;
    }
    setPreviewJson(JSON.stringify(configs[0], null, 2));
    openPreview();
  };

  // ЗАПУСК БЕКТЕСТОВ
  const handleRunTests = () => {
      // 0. ВАЛИДАЦИЯ УСЛОВИЙ
      const hasConditions = entryConfig.filterSlots.length > 0 && 
                            entryConfig.filterSlots.some(slot => slot.variants.length > 0);

      if (!hasConditions) {
          alert("Ошибка: Не заданы условия входа (Индикаторы).\nVeles требует хотя бы одно условие для запуска теста.");
          return;
      }

      // 1. Генерируем конфиги
      const configs = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig);
      
      if (configs.length === 0) {
          alert("Ошибка: Не сгенерировано ни одной конфигурации. Проверьте настройки.");
          return;
      }

      // 2. Подтверждение
      const confirmed = window.confirm(`Сгенерировано ${configs.length} уникальных конфигураций.\n\nЗапустить процесс тестирования?`);
      if (!confirmed) return;

      // 3. Старт
      startQueue(configs);
  };

  // --- RENDER ---
  return (
    <Container size="md" py="xl" pb={100}>
      <Group mb="lg" justify="center">
        <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
        <Title order={2}>Конфигуратор Бектестов</Title>
      </Group>

      <Stack gap="xl">
        {/* БЛОК НАСТРОЕК */}
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        <EntrySettings config={entryConfig} onChange={setEntryConfig} />
        <OrderSettings state={orderState} onChange={setOrderState} />
        <ExitSettings config={exitConfig} onChange={setExitConfig} />

        {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
        <Paper p="md" withBorder radius="md" bg="gray.0">
             <Stack gap="md">
                
                {/* Кнопки */}
                <Group grow>
                    <Button 
                        size="md" variant="default" color="gray" 
                        onClick={handleLogConfig}
                        disabled={isRunning}
                    >
                        Проверить количество
                    </Button>

                    <Button 
                        size="md" variant="default" color="gray"
                        leftSection={<IconCode size={20} />} 
                        onClick={handlePreview}
                        disabled={isRunning}
                    >
                        JSON (Debug)
                    </Button>

                    {!isRunning ? (
                        <Button 
                            size="md" color="blue" 
                            leftSection={<IconPlayerPlay size={20} />}
                            onClick={handleRunTests}
                        >
                            Запустить бектесты
                        </Button>
                    ) : (
                        <Button 
                            size="md" color="red" variant="outline"
                            leftSection={<IconPlayerStop size={20} />}
                            onClick={stopQueue}
                        >
                            Остановить ({progress.current}/{progress.total})
                        </Button>
                    )}
                </Group>

                {/* Статус бар (если запущено или есть результаты) */}
                {(isRunning || results.length > 0) && (
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" fw={500}>{currentStatus}</Text>
                            <Badge size="lg" variant="light">
                                {progress.current} / {progress.total}
                            </Badge>
                        </Group>
                        <Progress 
                            value={(progress.current / (progress.total || 1)) * 100} 
                            animated={isRunning} 
                            color={isRunning ? 'blue' : 'green'}
                            size="md" radius="xl"
                        />
                    </Stack>
                )}

             </Stack>
        </Paper>

        {/* ТАБЛИЦА РЕЗУЛЬТАТОВ */}
        {results.length > 0 && (
            <Stack gap="xs">
                <Text fw={700} size="lg">Результаты тестирования</Text>
                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <ResultsTable results={results} />
                </Paper>
            </Stack>
        )}

      </Stack>

      {/* МОДАЛКА С JSON (PREVIEW) */}
      <Modal opened={previewOpened} onClose={closePreview} title="Предпросмотр Payload (1-й вариант)" size="lg">
         <Stack>
             <Text size="sm" c="dimmed">
                Это то, что будет отправлено на сервер Veles. Проверьте поля pullUp, profit, stopLoss.
             </Text>
             <ScrollArea h={400} type="auto" offsetScrollbars>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                    {previewJson}
                </Code>
             </ScrollArea>
             <Group justify="flex-end">
                <CopyButton value={previewJson} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button color={copied ? 'teal' : 'blue'} onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
                      {copied ? 'Скопировано' : 'Копировать JSON'}
                    </Button>
                  )}
                </CopyButton>
             </Group>
         </Stack>
      </Modal>

    </Container>
  );
}

// --- ГЛАВНЫЙ КОМПОНЕНТ ---
function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsFullscreen(params.get('mode') === 'fullscreen');
  }, []);

  if (isFullscreen) {
    return <FullscreenMode />;
  }

  return <PopupMode />;
}

export default App;