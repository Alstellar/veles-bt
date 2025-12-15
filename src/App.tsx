import { useState, useEffect } from 'react';
import { Container, Title, Button, Stack, Paper, Center, ThemeIcon, Group } from '@mantine/core';
import { IconExternalLink, IconRocket, IconSettings } from '@tabler/icons-react';
import dayjs from 'dayjs';

import { StaticSettings } from './components/StaticSettings';
import { OrderSettings } from './components/OrderSettings';
// Добавляем 'type' к импорту
import type { StaticConfig, OrderState } from './types';

// --- ПОПАП ---
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
        <Button 
          fullWidth size="md" mt="xl"
          rightSection={<IconExternalLink size={20} />}
          onClick={openFullTab}
        >
          Открыть конфигуратор
        </Button>
      </Paper>
    </Center>
  );
}

// --- FULLSCREEN ---
function FullscreenMode() {
  
  // 1. Статические настройки
  const [staticConfig, setStaticConfig] = useState<StaticConfig>({
    namePrefix: 'Test_HYPE',
    exchange: 'BINANCE_FUTURES',
    algo: 'LONG',
    symbol: 'HYPE',
    deposit: 50,
    leverage: 10,
    marginType: 'CROSS',
    portion: 7, // Default
    
    dateFrom: dayjs().subtract(7, 'day').toDate(),
    dateTo: new Date(),
    makerFee: '0.02',
    takerFee: '0.055',
    isPublic: true,
    useWicks: false
  });

  // 2. Настройки Ордеров (Новая структура)
  const [orderState, setOrderState] = useState<OrderState>({
    mode: 'SIMPLE',
    general: {
      pullUp: ['0.4'] // Общий параметр
    },
    simple: {
      orders: ['10'],
      martingale: ['5'],
      indent: ['0.2'],
      overlap: ['15'],
      logarithmicEnabled: true, // По умолчанию как в твоем JSON
      logarithmicFactor: ['2.1'],
      includePosition: true
    }
  });

  const handleLogConfig = () => {
    console.log("=== CONFIG ===");
    console.log("Static:", staticConfig);
    console.log("Order State:", orderState);
    
    // Пример подсчета комбинаций
    const s = orderState.simple;
    const count = 
      orderState.general.pullUp.length *
      s.orders.length * s.martingale.length * s.indent.length * s.overlap.length *
      (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
      
    alert(`Конфигурация валидна. Комбинаций: ${count}`);
  };

  return (
    <Container size="md" py="xl">
      <Group mb="lg" justify="center">
        <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
        <Title order={2}>Конфигуратор Бектестов</Title>
      </Group>

      <Stack gap="xl">
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        
        {/* Передаем новый стейт */}
        <OrderSettings state={orderState} onChange={setOrderState} />

        <Button size="lg" color="green" onClick={handleLogConfig}>
          Проверить конфигурацию
        </Button>
      </Stack>
    </Container>
  );
}

// --- ROOT ---
function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsFullscreen(params.get('mode') === 'fullscreen');
  }, []);
  if (isFullscreen) return <FullscreenMode />;
  return <PopupMode />;
}

export default App;