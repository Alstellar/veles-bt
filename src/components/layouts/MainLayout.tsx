// src/components/MainLayout.tsx
import { useState } from 'react';
import { 
    AppShell, Stack, Group, Text, NavLink, Modal, TextInput, Button, Image, Divider, Anchor
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
    IconLayoutDashboard, IconTestPipe, IconHistory, IconTemplate, IconCheck, 
    IconBrandGithub, IconBrandTelegram
} from '@tabler/icons-react';
import dayjs from 'dayjs';

import { DashboardView } from '../views/DashboardView';
import { BacktesterView } from '../views/BacktesterView';
import { TemplatesView } from '../views/TemplatesView';
import { HistoryView } from '../views/HistoryView';

import { StorageService } from '../../services/StorageService';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, Template } from '../../types';

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');

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

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
        alert('Введите название шаблона');
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

      setActiveTab('backtester');
  };

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
                label="Бектесты" 
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
          </Stack>

          {/* НИЖНЯЯ ЧАСТЬ (Контакты) */}
          <Stack gap={0} mt="md">
             <Divider mb="sm" />
             
             {/* Блок контактов */}
             <Stack gap={6} px="xs" mb="xs">
                 
                 {/* Telegram */}
                 <Group gap={8} wrap="nowrap">
                    <IconBrandTelegram size={16} style={{ opacity: 0.7 }} />
                    <Group gap={4} gap-xs={0}>
                        <Text size="xs">Разработчик:</Text>
                        <Anchor href="https://t.me/alstellar" target="_blank" size="xs" fw={600}>
                            @Alstellar
                        </Anchor>
                    </Group>
                 </Group>

                 {/* GitHub */}
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

             <Text size="10px" c="dimmed" ta="center">v1.0.0 Open Source</Text>
          </Stack>

      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
         {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
         
         {activeTab === 'backtester' && (
            <BacktesterView 
                staticConfig={staticConfig} setStaticConfig={setStaticConfig}
                entryConfig={entryConfig} setEntryConfig={setEntryConfig}
                orderState={orderState} setOrderState={setOrderState}
                exitConfig={exitConfig} setExitConfig={setExitConfig}
                onSaveTemplate={openSaveModal}
            />
         )}

         {activeTab === 'templates' && (
             <TemplatesView 
                onLoadTemplate={handleLoadTemplate}
                onNavigate={setActiveTab}
             />
         )}

         {activeTab === 'history' && <HistoryView />}
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

    </AppShell>
  );
}