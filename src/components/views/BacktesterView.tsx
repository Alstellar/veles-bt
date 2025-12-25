import { useState } from 'react';
import { 
  Container, Title, Button, Stack, Paper, Text, ThemeIcon, Group, 
  Progress, Badge, Modal, Code, ScrollArea, CopyButton 
} from '@mantine/core';
import { 
  IconSettings, IconPlayerPlay, IconPlayerStop, IconCode, IconCopy, IconCheck 
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';

import { StaticSettings } from '../StaticSettings';
import { OrderSettings } from '../OrderSettings';
import { EntrySettings } from '../EntrySettings';
import { ExitSettings } from '../ExitSettings';
import { ResultsTable } from '../ResultsTable';

import { ConfigGenerator } from '../../services/ConfigGenerator';
import { ValidatorService } from '../../services/ValidatorService'; // <-- ИМПОРТ ВАЛИДАТОРА
import { useBacktestQueue } from '../../hooks/useBacktestQueue';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from '../../types';

export function BacktesterView() {
  
  // --- STATE ---
  const [staticConfig, setStaticConfig] = useState<StaticConfig>({
    namePrefix: 'Test',
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

  const { isRunning, progress, results, currentStatus, startQueue, stopQueue } = useBacktestQueue();
  const [previewOpened, { open: openPreview, close: closePreview }] = useDisclosure(false);
  const [previewJson, setPreviewJson] = useState('');

  const handleLogConfig = () => {
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
    alert(`Комбинаций входа: ${entryCombinations}\nКомбинаций сетки: ${orderCombinations}\nКомбинаций выхода: ${profitCombinations * slCombinations}\n\nИТОГО ТЕСТОВ: ${totalCount}`);
  };

  const handlePreview = () => {
    // 1. ВАЛИДАЦИЯ
    const validation = ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig);
    if (!validation.valid) {
        alert(`❌ Ошибка валидации:\n${validation.error}`);
        return;
    }

    // 2. ГЕНЕРАЦИЯ
    const { configs } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig, "#DEMO");
    if (configs.length === 0) {
        alert("Ошибка: Конфигурации не сгенерированы.");
        return;
    }
    setPreviewJson(JSON.stringify(configs[0], null, 2));
    openPreview();
  };

  const handleRunTests = () => {
      // 1. ВАЛИДАЦИЯ
      const validation = ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig);
      if (!validation.valid) {
          alert(`❌ Ошибка валидации:\n${validation.error}`);
          return;
      }

      // 2. ГЕНЕРАЦИЯ
      const { configs, batchId } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig);
      if (configs.length === 0) {
          alert("Ошибка: Не сгенерировано ни одной конфигурации.");
          return;
      }

      // 3. ПОДТВЕРЖДЕНИЕ
      const confirmed = window.confirm(`Сгенерирована группа ${batchId}\nКоличество тестов: ${configs.length}.\n\nЗапустить процесс?`);
      if (!confirmed) return;
      
      // 4. СТАРТ
      startQueue({ configs, batchId });
  };

  return (
    <Container size="md" py="xl" pb={100}>
      <Group mb="lg" justify="center">
        <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
        <Title order={2}>Конфигуратор Бектестов</Title>
      </Group>

      <Stack gap="xl">
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        <EntrySettings config={entryConfig} onChange={setEntryConfig} />
        <OrderSettings state={orderState} onChange={setOrderState} />
        <ExitSettings config={exitConfig} onChange={setExitConfig} />

        <Paper p="md" withBorder radius="md" bg="gray.0">
             <Stack gap="md">
                <Group grow>
                    <Button size="md" variant="default" color="gray" onClick={handleLogConfig} disabled={isRunning}>
                        Проверить количество
                    </Button>
                    <Button size="md" variant="default" color="gray" leftSection={<IconCode size={20} />} onClick={handlePreview} disabled={isRunning}>
                        JSON (Debug)
                    </Button>
                    {!isRunning ? (
                        <Button size="md" color="blue" leftSection={<IconPlayerPlay size={20} />} onClick={handleRunTests}>
                            Запустить бектесты
                        </Button>
                    ) : (
                        <Button size="md" color="red" variant="outline" leftSection={<IconPlayerStop size={20} />} onClick={stopQueue}>
                            Остановить ({progress.current}/{progress.total})
                        </Button>
                    )}
                </Group>

                {(isRunning || results.length > 0) && (
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" fw={500}>{currentStatus}</Text>
                            <Badge size="lg" variant="light">{progress.current} / {progress.total}</Badge>
                        </Group>
                        <Progress value={(progress.current / (progress.total || 1)) * 100} animated={isRunning} color={isRunning ? 'blue' : 'green'} size="md" radius="xl" />
                    </Stack>
                )}
             </Stack>
        </Paper>

        {results.length > 0 && (
            <Stack gap="xs">
                <Text fw={700} size="lg">Результаты тестирования</Text>
                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <ResultsTable results={results} />
                </Paper>
            </Stack>
        )}
      </Stack>

      <Modal opened={previewOpened} onClose={closePreview} title="Предпросмотр Payload (1-й вариант)" size="lg">
         <Stack>
             <Text size="sm" c="dimmed">Это то, что будет отправлено на сервер Veles. ID группы будет сгенерирован при реальном запуске.</Text>
             <ScrollArea h={400} type="auto" offsetScrollbars>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{previewJson}</Code>
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