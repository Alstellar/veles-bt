import { useEffect, useState, useMemo } from 'react';
import { 
  Paper, SimpleGrid, Select, TextInput, NumberInput, SegmentedControl, Text, 
  Group, Button, Switch, Divider, LoadingOverlay, Alert, Tooltip, Stack 
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import '@mantine/dates/styles.css';

// Импорты типов и сервисов
import type { StaticConfig, ExchangeType, AlgoType, SymbolLimitation, SymbolAvailability } from '../types';
import { isSpot } from '../types';
import { fetchLimitations, fetchAvailability } from '../services/apiService';

interface Props {
  config: StaticConfig;
  onChange: (newConfig: StaticConfig) => void;
}

const EXCHANGES: ExchangeType[] = [
  'BINANCE_FUTURES', 'BINANCE', 'BYBIT_FUTURES', 'BYBIT_SPOT', 
  'OKX_FUTURES', 'OKX_SPOT', 'BINGX_FUTURES', 'BITGET_FUTURES', 
  'GATE_IO_FUTURES', 'GATE_IO_SPOT', 'HUOBI_SPOT'
];

// --- ХЕЛПЕР ДЛЯ УМНОГО ПОИСКА ---
function findSmart<T extends { symbol: string; externalId?: string }>(
    list: T[], 
    userSymbol: string
  ): T | undefined {
    if (!userSymbol) return undefined;
    
    const search = userSymbol.toUpperCase().trim();
    const searchWithSlash = `${search}/USDT`;
    const searchNoSlash = `${search}USDT`;
  
    return list.find(item => {
      const itemSym = item.symbol.toUpperCase();
      const itemId = item.externalId ? item.externalId.toUpperCase() : '';
  
      return (
        itemSym === search || 
        itemSym === searchWithSlash ||
        itemId === searchNoSlash ||
        itemSym.startsWith(`${search}/`)
      );
    });
  }

export function StaticSettings({ config, onChange }: Props) {
  
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [limitations, setLimitations] = useState<SymbolLimitation[]>([]);
  const [availabilities, setAvailabilities] = useState<SymbolAvailability[]>([]);

  // 1. Загрузка данных
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      if (!config.exchange) return;
      setLoading(true);
      setAuthError(false);
      try {
        const [lims, avails] = await Promise.all([
          fetchLimitations(config.exchange),
          fetchAvailability(config.exchange)
        ]);
        if (mounted) {
          setLimitations(lims);
          setAvailabilities(avails);
        }
      } catch (error: any) {
        console.error("Ошибка загрузки данных Veles:", error);
        if (mounted && error.message && (error.message.includes('401') || error.message.includes('авторизация'))) {
            setAuthError(true);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, [config.exchange]);

  // --- ВЫЧИСЛЕНИЯ ---
  
  const currentLimitation = useMemo(() => findSmart(limitations, config.symbol), [limitations, config.symbol]);
  const currentAvailability = useMemo(() => findSmart(availabilities, config.symbol), [availabilities, config.symbol]);
  const currentIsSpot = isSpot(config.exchange);
  const maxLeverage = currentLimitation?.leverage || 125;

  // Авто-корректировка плеча
  useEffect(() => {
    if (currentLimitation?.leverage && config.leverage > currentLimitation.leverage) {
        update('leverage', currentLimitation.leverage);
    }
  }, [currentLimitation, config.leverage]);

  // --- ХЕЛПЕРЫ UI ---

  const update = (key: keyof StaticConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const setPresetDate = (months: number) => {
    const to = new Date();
    const from = dayjs().subtract(months, 'month').toDate();
    onChange({ ...config, dateTo: to, dateFrom: from });
  };

  const handleWholePeriod = () => {
    if (!currentAvailability?.availableFrom) {
       alert('Дата листинга не найдена (или монета не выбрана).');
       return;
    }
    const from = new Date(currentAvailability.availableFrom);
    const to = new Date();
    onChange({ ...config, dateFrom: from, dateTo: to });
  };

  // Рендер иконки статуса монеты
  const renderCoinStatus = () => {
    if (!config.symbol) return <Text size="xs" c="dimmed">/USDT</Text>;

    if (currentLimitation) {
        return (
            <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">/USDT</Text>
                <Tooltip label={`Найдено: ${currentLimitation.symbol}`}>
                    <IconCheck size={16} color="green" />
                </Tooltip>
            </Group>
        );
    }

    return (
        <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed">/USDT</Text>
            <Tooltip label="Монета не найдена в словаре Veles">
                <IconX size={16} color="red" />
            </Tooltip>
        </Group>
    );
  };

  // Генерация превью имени
  const namePreview = useMemo(() => {
     const ticker = config.symbol ? config.symbol.toUpperCase() : 'COIN';
     // Пример: HYPE | 1/N | #BATCH
     return `${ticker} | 1/N | #BATCH`;
  }, [config.symbol]);

  return (
    <Paper withBorder p="md" radius="md" bg="gray.0" pos="relative">
      <LoadingOverlay visible={loading} overlayProps={{ blur: 1 }} />
      
      <Text size="sm" fw={700} mb="xs" c="dimmed" tt="uppercase">
        Базовые настройки
      </Text>

      {authError && (
        <Alert variant="light" color="red" title="Нет доступа к API" icon={<IconAlertTriangle />} mb="sm">
          Авторизуйтесь на сайте veles.finance и обновите страницу.
        </Alert>
      )}

      {/* Имя и Биржа */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <TextInput
          label="Имя теста (Префикс)"
          placeholder="MyStrategy"
          value={config.namePrefix}
          onChange={(e) => update('namePrefix', e.currentTarget.value)}
          // Динамический суффикс
          rightSectionWidth={160}
          rightSection={
             <Text size="xs" c="dimmed" fs="italic" mr={10} style={{ pointerEvents: 'none' }}>
               {namePreview}
             </Text>
          }
        />
        <Select
          label="Биржа"
          data={EXCHANGES}
          value={config.exchange}
          onChange={(v) => update('exchange', v)}
          allowDeselect={false}
          searchable
        />
      </SimpleGrid>

      {/* Монета, Алго, Депо, Плечо */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <TextInput
          label="Монета"
          placeholder="BTC"
          value={config.symbol}
          onChange={(e) => update('symbol', e.currentTarget.value.toUpperCase())}
          rightSectionWidth={80} 
          rightSection={renderCoinStatus()}
        />

        <div>
           <Text size="sm" fw={500} mt={2} mb={3}>Алгоритм</Text>
           <SegmentedControl
            fullWidth
            size="xs"
            color={config.algo === 'LONG' ? 'green' : 'red'}
            data={[
              { label: 'Long 📈', value: 'LONG' },
              { label: 'Short 📉', value: 'SHORT' }
            ]}
            value={config.algo}
            onChange={(v) => update('algo', v as AlgoType)}
          />
        </div>

        <NumberInput
          label="Депозит ($)"
          value={config.deposit}
          onChange={(v) => update('deposit', v)}
          min={10} allowNegative={false}
        />

        {!currentIsSpot && (
           <NumberInput
             label="Плечо (x)"
             placeholder={`Макс: x${maxLeverage}`}
             value={config.leverage}
             onChange={(v) => update('leverage', v)}
             min={1} 
             max={maxLeverage}
             allowNegative={false}
             error={config.leverage > maxLeverage ? 'Превышен лимит' : null}
             rightSectionWidth={85}
             rightSection={
                <Text size="xs" c="dimmed" mr={10} style={{ whiteSpace: 'nowrap', cursor: 'default' }}>
                  Макс: x{maxLeverage}
                </Text>
             }
           />
        )}
      </SimpleGrid>

      <Divider my="sm" label="Даты и Период" labelPosition="center" />

      {/* Кнопки пресетов дат */}
      <Group justify="center" gap={5} mb="xs">
        <Button variant="default" size="xs" onClick={() => setPresetDate(1)}>1 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(3)}>3 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(6)}>6 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(12)}>1 Год</Button>
        <Button 
          variant="light" color="blue" size="xs" 
          onClick={handleWholePeriod}
          loading={loading}
          disabled={authError || !config.symbol}
        >
          Весь период
        </Button>
        
        {currentAvailability && (
            <Text size="xs" c="dimmed" ml={4}>
               История с {dayjs(currentAvailability.availableFrom).format('DD.MM.YYYY')}
            </Text>
        )}
      </Group>

      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <DateInput
          value={config.dateFrom}
          onChange={(v) => update('dateFrom', v)}
          label="Дата начала (From)"
          valueFormat="DD.MM.YYYY"
          minDate={currentAvailability ? new Date(currentAvailability.availableFrom) : undefined}
        />
        <DateInput
          value={config.dateTo}
          onChange={(v) => update('dateTo', v)}
          label="Дата конца (To)"
          valueFormat="DD.MM.YYYY"
        />
      </SimpleGrid>

      <Divider my="sm" label="Дополнительно" labelPosition="center" />

      {/* Комиссии и Свитчи (в стиле карточек) */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
         {/* Увеличил gap с 'xs' до 'lg' для визуального разделения */}
         <Stack gap="lg">
            <TextInput
               label="Maker Fee (%)"
               value={config.makerFee}
               onChange={(e) => update('makerFee', e.currentTarget.value)}
            />
            {/* Карточка переключателя */}
            <Paper withBorder p="xs" bg="gray.1" radius="md">
                 <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>Публичный тест</Text>
                    <Switch 
                        size="md"
                        checked={config.isPublic}
                        onChange={(e) => update('isPublic', e.currentTarget.checked)}
                    />
                 </Group>
            </Paper>
         </Stack>

         {/* Увеличил gap с 'xs' до 'lg' */}
         <Stack gap="lg">
            <TextInput
               label="Taker Fee (%)"
               value={config.takerFee}
               onChange={(e) => update('takerFee', e.currentTarget.value)}
            />
             {/* Карточка переключателя */}
             <Paper withBorder p="xs" bg="gray.1" radius="md">
                 <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>Учитывать тени</Text>
                    <Switch 
                        size="md"
                        checked={config.useWicks}
                        onChange={(e) => update('useWicks', e.currentTarget.checked)}
                    />
                 </Group>
            </Paper>
         </Stack>
      </SimpleGrid>

    </Paper>
  );
}