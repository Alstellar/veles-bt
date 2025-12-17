import { useState, useEffect } from 'react';
import { Container, Title, Button, Stack, Paper, Text, Center, ThemeIcon, Group } from '@mantine/core';
import { IconExternalLink, IconRocket, IconSettings } from '@tabler/icons-react';
import dayjs from 'dayjs';

import { StaticSettings } from './components/StaticSettings';
import { OrderSettings } from './components/OrderSettings';
import type { StaticConfig, OrderState } from './types';

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
  
  // 1. Статические настройки
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

  // 2. Настройки Ордеров
  const [orderState, setOrderState] = useState<OrderState>({
    mode: 'SIMPLE',
    general: {
      pullUp: ['0.4'] 
    },
    simple: {
      orders: ['10'],
      martingale: ['5'],
      indent: ['0.2'],
      overlap: ['15'],
      logarithmicEnabled: true,
      logarithmicFactor: ['2.1'],
      includePosition: true
    },
    // --- ДОБАВЛЕН РЕЖИМ CUSTOM ---
    custom: {
      baseOrder: { indent: [], volume: 100 },
      orders: []
    },
    // -----------------------------
    // Инициализация режима SIGNAL
    signal: {
      baseOrder: {
        indent: ['0'], 
        volume: 10 
      },
      indentType: 'ORDER', 
      orders: [
        { id: 'init-1', indent: ['0.5'], volume: 10, filterSlots: [] }, 
        { id: 'init-2', indent: ['1.0'], volume: 20, filterSlots: [] }, 
      ]
    }
  });

  const handleLogConfig = () => {
    console.log("=== CONFIG ===");
    console.log("Static:", staticConfig);
    console.log("Order State:", orderState);
    
    // Подсчет комбинаций
    let count = 0;
    
    if (orderState.mode === 'SIMPLE') {
       const s = orderState.simple;
       count = 
        orderState.general.pullUp.length *
        s.orders.length * s.martingale.length * s.indent.length * s.overlap.length *
        (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
    } 
    // --- РАСЧЕТ ДЛЯ CUSTOM ---
    else if (orderState.mode === 'CUSTOM') {
      const c = orderState.custom;
      const baseIndent = c.baseOrder.indent.length || 1;
      let customCombinations = baseIndent;
      
      c.orders.forEach(o => {
        // Здесь только отступы, фильтров нет
        const indentComb = o.indent.length || 1;
        customCombinations *= indentComb;
      });
      
      count = customCombinations;
    }
    // --- РАСЧЕТ ДЛЯ SIGNAL ---
    else {
      // Для Signal считаем комбинации по ордерам
      let signalCombinations = 1;
      
      // Базовый ордер (только отступ)
      signalCombinations *= orderState.signal.baseOrder.indent.length || 1;
      
      // Остальные ордера (отступы * слоты фильтров)
      orderState.signal.orders.forEach(o => {
         let indentComb = o.indent.length || 1;
         
         // Перебор по слотам (Grid Search)
         // Если в слоте 3 варианта, это множитель x3.
         let filterComb = 1;
         if (o.filterSlots && o.filterSlots.length > 0) {
            filterComb = o.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
         }

         signalCombinations *= (indentComb * filterComb);
      });
      
      count = signalCombinations;
    }
      
    alert(`Конфигурация валидна. Режим: ${orderState.mode}. Комбинаций: ${count}`);
  };

  return (
    <Container size="md" py="xl">
      <Group mb="lg" justify="center">
        <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
        <Title order={2}>Конфигуратор Бектестов</Title>
      </Group>

      <Stack gap="xl">
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        <OrderSettings state={orderState} onChange={setOrderState} />

        <Button size="lg" color="green" onClick={handleLogConfig}>
          Проверить конфигурацию
        </Button>
      </Stack>
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