import { useState, useEffect } from 'react';
import { Container, Title, Button, Stack, Paper, Text, Center, ThemeIcon, Group } from '@mantine/core';
import { IconExternalLink, IconRocket, IconSettings } from '@tabler/icons-react';
import dayjs from 'dayjs';

import { StaticSettings } from './components/StaticSettings';
import { OrderSettings } from './components/OrderSettings';
import { EntrySettings } from './components/EntrySettings';
import { ExitSettings } from './components/ExitSettings';

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

  // 2. Условия входа (Entry Settings)
  const [entryConfig, setEntryConfig] = useState<EntryConfig>({
    filterSlots: []
  });

  // 3. Настройки Ордеров (Order Settings)
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
    custom: {
      baseOrder: { indent: [], volume: 100 },
      orders: []
    },
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

  // 4. Настройки Выхода (Exit Settings)
  const [exitConfig, setExitConfig] = useState<ExitConfig>({
    profitMode: 'SINGLE',
    profitSingle: {
        percents: ['1.0'] 
    },
    profitMultiple: {
        orders: [
            { id: 'init-exit-1', indent: ['1.0'], volume: 100 }
        ],
        breakeven: null
    },
    profitSignal: {
        checkPnl: ['null'], 
        filterSlots: [] 
    },
    // Инициализация Стоп-лоссов
    stopLoss: {
        enabledSimple: false,
        indent: [], 
        
        enabledSignal: false,
        conditionalIndent: [],
        conditionalIndentType: 'AVERAGE',
        filterSlots: []
    }
  });

  const handleLogConfig = () => {
    console.log("=== CONFIG ===");
    console.log("Static:", staticConfig);
    console.log("Entry:", entryConfig);
    console.log("Order State:", orderState);
    console.log("Exit State:", exitConfig);
    
    // --- 1. Подсчет комбинаций Условий Входа (Entry) ---
    let entryCombinations = 1;
    if (entryConfig.filterSlots.length > 0) {
        entryCombinations = entryConfig.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }

    // --- 2. Подсчет комбинаций Сетки (Orders) ---
    let orderCombinations = 0;
    
    if (orderState.mode === 'SIMPLE') {
       const s = orderState.simple;
       orderCombinations = 
        orderState.general.pullUp.length *
        s.orders.length * s.martingale.length * s.indent.length * s.overlap.length *
        (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
    } 
    else if (orderState.mode === 'CUSTOM') {
      const c = orderState.custom;
      const baseIndent = c.baseOrder.indent.length || 1;
      let customCombinations = baseIndent;
      
      c.orders.forEach(o => {
        const indentComb = o.indent.length || 1;
        customCombinations *= indentComb;
      });
      orderCombinations = customCombinations;
    }
    else {
      // SIGNAL Mode
      let signalCombinations = 1;
      signalCombinations *= orderState.signal.baseOrder.indent.length || 1;
      
      orderState.signal.orders.forEach(o => {
         let indentComb = o.indent.length || 1;
         
         let filterComb = 1;
         if (o.filterSlots && o.filterSlots.length > 0) {
            filterComb = o.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
         }

         signalCombinations *= (indentComb * filterComb);
      });
      orderCombinations = signalCombinations;
    }

    // --- 3. Подсчет комбинаций Выхода (Exit) ---
    
    // А) Profit Combinations
    let profitCombinations = 1;
    
    if (exitConfig.profitMode === 'SINGLE') {
        profitCombinations = exitConfig.profitSingle.percents.length || 1;
    } 
    else if (exitConfig.profitMode === 'MULTIPLE') {
        const orders = exitConfig.profitMultiple.orders;
        if (orders.length > 0) {
            let multipleComb = 1;
            orders.forEach(o => {
                const indentCount = o.indent.length || 1;
                multipleComb *= indentCount;
            });
            profitCombinations = multipleComb;
        }
    }
    else if (exitConfig.profitMode === 'SIGNAL') {
        const pnlVariants = exitConfig.profitSignal.checkPnl.length || 1;
        
        let indicatorCombinations = 1;
        if (exitConfig.profitSignal.filterSlots.length > 0) {
            indicatorCombinations = exitConfig.profitSignal.filterSlots.reduce((acc, slot) => {
                return acc * (slot.variants.length || 1);
            }, 1);
        }

        profitCombinations = pnlVariants * indicatorCombinations;
    }

    // Б) Stop Loss Combinations
    let stopLossCombinations = 1;

    // Обычный стоп
    if (exitConfig.stopLoss.enabledSimple) {
        const simpleCount = exitConfig.stopLoss.indent.length || 1;
        stopLossCombinations *= simpleCount;
    }

    // Стоп по сигналу
    if (exitConfig.stopLoss.enabledSignal) {
        // Варианты отступов
        const signalIndentCount = exitConfig.stopLoss.conditionalIndent.length || 1;
        
        // Варианты индикаторов (теперь перебираем ВСЕ слоты)
        let indicatorComb = 1;
        if (exitConfig.stopLoss.filterSlots.length > 0) {
            indicatorComb = exitConfig.stopLoss.filterSlots.reduce((acc, slot) => {
                return acc * (slot.variants.length || 1);
            }, 1);
        }
        
        stopLossCombinations *= (signalIndentCount * indicatorComb);
    }

    // Итоговые комбинации выхода
    const exitCombinations = profitCombinations * stopLossCombinations;

    // --- ИТОГО ---
    const totalCount = orderCombinations * entryCombinations * exitCombinations;
      
    alert(`Конфигурация валидна.\nРежим ордеров: ${orderState.mode}\nРежим профита: ${exitConfig.profitMode}\n\nКомбинаций входа: ${entryCombinations}\nКомбинаций сетки: ${orderCombinations}\nКомбинаций выхода (Profit * SL): ${exitCombinations}\n\nИТОГО ТЕСТОВ: ${totalCount}`);
  };

  return (
    <Container size="md" py="xl">
      <Group mb="lg" justify="center">
        <ThemeIcon size="lg" variant="light" color="blue"><IconSettings size={20} /></ThemeIcon>
        <Title order={2}>Конфигуратор Бектестов</Title>
      </Group>

      <Stack gap="xl">
        <StaticSettings config={staticConfig} onChange={setStaticConfig} />
        
        {/* Условия входа */}
        <EntrySettings config={entryConfig} onChange={setEntryConfig} />

        {/* Настройки сетки */}
        <OrderSettings state={orderState} onChange={setOrderState} />

        {/* Настройки выхода (Тейк-профит + Стоп-лосс) */}
        <ExitSettings config={exitConfig} onChange={setExitConfig} />

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