import { useState, useEffect } from 'react';
import { 
  Container, Title, Button, Stack, Paper, Text, Center, ThemeIcon, Group, 
  Progress, Badge, Modal, Code, ScrollArea, CopyButton, AppShell, NavLink, 
  SimpleGrid, Card, Loader, Accordion, Alert
} from '@mantine/core';
import { 
  IconExternalLink, IconRocket, IconSettings, IconPlayerPlay, 
  IconPlayerStop, IconCode, IconCopy, IconCheck, IconLayoutDashboard, 
  IconTestPipe, IconHistory, IconPlugConnected, IconAlertCircle, IconRefresh
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
import { HistoryView } from './components/HistoryView';
import { ConfigGenerator } from './services/ConfigGenerator';
import { useBacktestQueue } from './hooks/useBacktestQueue';
import { VelesService } from './services/VelesService'; // <-- Для проверки авторизации

import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from './types';
import type { UserProfile } from './services/VelesService';

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
        <Title order={3} mb="sm">Veles Helper</Title>
        <Text size="sm" c="dimmed" mb="xl">
          Конфигуратор параметров для поиска эффективных стратегий.
        </Text>
        <Button 
          fullWidth size="md" 
          rightSection={<IconExternalLink size={20} />}
          onClick={openFullTab}
        >
          Открыть панель управления
        </Button>
      </Paper>
    </Center>
  );
}

// --- ВИД: DASHBOARD (Приветствие) ---
function DashboardView({ onNavigate }: { onNavigate: (view: string) => void }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Проверка авторизации при загрузке
    const checkAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            const tab = await VelesService.findTab();
            if (!tab || !tab.id) {
                throw new Error("Вкладка veles.finance не найдена");
            }
            const res = await VelesService.getProfile(tab.id);
            if (res.success && res.data) {
                setUser(res.data);
            } else {
                throw new Error("Не удалось получить профиль (вы не авторизованы?)");
            }
        } catch (e: any) {
            setError(e.message);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                <Group justify="space-between" align="flex-start">
                    <div>
                        <Title order={1}>Veles Helper</Title>
                        <Text c="dimmed">Конфигуратор параметров для поиска эффективных стратегий.</Text>
                    </div>
                    
                    {/* БЛОК СТАТУСА ПОДКЛЮЧЕНИЯ */}
                    <Paper withBorder p="xs" px="md" radius="md" bg="white">
                        {loading ? (
                            <Group>
                                <Loader size="xs" />
                                <Text size="sm">Проверка связи...</Text>
                            </Group>
                        ) : error ? (
                            <Group>
                                <ThemeIcon color="red" variant="light" size="sm"><IconAlertCircle size={14}/></ThemeIcon>
                                <Text size="sm" c="red" fw={500}>Нет соединения</Text>
                                <Button variant="subtle" size="compact-xs" onClick={checkAuth} leftSection={<IconRefresh size={12}/>}>
                                    Обновить
                                </Button>
                            </Group>
                        ) : (
                            <Group>
                                <ThemeIcon color="green" variant="light" size="sm"><IconPlugConnected size={14}/></ThemeIcon>
                                <Stack gap={0}>
                                    <Text size="xs" c="dimmed" fw={700}>СВЯЗЬ АКТИВНА</Text>
                                    <Text size="sm" fw={500}>Привет, ID: {user?.id}</Text>
                                </Stack>
                            </Group>
                        )}
                    </Paper>
                </Group>

                {error && (
                    <Alert variant="light" color="red" title="Внимание" icon={<IconAlertCircle />}>
                        Для работы расширения необходимо открыть вкладку <b>veles.finance</b> в этом же браузере и авторизоваться.
                    </Alert>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    {/* КАРТОЧКА: Запуск */}
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                            <Text fw={500}>Бектесты</Text>
                            <Badge color="blue" variant="light">Основное</Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mb="lg">
                            Создание конфигураций, генерация сеток Grid Search и массовый запуск тестов в фоновом режиме.
                        </Text>
                        <Button 
                            variant="light" color="blue" fullWidth mt="md" radius="md"
                            leftSection={<IconTestPipe size={20}/>}
                            onClick={() => onNavigate('backtester')}
                            disabled={!!error}
                        >
                            Запустить новый тест
                        </Button>
                    </Card>

                    {/* КАРТОЧКА: История */}
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                            <Text fw={500}>История запусков</Text>
                            <Badge color="violet" variant="light">Доступно</Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mb="lg">
                            Просмотр результатов предыдущих сессий (Batches). Список ID успешных тестов и параметры.
                        </Text>
                        <Button 
                            variant="light" color="gray" fullWidth mt="md" radius="md"
                            leftSection={<IconHistory size={20}/>}
                            onClick={() => onNavigate('history')}
                        >
                            Открыть историю
                        </Button>
                    </Card>
                </SimpleGrid>

                {/* FAQ SECTION */}
                <Paper withBorder p="xl" radius="md" bg="gray.0">
                    <Title order={4} mb="md">Часто задаваемые вопросы</Title>
                    <Accordion variant="separated" radius="md">
                        <Accordion.Item value="grid">
                            <Accordion.Control>Что такое Grid Search (перебор)?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Это метод поиска оптимальных настроек путем перебора всех возможных комбинаций. 
                                    Если вы укажете 3 варианта отступа и 2 варианта мартингейла, расширение проведет 3 * 2 = 6 тестов, 
                                    чтобы выяснить, какая комбинация дает лучший Profit при меньшей просадке.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="close">
                            <Accordion.Control>Можно ли закрывать расширение во время теста?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    <b>Нет.</b> Очередь тестов управляется скриптом внутри этой вкладки. 
                                    Если вы закроете вкладку расширения, запуск новых тестов остановится. 
                                    Однако уже запущенный (текущий) тест завершится на сервере Veles корректно.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="safe">
                            <Accordion.Control>Это безопасно? Вы крадете мои API ключи?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Абсолютно безопасно. Расширение <b>не требует</b> ввода API ключей бирж или паролей от Veles. 
                                    Оно работает поверх вашей уже открытой сессии в браузере (использует cookies авторизации). 
                                    Все данные (настройки, история) хранятся локально на вашем компьютере.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="limits">
                            <Accordion.Control>Как работают лимиты Veles?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Veles ограничивает частоту запуска тестов (примерно 1 тест в 30 секунд). 
                                    Наше расширение автоматически соблюдает эти паузы (Smart Delay), показывая таймер обратного отсчета ("Остываем..."), 
                                    чтобы ваш аккаунт не получил временную блокировку за спам запросами.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Paper>
            </Stack>
        </Container>
    );
}

// --- ВИД: BACKTESTER (Бывший FullscreenMode) ---
function BacktesterView() {
    // --- 1. STATE НАСТРОЕК ---
  
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
    
    if (orderState.mode === 'SIMPLE') {
       const s = orderState.simple;
       // pullUp теперь исключен из комбинаторики
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

    // Генерируем с фейковым batchId для превью
    const { configs } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig, "#DEMO");
    
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

      // 1. Генерируем конфиги (здесь создается BatchID)
      const { configs, batchId } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig);
      
      if (configs.length === 0) {
          alert("Ошибка: Не сгенерировано ни одной конфигурации. Проверьте настройки.");
          return;
      }

      // 2. Подтверждение
      const confirmed = window.confirm(`Сгенерирована группа ${batchId}\nКоличество тестов: ${configs.length}.\n\nЗапустить процесс?`);
      if (!confirmed) return;

      // 3. Старт (передаем и конфиги, и ID группы)
      startQueue({ configs, batchId });
  };

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
                Это то, что будет отправлено на сервер Veles. ID группы будет сгенерирован при реальном запуске.
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

// --- КОМПОНЕНТ: ПОЛНОЦЕННАЯ ВКЛАДКА (Layout) ---
function FullscreenMode() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="xs">
         <Stack gap="xs">
            <Group px="md" py="xs" mb="sm">
                <ThemeIcon variant="light" color="blue" size="lg"><IconRocket/></ThemeIcon>
                <Text fw={700} size="lg">Veles Helper</Text>
            </Group>

            <NavLink 
                label="Главная" 
                leftSection={<IconLayoutDashboard size={20} stroke={1.5} />}
                active={activeTab === 'dashboard'}
                onClick={() => setActiveTab('dashboard')}
                variant="light"
            />
            <NavLink 
                label="Бектесты" 
                leftSection={<IconTestPipe size={20} stroke={1.5} />}
                active={activeTab === 'backtester'}
                onClick={() => setActiveTab('backtester')}
                variant="light"
            />
            <NavLink 
                label="История запусков" 
                leftSection={<IconHistory size={20} stroke={1.5} />}
                active={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                variant="light"
            />
         </Stack>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
         {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
         {activeTab === 'backtester' && <BacktesterView />}
         {activeTab === 'history' && <HistoryView />}
      </AppShell.Main>
    </AppShell>
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