// src/components/layouts/MainLayout.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  AppShell, Stack, Group, Text, NavLink, Modal, TextInput, Button, Image, Divider, Anchor, Paper, ThemeIcon, Loader
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconLayoutDashboard, IconTestPipe, IconHistory, IconTemplate,
  IconBrandGithub, IconBrandTelegram, IconHeart, IconCheck, IconSettings, IconAlertCircle, IconPlugConnected, IconRefresh, IconCoins, IconList
} from '@tabler/icons-react';
import dayjs from 'dayjs';

import { DashboardView } from '../views/DashboardView';
import { BacktestsView } from '../views/BacktestsView';
import { BacktesterView } from '../views/BacktesterView';
import { BacktesterViewV2 } from '../views/BacktesterViewV2';
import { DirectedSearchView } from '../views/DirectedSearchView';
import { AssetsView } from '../views/AssetsView';
import { TemplatesView } from '../views/TemplatesView';
import { HistoryView } from '../views/HistoryView';
import { SettingsView } from '../views/SettingsView';
import { ResultsModal } from '../ResultsModal';

// Импорт модального окна поддержки
import { DonateModal } from '../modals/DonateModal'; 

import { StorageService } from '../../services/StorageService';
import { DatabaseService } from '../../services/DatabaseService';
import { useBacktestQueue } from '../../hooks/useBacktestQueue';
import { useBacktestQueueV2 } from '../../hooks/useBacktestQueueV2';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, Template, BatchInfo, BatchResumeSource } from '../../types';
import { LogService } from '../../services/LogService';
import { getObjectDiff } from '../../utils/objectDiff';
import { configHash } from '../../utils/configHash';
import { fetchImportPayload } from '../../services/apiService';
import { parseImportLink, mapImportedPayload, getV2ImportIncompatibilities } from '../../services/ImportSettingsService';
import { ConnectionService } from '../../services/ConnectionService';
import { QueueLockService } from '../../services/QueueLockService';
import { setMinTestInterval } from '../../services/QueueRetryPolicy';
import type { UserProfile } from '../../types/veles';
import { parseDateLike, toIsoDateTime } from '../../utils/datePolicy';
import styles from './MainLayout.module.css';

export function MainLayout() {
  const queueController = useBacktestQueue();
  const queueControllerV2 = useBacktestQueueV2();
  const [liveResultsOpened, setLiveResultsOpened] = useState(false);
  const [liveResultsTitle, setLiveResultsTitle] = useState('');
  const [liveResultsOpenedV2, setLiveResultsOpenedV2] = useState(false);
  const [liveResultsTitleV2, setLiveResultsTitleV2] = useState('');

  const cloneResumeSource = (source: BatchResumeSource): BatchResumeSource => {
    if (typeof structuredClone === 'function') {
      return structuredClone(source);
    }
    return JSON.parse(JSON.stringify(source)) as BatchResumeSource;
  };

  const normalizeConfigForCompare = (config: {
    staticConfig: StaticConfig;
    entryConfig: EntryConfig;
    orderState: OrderState;
    exitConfig: ExitConfig;
  }) => {
    const toIsoDateSafe = (value: unknown): string => {
      return toIsoDateTime(parseDateLike(value as Date | string | number | null | undefined)) ?? '';
    };

    return ({
    staticConfig: {
      ...config.staticConfig,
      dateFrom: toIsoDateSafe(config.staticConfig.dateFrom),
      dateTo: toIsoDateSafe(config.staticConfig.dateTo)
    },
    entryConfig: config.entryConfig,
    orderState: config.orderState,
    exitConfig: config.exitConfig
    });
  };

  const appVersion = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.0.0'; 

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [resumeBatchId, setResumeBatchId] = useState<string | null>(null);
  const [resumeBatchIdV2, setResumeBatchIdV2] = useState<string | null>(null);
  const [resumeBacktestsBatchId, setResumeBacktestsBatchId] = useState<string | null>(null);
  const [sidebarUser, setSidebarUser] = useState<UserProfile | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  // --- GLOBAL STATE ---
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

  // --- SAVE TEMPLATE LOGIC ---
  const [saveModalOpened, { open: openSaveModal, close: closeSaveModal }] = useDisclosure(false);
  const [templateName, setTemplateName] = useState('');
  const activeTabRef = useRef(activeTab);
  const configRef = useRef({ staticConfig, entryConfig, orderState, exitConfig });

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    configRef.current = { staticConfig, entryConfig, orderState, exitConfig };
  }, [staticConfig, entryConfig, orderState, exitConfig]);

  useEffect(() => {
    const initV2Interval = async () => {
      const interval = await StorageService.getV2IntervalSeconds();
      setMinTestInterval(interval * 1000);
    };
    void initV2Interval();
  }, []);

  useEffect(() => {
    const runStorageMigration = async () => {
      try {
        await DatabaseService.runLegacyMigration();
      } catch (error) {
        console.error('Database migration failed:', error);
      }
    };
    void runStorageMigration();
  }, []);

  useEffect(() => {
    void LogService.info('layout', 'main_layout.opened', { tab: activeTab });
  }, []);

  useEffect(() => {
    void LogService.info('layout', 'navigation.changed', { tab: activeTab });
  }, [activeTab]);

  const refreshSidebarProfile = useCallback(async () => {
    setSidebarLoading(true);
    setSidebarError(null);
    try {
      const result = await ConnectionService.getConnection({ force: true });
      if (!result.success) {
        throw new Error(ConnectionService.reasonToMessage(result.reason));
      }
      setSidebarUser(result.connection.user);
    } catch (e: any) {
      setSidebarError(e.message);
      setSidebarUser(null);
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSidebarProfile();
  }, [refreshSidebarProfile]);

  useEffect(() => {
    if (queueController.isRunning) {
      setLiveResultsOpened(true);
    }
  }, [queueController.isRunning]);

  useEffect(() => {
    if (queueControllerV2.isRunning) {
      setLiveResultsOpenedV2(true);
    }
  }, [queueControllerV2.isRunning]);

  const openLiveResultsModal = useCallback((title?: string) => {
    if (title && title.trim()) {
      setLiveResultsTitle(title);
    }
    setLiveResultsOpened(true);
  }, []);

  const openLiveResultsModalV2 = useCallback((title?: string) => {
    if (title && title.trim()) {
      setLiveResultsTitleV2(title);
    }
    setLiveResultsOpenedV2(true);
  }, []);

  const closeLiveResultsModal = useCallback(() => {
    setLiveResultsOpened(false);
  }, []);

  const closeLiveResultsModalV2 = useCallback(() => {
    setLiveResultsOpenedV2(false);
  }, []);

  const logConfigSectionChanges = useCallback(
    async (section: 'staticConfig' | 'entryConfig' | 'orderState' | 'exitConfig', before: unknown, after: unknown) => {
      const changes = getObjectDiff(before, after, 25);
      if (changes.length === 0) return;

      const snapshot = {
        staticConfig: section === 'staticConfig' ? after : configRef.current.staticConfig,
        entryConfig: section === 'entryConfig' ? after : configRef.current.entryConfig,
        orderState: section === 'orderState' ? after : configRef.current.orderState,
        exitConfig: section === 'exitConfig' ? after : configRef.current.exitConfig
      };

      for (const change of changes) {
        const action =
          change.before === undefined && change.after !== undefined
            ? 'added'
            : change.before !== undefined && change.after === undefined
              ? 'removed'
              : 'updated';

        await LogService.info('configurator', 'config.field_changed', {
          section,
          action,
          path: change.path,
          before: change.before,
          after: change.after,
          configHash: configHash(snapshot)
        });
      }
    },
    []
  );

  const handleStaticConfigChange = useCallback(
    (next: StaticConfig) => {
      const prev = staticConfig;
      setStaticConfig(next);
      void logConfigSectionChanges('staticConfig', prev, next);
    },
    [staticConfig, logConfigSectionChanges]
  );

  const handleEntryConfigChange = useCallback(
    (next: EntryConfig) => {
      const prev = entryConfig;
      setEntryConfig(next);
      void logConfigSectionChanges('entryConfig', prev, next);
    },
    [entryConfig, logConfigSectionChanges]
  );

  const handleOrderStateChange = useCallback(
    (next: OrderState) => {
      const prev = orderState;
      setOrderState(next);
      void logConfigSectionChanges('orderState', prev, next);
    },
    [orderState, logConfigSectionChanges]
  );

  const handleExitConfigChange = useCallback(
    (next: ExitConfig) => {
      const prev = exitConfig;
      setExitConfig(next);
      void logConfigSectionChanges('exitConfig', prev, next);
    },
    [exitConfig, logConfigSectionChanges]
  );

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Введите название шаблона');
      await LogService.warn('templates', 'template.save_validation_failed', { reason: 'empty_name' });
      return;
    }

    const currentTab = activeTabRef.current;
    const apiVersion = currentTab === 'backtester-v2' || currentTab === 'directed-search' ? 'v2' : 'v1';

    const newTemplate: Template = {
        id: crypto.randomUUID(),
        name: templateName,
        timestamp: Date.now(),
        apiVersion,
        config: {
            staticConfig,
            entryConfig,
            orderState,
            exitConfig
        }
    };

    await StorageService.saveTemplate(newTemplate);
    await LogService.info('templates', 'template.saved', {
      templateId: newTemplate.id,
      name: newTemplate.name,
      configHash: configHash(newTemplate.config),
      apiVersion
    });
    closeSaveModal();
    setTemplateName('');
    alert('Шаблон успешно сохранен!');
  };

  // --- LOAD TEMPLATE LOGIC ---
  const handleLoadTemplate = (template: Template) => {
      const restoredStatic = {
          ...template.config.staticConfig,
          dateFrom: parseDateLike(template.config.staticConfig.dateFrom) ?? dayjs().subtract(7, 'day').toDate(),
          dateTo: parseDateLike(template.config.staticConfig.dateTo) ?? new Date()
      };

      setStaticConfig(restoredStatic);
      setEntryConfig(template.config.entryConfig);
      setOrderState(template.config.orderState);
      setExitConfig(template.config.exitConfig);
      void LogService.info('templates', 'template.loaded', {
        templateId: template.id,
        name: template.name,
        configHash: configHash(template.config),
        apiVersion: template.apiVersion || 'v1'
      });

      const targetTab = template.apiVersion === 'v2' ? 'backtester-v2' : 'backtester';
      setActiveTab(targetTab);
  };

  const handleResumeFromHistory = useCallback(async (batch: BatchInfo) => {
    if (batch.mode === 'BACKTESTS' || batch.backtestsSource) {
      setLiveResultsTitle(`${batch.namePrefix} (${batch.id})`);
      setResumeBacktestsBatchId(batch.id);
      setActiveTab('backtests');
      return;
    }

    if (!batch.resumeSource) {
      alert('Этот запуск невозможно продолжить: не найдены данные для восстановления.');
      return;
    }

    const source = cloneResumeSource(batch.resumeSource);
    const restoredStatic: StaticConfig = {
      ...source.staticConfig,
      dateFrom: parseDateLike(source.staticConfig.dateFrom) ?? dayjs().subtract(7, 'day').toDate(),
      dateTo: parseDateLike(source.staticConfig.dateTo) ?? new Date()
    };

    const currentSnapshot = normalizeConfigForCompare({
      staticConfig,
      entryConfig,
      orderState,
      exitConfig
    });
    const resumeSnapshot = normalizeConfigForCompare({
      staticConfig: restoredStatic,
      entryConfig: source.entryConfig,
      orderState: source.orderState,
      exitConfig: source.exitConfig
    });

    if (configHash(currentSnapshot) !== configHash(resumeSnapshot)) {
      const confirmed = window.confirm(
        'Текущие настройки будут заменены конфигурацией выбранного запуска. Продолжить?'
      );
      if (!confirmed) return;
    }

    setStaticConfig(restoredStatic);
    setEntryConfig(source.entryConfig);
    setOrderState(source.orderState);
    setExitConfig(source.exitConfig);
    const runtime = await StorageService.getBatchRuntime(batch.id);
    const apiVersion = runtime?.apiVersion ?? batch.apiVersion ?? 'v1';

    if (apiVersion === 'v2') {
      setLiveResultsTitleV2(`${batch.namePrefix} (${batch.id})`);
      setResumeBatchIdV2(batch.id);
      setActiveTab('backtester-v2');
      return;
    }

    setLiveResultsTitle(`${batch.namePrefix} (${batch.id})`);
    setResumeBatchId(batch.id);
    setActiveTab('backtester');
  }, [staticConfig, entryConfig, orderState, exitConfig]);

  const handleStopBatchFromHistory = useCallback(async (batch: BatchInfo) => {
    const runtime = await StorageService.getBatchRuntime(batch.id);
    const apiVersion = runtime?.apiVersion ?? batch.apiVersion ?? 'v1';

    if (apiVersion === 'v2') {
      if (queueControllerV2.isRunning && queueControllerV2.currentBatchId === batch.id) {
        queueControllerV2.stop();
        return;
      }
    } else if (queueController.isRunning && queueController.currentBatchId === batch.id) {
      queueController.stop();
      return;
    }

    await QueueLockService.requestStop(batch.id);
  }, [queueController, queueControllerV2]);

  // --- GRATITUDE MODAL LOGIC ---
  const [gratitudeOpened, { open: openGratitude, close: closeGratitude }] = useDisclosure(false);
  const [importModalV2Opened, { open: openImportModalV2, close: closeImportModalV2 }] = useDisclosure(false);
  const [importTarget, setImportTarget] = useState<'v1' | 'v2' | null>(null);
  const [importLink, setImportLink] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const openImportModalFor = useCallback((target: 'v1' | 'v2') => {
    setImportTarget(target);
    openImportModalV2();
  }, [openImportModalV2]);

  const closeImportModal = useCallback(() => {
    closeImportModalV2();
    setImportTarget(null);
    setImportLink('');
  }, [closeImportModalV2]);

  const handleImportSettings = async () => {
    const parsed = parseImportLink(importLink);
    if (!parsed) {
      alert('Поддерживается ссылка на бота формата https://veles.finance/share/***** из кнопки «Поделиться»');
      return;
    }

    setIsImporting(true);
    try {
      const payload = await fetchImportPayload(parsed.code);
      const incompatibilities = importTarget === 'v2'
        ? getV2ImportIncompatibilities(payload as any)
        : [];
      if (importTarget === 'v2' && incompatibilities.length > 0) {
        alert(`Импорт невозможен: бот содержит параметры, которые не поддерживаются Конфигуратором 2.0:\n- ${incompatibilities.join('\n- ')}`);
        return;
      }

      const mapped = mapImportedPayload(payload as any, {
        staticConfig,
        entryConfig,
        orderState,
        exitConfig
      });

      setStaticConfig(mapped.staticConfig);
      setEntryConfig(mapped.entryConfig);
      setOrderState(mapped.orderState);
      setExitConfig(mapped.exitConfig);

      closeImportModal();

      if (mapped.warnings.length > 0) {
        alert(`Импорт выполнен с предупреждениями:\n- ${mapped.warnings.join('\n- ')}`);
      } else {
        alert('Настройки успешно импортированы.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Не удалось импортировать настройки: ${message}`);
    } finally {
      setIsImporting(false);
    }
  };
  
  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="xs" className={styles.sidebar}>
          
          <Stack gap="xs" className={styles.navTop}>
            <Group px="md" py="xs" mb="sm" className={styles.brandRow}>
                <Image 
                    src="/icons/icon-128.png" 
                    w={32} 
                    h={32} 
                    radius="sm" 
                />
                <Text fw={700} size="lg">Veles Helper</Text>
            </Group>
            <Paper withBorder p="xs" px="sm" radius="md" bg="white" mx="sm" mb="xs" className={styles.profileCard}>
              {sidebarLoading ? (
                <Group justify="center" gap={6}>
                  <Loader size="xs" />
                  <Text size="xs">Проверка профиля...</Text>
                </Group>
              ) : sidebarError ? (
                <Group justify="center" gap={6}>
                  <ThemeIcon color="red" variant="light" size="sm"><IconAlertCircle size={14} /></ThemeIcon>
                  <Text size="xs" c="red" fw={500}>Нет подключения</Text>
                  <Button variant="subtle" size="compact-xs" onClick={() => void refreshSidebarProfile()} leftSection={<IconRefresh size={12} />}>
                    Обновить
                  </Button>
                </Group>
              ) : (
                <Group justify="center" gap={6} className={styles.connectionOnline}>
                  <ThemeIcon color="green" variant="light" size="sm" className={styles.connectionIcon}>
                    <IconPlugConnected size={14} />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="9px" c="dimmed" fw={700}>ПОДКЛЮЧЕН АККАУНТ</Text>
                    <Text size="xs" fw={500}>Онлайн, ID: {sidebarUser?.id}</Text>
                  </Stack>
                </Group>
              )}
            </Paper>
            <NavLink 
                label="Главная" 
                leftSection={<IconLayoutDashboard size={20} stroke={1.5} />}
                active={activeTab === 'dashboard'}
                onClick={() => setActiveTab('dashboard')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink
                label="Активы"
                leftSection={<IconCoins size={20} stroke={1.5} />}
                active={activeTab === 'assets'}
                onClick={() => setActiveTab('assets')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink
                label="Бектесты"
                leftSection={<IconList size={20} stroke={1.5} />}
                active={activeTab === 'backtests'}
                onClick={() => setActiveTab('backtests')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink 
                label="Конфигуратор" 
                leftSection={<IconTestPipe size={20} stroke={1.5} />}
                active={activeTab === 'backtester'}
                onClick={() => setActiveTab('backtester')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink
                label="Конфигуратор 2.0"
                leftSection={<IconTestPipe size={20} stroke={1.5} />}
                active={activeTab === 'backtester-v2'}
                onClick={() => setActiveTab('backtester-v2')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink 
                label="Направленный поиск"
                leftSection={<IconTestPipe size={20} stroke={1.5} />}
                active={activeTab === 'directed-search'}
                onClick={() => setActiveTab('directed-search')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink 
                label="Шаблоны" 
                leftSection={<IconTemplate size={20} stroke={1.5} />}
                active={activeTab === 'templates'}
                onClick={() => setActiveTab('templates')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink 
                label="История запусков" 
                leftSection={<IconHistory size={20} stroke={1.5} />}
                active={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                variant="light"
                className={styles.navItem}
            />
            <NavLink 
                label="Настройки" 
                leftSection={<IconSettings size={20} stroke={1.5} />}
                active={activeTab === 'settings'}
                onClick={() => setActiveTab('settings')}
                variant="light"
                className={styles.navItem}
            />
          </Stack>

          <Stack gap="xs" px="md" mt="auto" mb="sm">
             <Button 
                component="a" 
                href="https://t.me/algo_bots" 
                target="_blank"
                variant="light" 
                color="blue" 
                fullWidth
                leftSection={<IconBrandTelegram size={18} />}
                className={styles.ctaButton}
             >
                Канал Algo Bots
             </Button>

             <Button 
                onClick={openGratitude}
                variant="light" 
                color="pink" 
                fullWidth
                leftSection={<IconHeart size={18} />}
                className={styles.ctaButton}
             >
                Сказать спасибо
             </Button>
          </Stack>

          <Stack gap={0} className={styles.contactsWrap}>
             <Divider mb="sm" />
             <Stack gap={6} px="xs" mb="xs">
                 <Group gap={8} wrap="nowrap">
                    <IconBrandTelegram size={16} style={{ opacity: 0.7 }} />
                    <Group gap={4} gap-xs={0}>
                        <Text size="xs">Разработчик:</Text>
                        <Anchor href="https://t.me/alstellar" target="_blank" size="xs" fw={600}>
                            @Alstellar
                        </Anchor>
                    </Group>
                 </Group>

                 <Group gap={8} wrap="nowrap">
                    <IconBrandGithub size={16} style={{ opacity: 0.7 }} />
                    <Group gap={4}>
                        <Text size="xs">GitHub:</Text>
                        <Anchor href="https://github.com/Alstellar/veles-bt" target="_blank" size="xs" fw={600}>
                            Veles-Helper
                        </Anchor>
                    </Group>
                 </Group>
             </Stack>
             <Text size="10px" c="dimmed" ta="center">v{appVersion} Open Source</Text>
          </Stack>

      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
         {activeTab === 'dashboard' && (
           <DashboardView onNavigate={setActiveTab} connectionError={sidebarError} />
         )}
         
<div style={{ display: activeTab === 'backtester' ? 'block' : 'none' }}>
             <BacktesterView
                staticConfig={staticConfig} setStaticConfig={handleStaticConfigChange}
                entryConfig={entryConfig} setEntryConfig={handleEntryConfigChange}
                orderState={orderState} setOrderState={handleOrderStateChange}
                exitConfig={exitConfig} setExitConfig={handleExitConfigChange}
                onSaveTemplate={openSaveModal}
                onImportSettings={() => openImportModalFor('v1')}
                queueController={queueController}
                onOpenLiveResultsModal={openLiveResultsModal}
                resumeBatchId={resumeBatchId}
                onResumeHandled={() => setResumeBatchId(null)}
                connectionError={sidebarError}
             />
          </div>

           <div style={{ display: activeTab === 'backtester-v2' ? 'block' : 'none' }}>
              <BacktesterViewV2
                 staticConfig={staticConfig} setStaticConfig={handleStaticConfigChange}
                 entryConfig={entryConfig} setEntryConfig={handleEntryConfigChange}
                 orderState={orderState} setOrderState={handleOrderStateChange}
                 exitConfig={exitConfig} setExitConfig={handleExitConfigChange}
                 onSaveTemplate={openSaveModal}
                 onImportSettings={() => openImportModalFor('v2')}
                 queueController={queueControllerV2}
                 onOpenLiveResultsModal={openLiveResultsModalV2}
                 resumeBatchId={resumeBatchIdV2}
                 onResumeHandled={() => setResumeBatchIdV2(null)}
                 connectionError={sidebarError}
              />
            </div>

           <div style={{ display: activeTab === 'directed-search' ? 'block' : 'none' }}>
              <DirectedSearchView
                 staticConfig={staticConfig} setStaticConfig={handleStaticConfigChange}
                 entryConfig={entryConfig} setEntryConfig={handleEntryConfigChange}
                 orderState={orderState} setOrderState={handleOrderStateChange}
                 exitConfig={exitConfig} setExitConfig={handleExitConfigChange}
                 onSaveTemplate={openSaveModal}
                 connectionError={sidebarError}
              />
            </div>

          {activeTab === 'assets' && (
           <AssetsView connectionError={sidebarError} />
         )}

         {activeTab === 'backtests' && (
           <BacktestsView
             queueController={queueController}
             onOpenLiveResultsModal={openLiveResultsModal}
             resumeBatchId={resumeBacktestsBatchId}
             onResumeHandled={() => setResumeBacktestsBatchId(null)}
             connectionError={sidebarError}
           />
         )}

         {activeTab === 'templates' && (
             <TemplatesView 
               onLoadTemplate={handleLoadTemplate}
               onNavigate={setActiveTab}
               connectionError={sidebarError}
             />
         )}

         {activeTab === 'history' && (
           <HistoryView
             onResumeBatch={handleResumeFromHistory}
             onStopBatch={handleStopBatchFromHistory}
             connectionError={sidebarError}
           />
         )}
         {activeTab === 'settings' && <SettingsView appVersion={appVersion} connectionError={sidebarError} />}
      </AppShell.Main>

      <ResultsModal
        opened={liveResultsOpened}
        onClose={closeLiveResultsModal}
        title={liveResultsTitle || 'Результаты'}
        batchId={queueController.currentBatchId}
        isLive={queueController.isRunning}
        status={queueController.statusMessage}
        progress={queueController.progress}
        onStop={queueController.stop}
        logs={queueController.logs}
        notificationsEnabled={queueController.notificationsEnabled}
        onToggleNotifications={queueController.setNotificationsEnabled}
      />

      <ResultsModal
        opened={liveResultsOpenedV2}
        onClose={closeLiveResultsModalV2}
        title={liveResultsTitleV2 || 'Результаты V2'}
        batchId={queueControllerV2.currentBatchId}
        isLive={queueControllerV2.isRunning}
        status={queueControllerV2.statusMessage}
        progress={queueControllerV2.progress}
        onStop={queueControllerV2.stop}
        logs={queueControllerV2.logs}
        notificationsEnabled={queueControllerV2.notificationsEnabled}
        onToggleNotifications={queueControllerV2.setNotificationsEnabled}
      />

      <Modal opened={saveModalOpened} onClose={closeSaveModal} title="Сохранить шаблон">
        <Stack>
          <TextInput
            label="Название шаблона"
            placeholder="Например: HYPE Long Aggressive"
            data-autofocus
            value={templateName}
            onChange={(e) => setTemplateName(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSaveModal}>Отмена</Button>
            <Button onClick={handleSaveTemplate} leftSection={<IconCheck size={16} />}>Сохранить</Button>
          </Group>
        </Stack>
      </Modal>

      <DonateModal opened={gratitudeOpened} onClose={closeGratitude} />

      <Modal opened={importModalV2Opened} onClose={closeImportModal} title="Импорт настроек">
        <Stack>
          <TextInput
            label="Ссылка на бота"
            placeholder="https://veles.finance/share/SDxEv"
            value={importLink}
            onChange={(e) => setImportLink(e.currentTarget.value)}
            data-autofocus
          />
          <Text size="xs" c="dimmed">
            Поддерживается ссылка на бота формата https://veles.finance/share/***** из кнопки «Поделиться»
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeImportModal} disabled={isImporting}>Отмена</Button>
            <Button onClick={handleImportSettings} loading={isImporting}>Импортировать</Button>
          </Group>
        </Stack>
      </Modal>

    </AppShell>
  );
}



