import { useEffect, useState, useMemo } from 'react';
import { 
  Paper, SimpleGrid, Select, TextInput, NumberInput, SegmentedControl, Text, Autocomplete,
  Group, Button, Switch, Divider, LoadingOverlay, Alert, Tooltip, Stack 
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import '@mantine/dates/styles.css';

// Импорты типов и сервисов
import type { StaticConfig, AlgoType, SymbolLimitation, SymbolAvailability, ExchangeInfo } from '../types';
import { isSpot } from '../types';
import { fetchLimitations, fetchAvailability, fetchExchanges } from '../services/apiService';

interface Props {
  config: StaticConfig;
  onChange: (newConfig: StaticConfig) => void;
}

const FALLBACK_EXCHANGES: ExchangeInfo[] = [
  { name: 'Binance Futures', key: 'BINANCE_FUTURES', type: 'FUTURES', includePosition: true, fastApi: true },
  { name: 'Binance Spot', key: 'BINANCE', type: 'SPOT', includePosition: false, fastApi: true },
  { name: 'Bybit Futures', key: 'BYBIT_FUTURES', type: 'FUTURES', includePosition: true, fastApi: true },
  { name: 'Bybit Spot', key: 'BYBIT_SPOT', type: 'SPOT', includePosition: false, fastApi: true },
  { name: 'OKX Futures', key: 'OKX_FUTURES', type: 'FUTURES', includePosition: false, fastApi: true },
  { name: 'OKX Spot', key: 'OKX_SPOT', type: 'SPOT', includePosition: false, fastApi: true },
  { name: 'BingX Futures', key: 'BINGX_FUTURES', type: 'FUTURES', includePosition: true, fastApi: true },
  { name: 'Bitget Futures', key: 'BITGET_FUTURES', type: 'FUTURES', includePosition: true, fastApi: true },
  { name: 'Gate.io Futures', key: 'GATE_IO_FUTURES', type: 'FUTURES', includePosition: false, fastApi: false },
  { name: 'Gate.io Spot', key: 'GATE_IO_SPOT', type: 'SPOT', includePosition: false, fastApi: false },
  { name: 'HTX Spot', key: 'HUOBI_SPOT', type: 'SPOT', includePosition: false, fastApi: false }
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
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>(FALLBACK_EXCHANGES);
  const [limitations, setLimitations] = useState<SymbolLimitation[]>([]);
  const [availabilities, setAvailabilities] = useState<SymbolAvailability[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadExchanges = async () => {
      try {
        const remote = await fetchExchanges();
        if (!mounted || remote.length === 0) return;
        const merged = [...remote];
        FALLBACK_EXCHANGES.forEach((item) => {
          if (!merged.some((x) => x.key === item.key)) {
            merged.push(item);
          }
        });
        setExchanges(merged);
      } catch {
        // keep fallback exchanges
      }
    };
    void loadExchanges();
    return () => {
      mounted = false;
    };
  }, []);

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
  const currentExchange = useMemo(
    () => exchanges.find((item) => item.key === config.exchange) ?? null,
    [exchanges, config.exchange]
  );
  const currentIsSpot = currentExchange ? currentExchange.type === 'SPOT' : isSpot(config.exchange);
  const maxLeverage = currentLimitation?.leverage || 125;
  const exchangeOptions = useMemo(
    () => exchanges.map((item) => ({ value: item.key, label: item.name })),
    [exchanges]
  );
  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    limitations.forEach((item) => {
      const base = item.symbol.includes('/') ? item.symbol.split('/')[0] : item.symbol;
      const normalized = base.trim().toUpperCase();
      if (normalized) set.add(normalized);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [limitations]);

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

  const isLongAlgo = config.algo === 'LONG';

  return (
    <Paper p={0} bg="transparent">
      
      <Text size="sm" fw={700} mb="xs" c="dimmed" tt="uppercase">
        Базовые настройки
      </Text>

      <Paper withBorder p="md" radius="md" bg="gray.0" pos="relative">
        <LoadingOverlay visible={loading} overlayProps={{ blur: 1 }} />

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
          data={exchangeOptions}
          value={config.exchange}
          onChange={(v) => update('exchange', v || config.exchange)}
          allowDeselect={false}
          searchable
        />
      </SimpleGrid>

      {/* Монета, Алго, Депо, Плечо */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <Autocomplete
          label="Монета"
          placeholder="BTC"
          data={symbolOptions}
          maxDropdownHeight={220}
          comboboxProps={{ withinPortal: false }}
          value={config.symbol}
          onChange={(v) => update('symbol', v.toUpperCase())}
          rightSectionWidth={80} 
          rightSection={renderCoinStatus()}
        />

        <div>
           <Text size="sm" fw={500} mt={2} mb={3}>Алгоритм</Text>
           <SegmentedControl
            fullWidth
            w="100%"
            size="md"
            style={{ width: '100%' }}
            data={[
              { label: 'Long 📈', value: 'LONG' },
              { label: 'Short 📉', value: 'SHORT' }
            ]}
            value={config.algo}
            onChange={(v) => update('algo', v as AlgoType)}
            styles={{
              root: {
                width: '100%',
                maxWidth: '100%',
                display: 'flex',
                minHeight: 36,
                padding: 3,
                borderRadius: 12,
                border: '1px solid #c6d9ef',
                background: '#e8f1fb',
                overflow: 'hidden'
              },
              control: {
                flex: 1,
                minHeight: 30
              },
              indicator: {
                borderRadius: 9,
                border: isLongAlgo ? '1px solid rgba(26, 156, 96, 0.38)' : '1px solid rgba(219, 65, 83, 0.38)',
                background: isLongAlgo ? '#a3e7c3' : '#ffadb9',
                boxShadow: isLongAlgo
                  ? '0 0 0 1px rgba(26, 156, 96, 0.24), 0 0 12px rgba(26, 156, 96, 0.22)'
                  : '0 0 0 1px rgba(219, 65, 83, 0.24), 0 0 12px rgba(219, 65, 83, 0.22)',
                transition: 'transform 300ms cubic-bezier(0.22, 0.8, 0.26, 1), background 260ms ease, box-shadow 260ms ease, border-color 260ms ease'
              },
              label: {
                color: '#607b98',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.02em',
                transition: 'color 260ms ease, transform 260ms ease'
              }
            }}
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
    </Paper>
  );
}
