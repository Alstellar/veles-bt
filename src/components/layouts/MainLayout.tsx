// src/components/layouts/MainLayout.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  AppShell, Stack, Group, Text, NavLink, Modal, TextInput, Button, Image, Divider, Anchor
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconLayoutDashboard, IconTestPipe, IconHistory, IconTemplate, 
  IconBrandGithub, IconBrandTelegram, IconHeart, IconCheck, IconSettings
} from '@tabler/icons-react';
import dayjs from 'dayjs';

import { DashboardView } from '../views/DashboardView';
import { BacktesterView } from '../views/BacktesterView';
import { TemplatesView } from '../views/TemplatesView';
import { HistoryView } from '../views/HistoryView';
import { SettingsView } from '../views/SettingsView';

// 👇 Импортируем нашу новую модалку
import { DonateModal } from '../modals/DonateModal'; 

import { StorageService } from '../../services/StorageService';
import { useBacktestQueue } from '../../hooks/useBacktestQueue';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, Template, BatchResumeSource } from '../../types';
import { LogService } from '../../services/LogService';
import { getObjectDiff } from '../../utils/objectDiff';
import { configHash } from '../../utils/configHash';

export function MainLayout() {
  const queueController = useBacktestQueue();

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
  }) => ({
    staticConfig: {
      ...config.staticConfig,
      dateFrom: config.staticConfig.dateFrom.toISOString(),
      dateTo: config.staticConfig.dateTo.toISOString()
    },
    entryConfig: config.entryConfig,
    orderState: config.orderState,
    exitConfig: config.exitConfig
  });

  const appVersion = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.0.0'; 

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [resumeBatchId, setResumeBatchId] = useState<string | null>(null);

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
  const configRef = useRef({ staticConfig, entryConfig, orderState, exitConfig });

  useEffect(() => {
    configRef.current = { staticConfig, entryConfig, orderState, exitConfig };
  }, [staticConfig, entryConfig, orderState, exitConfig]);

  useEffect(() => {
    void LogService.info('layout', 'main_layout.opened', { tab: activeTab });
  }, []);

  useEffect(() => {
    void LogService.info('layout', 'navigation.changed', { tab: activeTab });
  }, [activeTab]);

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

    const newTemplate: Template = {
        id: crypto.randomUUID(),
        name: templateName,
        timestamp: Date.now(),
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
      configHash: configHash(newTemplate.config)
    });
    closeSaveModal();
    setTemplateName('');
    alert('Шаблон успешно сохранен!');
  };

  // --- LOAD TEMPLATE LOGIC ---
  const handleLoadTemplate = (template: Template) => {
      const restoredStatic = {
          ...template.config.staticConfig,
          dateFrom: new Date(template.config.staticConfig.dateFrom),
          dateTo: new Date(template.config.staticConfig.dateTo)
      };

      setStaticConfig(restoredStatic);
      setEntryConfig(template.config.entryConfig);
      setOrderState(template.config.orderState);
      setExitConfig(template.config.exitConfig);
      void LogService.info('templates', 'template.loaded', {
        templateId: template.id,
        name: template.name,
        configHash: configHash(template.config)
      });

      setActiveTab('backtester');
  };

  const handleResumeFromHistory = useCallback((batchId: string, resumeSource: BatchResumeSource) => {
    const source = cloneResumeSource(resumeSource);
    const restoredStatic: StaticConfig = {
      ...source.staticConfig,
      dateFrom: new Date(source.staticConfig.dateFrom),
      dateTo: new Date(source.staticConfig.dateTo)
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
    setResumeBatchId(batchId);
    setActiveTab('backtester');
  }, [staticConfig, entryConfig, orderState, exitConfig]);

  // --- GRATITUDE MODAL LOGIC ---
  const [gratitudeOpened, { open: openGratitude, close: closeGratitude }] = useDisclosure(false);
  
  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="xs" style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* ВЕРХНЯЯ ЧАСТЬ (Меню) */}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Group px="md" py="xs" mb="sm">
                <Image 
                    src="/icons/icon-128.png" 
                    w={32} 
                    h={32} 
                    radius="sm" 
                />
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
                label="Конфигуратор" 
                leftSection={<IconTestPipe size={20} stroke={1.5} />}
                active={activeTab === 'backtester'}
                onClick={() => setActiveTab('backtester')}
                variant="light"
            />
            <NavLink 
                label="Шаблоны" 
                leftSection={<IconTemplate size={20} stroke={1.5} />}
                active={activeTab === 'templates'}
                onClick={() => setActiveTab('templates')}
                variant="light"
            />
            <NavLink 
                label="История запусков" 
                leftSection={<IconHistory size={20} stroke={1.5} />}
                active={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                variant="light"
            />
            <NavLink 
                label="Настройки" 
                leftSection={<IconSettings size={20} stroke={1.5} />}
                active={activeTab === 'settings'}
                onClick={() => setActiveTab('settings')}
                variant="light"
            />
          </Stack>

          {/* СРЕДНЯЯ ЧАСТЬ: КНОПКИ ДЕЙСТВИЯ */}
          <Stack gap="xs" px="md" mt="auto" mb="sm">
             <Button 
                component="a" 
                href="https://t.me/algo_bots" 
                target="_blank"
                variant="light" 
                color="blue" 
                fullWidth
                leftSection={<IconBrandTelegram size={18} />}
             >
                Канал Algo Bots
             </Button>

             <Button 
                onClick={openGratitude}
                variant="light" 
                color="pink" 
                fullWidth
                leftSection={<IconHeart size={18} />}
             >
                Сказать спасибо
             </Button>
          </Stack>

          {/* НИЖНЯЯ ЧАСТЬ (Контакты) */}
          <Stack gap={0}>
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
         {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
         
         <div style={{ display: activeTab === 'backtester' ? 'block' : 'none' }}>
            <BacktesterView 
               staticConfig={staticConfig} setStaticConfig={handleStaticConfigChange}
               entryConfig={entryConfig} setEntryConfig={handleEntryConfigChange}
               orderState={orderState} setOrderState={handleOrderStateChange}
               exitConfig={exitConfig} setExitConfig={handleExitConfigChange}
               onSaveTemplate={openSaveModal}
               queueController={queueController}
               resumeBatchId={resumeBatchId}
               onResumeHandled={() => setResumeBatchId(null)}
            />
         </div>

         {activeTab === 'templates' && (
             <TemplatesView 
               onLoadTemplate={handleLoadTemplate}
               onNavigate={setActiveTab}
             />
         )}

         {activeTab === 'history' && (
           <HistoryView
             queueController={queueController}
             onResumeBatch={handleResumeFromHistory}
           />
         )}
         {activeTab === 'settings' && <SettingsView appVersion={appVersion} />}
      </AppShell.Main>

      {/* МОДАЛКА СОХРАНЕНИЯ ШАБЛОНА */}
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
                 <Button onClick={handleSaveTemplate} leftSection={<IconCheck size={16}/>}>Сохранить</Button>
             </Group>
         </Stack>
      </Modal>

      {/* 👇 НОВАЯ МОДАЛКА ПОДДЕРЖКИ */}
      <DonateModal opened={gratitudeOpened} onClose={closeGratitude} />

    </AppShell>
  );
}
