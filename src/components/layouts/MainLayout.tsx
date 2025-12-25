import { useState } from 'react';
import { AppShell, Stack, Group, ThemeIcon, Text, NavLink } from '@mantine/core';
import { IconRocket, IconLayoutDashboard, IconTestPipe, IconHistory } from '@tabler/icons-react';

import { DashboardView } from '../views/DashboardView';
import { BacktesterView } from '../views/BacktesterView';
import { HistoryView } from '../HistoryView'; // HistoryView у нас пока лежит в components/

export function MainLayout() {
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