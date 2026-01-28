// src/components/layouts/MainLayout.tsx
import { useState } from 'react';
import { 
  AppShell, Stack, Group, Text, NavLink, Modal, TextInput, Button, Image, Divider, Anchor, 
  List, ThemeIcon, Title, Code, CopyButton, ActionIcon, Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconLayoutDashboard, IconTestPipe, IconHistory, IconTemplate, IconCheck, 
  IconBrandGithub, IconBrandTelegram, IconHeart, IconGift, IconCopy
} from '@tabler/icons-react';
import dayjs from 'dayjs';

import { DashboardView } from '../views/DashboardView';
import { BacktesterView } from '../views/BacktesterView';
import { TemplatesView } from '../views/TemplatesView';
import { HistoryView } from '../views/HistoryView';

import { StorageService } from '../../services/StorageService';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, Template } from '../../types';

export function MainLayout() {
  // Получаем версию из манифеста, если мы в расширении
  const appVersion = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.0.0'; // Фолбэк для локальной разработки

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

  // --- GRATITUDE MODAL LOGIC ---
  const [gratitudeOpened, { open: openGratitude, close: closeGratitude }] = useDisclosure(false);
  
  // Шаблон письма
  const emailTemplate = `Здравствуйте! Прошу закрепить мой аккаунт за партнером ID 2502 (код invite: algo_bots). Мой ID на платформе: [ВСТАВЬТЕ СЮДА ВАШ ID]`;

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

          {/* СРЕДНЯЯ ЧАСТЬ: КНОПКИ ДЕЙСТВИЯ */}
          <Stack gap="xs" px="md" mt="auto" mb="sm">
             {/* Кнопка Канала */}
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

             {/* Кнопка Благодарности */}
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

             <Text size="10px" c="dimmed" ta="center">v{appVersion} Open Source</Text>
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

      {/* МОДАЛКА БЛАГОДАРНОСТИ */}
      <Modal 
        opened={gratitudeOpened} 
        onClose={closeGratitude} 
        title={<Group><IconGift color="var(--mantine-color-pink-6)"/><Title order={4}>Поддержать автора</Title></Group>}
        size="lg"
      >
         <Stack gap="md">
            <Text size="sm">
               Проект <b>Veles Helper</b> полностью бесплатен. Лучшая награда для меня — если вы станете моим партнером на платформе Veles. Это абсолютно бесплатно для вас!
            </Text>

            <Divider label="Что вы получите" labelPosition="center" />

            <List
               spacing="xs"
               size="sm"
               center
               icon={
                  <ThemeIcon color="teal" size={20} radius="xl">
                     <IconCheck size={12} />
                  </ThemeIcon>
               }
            >
               <List.Item>Ранний доступ к новым инструментам и функциям</List.Item>
               <List.Item>Доступ в закрытый канал с моими личными стратегиями</List.Item>
               <List.Item>Помощь в освоении бектестера и настройки ботов</List.Item>
            </List>

            <Divider label="Способ 1: Регистрация (для новичков)" labelPosition="center" />
            
            <Button 
               component="a" 
               href="https://veles.finance/invite/algo_bots" 
               target="_blank"
               size="md" 
               variant="gradient" 
               gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
            >
               Зарегистрироваться на Veles
            </Button>

            <Divider label="Способ 2: Если аккаунт уже есть" labelPosition="center" />

            <Text size="sm" c="dimmed">
               Напишите письмо на <Code>support@veles.finance</Code> <br/>
               <b>Важно:</b> пишите с почты, на которую зарегистрирован ваш аккаунт Veles. <br/>
               Укажите ваш ID платформы, мой партнерский ID <b>2502</b> и код <b>algo_bots</b>.
            </Text>

            <Stack gap={5}>
               <Text size="xs" fw={700}>Шаблон письма (не забудьте вписать ваш ID):</Text>
               <Group gap={0}>
                  <Code block style={{ flex: 1, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                     {emailTemplate}
                  </Code>
                  <CopyButton value={emailTemplate} timeout={2000}>
                     {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Скопировано' : 'Копировать'} withArrow position="right">
                           <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} size="lg">
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                           </ActionIcon>
                        </Tooltip>
                     )}
                  </CopyButton>
               </Group>
            </Stack>
         </Stack>
      </Modal>

    </AppShell>
  );
}