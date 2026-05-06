import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Input,
  Loader,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import {
  IconArrowsSort,
  IconCopy,
  IconInfoCircle,
  IconRestore
} from '@tabler/icons-react';

import type { ExchangeInfo, ExchangeType, SymbolAvailability, SymbolLimitation } from '../../types';
import { fetchAvailability, fetchExchanges, fetchLimitations, fetchTopSymbols } from '../../services/apiService';
import { ConnectionAlert } from '../ConnectionAlert';
import { parseDateLike, toIsoDateOnly } from '../../utils/datePolicy';
import { getExchangeQuoteCurrency } from '../../utils/exchangeQuote';
import styles from './AssetsView.module.css';

interface AssetsViewProps {
  connectionError?: string | null;
}

type SortKey = 'symbol' | 'leverage' | 'availableFrom';
type SortDir = 'asc' | 'desc';
type SymbolFormat = 'BASE' | 'NOSLASH' | 'PAIR';

interface AssetsViewState {
  exchange: ExchangeType | '';
  leverageMin: string;
  leverageMax: string;
  availableFromMin: string;
  availableFromMax: string;
  sortKey: SortKey;
  sortDir: SortDir;
  symbolFormat: SymbolFormat;
}

interface AssetRow {
  symbol: string;
  leverage: number;
  availableFrom: string | null;
}

const STORAGE_KEY = 'veles_bt_assets_view_state_v1';

const FALLBACK_EXCHANGES: ExchangeInfo[] = [
  { name: 'Binance Futures', key: 'BINANCE_FUTURES', type: 'FUTURES' },
  { name: 'Binance Spot', key: 'BINANCE', type: 'SPOT' },
  { name: 'Bybit Futures', key: 'BYBIT_FUTURES', type: 'FUTURES' },
  { name: 'Bybit Spot', key: 'BYBIT_SPOT', type: 'SPOT' },
  { name: 'OKX Futures', key: 'OKX_FUTURES', type: 'FUTURES' },
  { name: 'OKX Spot', key: 'OKX_SPOT', type: 'SPOT' },
  { name: 'BingX Futures', key: 'BINGX_FUTURES', type: 'FUTURES' },
  { name: 'Bitget Futures', key: 'BITGET_FUTURES', type: 'FUTURES' },
  { name: 'Hyperliquid Futures', key: 'HYPERLIQUID_FUTURES', type: 'FUTURES' },
  { name: 'Gate.io Spot', key: 'GATE_IO_SPOT', type: 'SPOT' },
  { name: 'Gate.io Futures', key: 'GATE_IO_FUTURES', type: 'FUTURES' },
  { name: 'HTX Spot', key: 'HUOBI_SPOT', type: 'SPOT' }
];

const defaultState: AssetsViewState = {
  exchange: '',
  leverageMin: '',
  leverageMax: '',
  availableFromMin: '',
  availableFromMax: '',
  sortKey: 'symbol',
  sortDir: 'asc',
  symbolFormat: 'PAIR'
};

const infoHints: Record<'leverage' | 'availableFrom', string> = {
  leverage: 'Максимально доступное плечо для пары на выбранной бирже.',
  availableFrom: 'Дата, с которой доступна история для бэктеста по этой монете.'
};

const isSortKey = (value: unknown): value is SortKey => (
  value === 'symbol' || value === 'leverage' || value === 'availableFrom'
);
const isSortDir = (value: unknown): value is SortDir => value === 'asc' || value === 'desc';
const isSymbolFormat = (value: unknown): value is SymbolFormat => value === 'BASE' || value === 'NOSLASH' || value === 'PAIR';

const parseOptionalNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDate = (value: string | null | undefined): string | null => {
  return toIsoDateOnly(value);
};

const readState = async (): Promise<Partial<AssetsViewState>> => {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve((result[STORAGE_KEY] as Partial<AssetsViewState> | undefined) ?? {});
      });
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(raw) as Partial<AssetsViewState>);
    } catch {
      resolve({});
    }
  });
};

const saveState = async (state: AssetsViewState): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, () => resolve());
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    resolve();
  });
};

const formatSymbol = (symbol: string, format: SymbolFormat): string => {
  if (format === 'PAIR') return symbol;
  if (format === 'NOSLASH') return symbol.replace('/', '');
  return symbol.includes('/') ? symbol.split('/')[0] : symbol;
};

const compareNullableNumber = (a: number | null, b: number | null): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

export function AssetsView({ connectionError }: AssetsViewProps) {
  const [state, setState] = useState<AssetsViewState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([]);
  const [limitations, setLimitations] = useState<SymbolLimitation[]>([]);
  const [availability, setAvailability] = useState<SymbolAvailability[]>([]);
  const [topLong, setTopLong] = useState<string[]>([]);
  const [topShort, setTopShort] = useState<string[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string>('');
  const [historyFromFocused, setHistoryFromFocused] = useState(false);
  const [historyToFocused, setHistoryToFocused] = useState(false);
  const quoteCurrency = state.exchange ? getExchangeQuoteCurrency(state.exchange) : 'USDT';

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoadingExchanges(true);

      const [storedRaw, remoteExchanges] = await Promise.all([
        readState(),
        fetchExchanges().catch(() => [])
      ]);

      if (!mounted) return;

      const mergedExchanges = remoteExchanges.length > 0 ? remoteExchanges : FALLBACK_EXCHANGES;
      setExchanges(mergedExchanges);

      const storedExchange = storedRaw.exchange;
      const validExchange = typeof storedExchange === 'string'
        && mergedExchanges.some((item) => item.key === storedExchange)
        ? storedExchange
        : (mergedExchanges[0]?.key ?? '');

      setState({
        exchange: validExchange,
        leverageMin: storedRaw.leverageMin ?? '',
        leverageMax: storedRaw.leverageMax ?? '',
        availableFromMin: storedRaw.availableFromMin ?? '',
        availableFromMax: storedRaw.availableFromMax ?? '',
        sortKey: isSortKey(storedRaw.sortKey) ? storedRaw.sortKey : 'symbol',
        sortDir: isSortDir(storedRaw.sortDir) ? storedRaw.sortDir : 'asc',
        symbolFormat: isSymbolFormat(storedRaw.symbolFormat) ? storedRaw.symbolFormat : 'PAIR'
      });

      setHydrated(true);
      setLoadingExchanges(false);
    };

    void init();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveState(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated || !state.exchange) return;

    let mounted = true;
    const loadAssetsData = async () => {
      setLoadingData(true);
      try {
        const exchange = state.exchange as ExchangeType;
        const [lims, avs, longTop, shortTop] = await Promise.all([
          fetchLimitations(exchange),
          fetchAvailability(exchange),
          fetchTopSymbols(exchange, 'LONG'),
          fetchTopSymbols(exchange, 'SHORT')
        ]);

        if (!mounted) return;
        setLimitations(lims);
        setAvailability(avs);
        setTopLong(longTop);
        setTopShort(shortTop);
      } catch {
        if (!mounted) return;
        setLimitations([]);
        setAvailability([]);
        setTopLong([]);
        setTopShort([]);
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    void loadAssetsData();
    return () => {
      mounted = false;
    };
  }, [hydrated, state.exchange]);

  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(''), 2200);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const rows = useMemo<AssetRow[]>(() => {
    const availabilityMap = new Map<string, string>();
    availability.forEach((item) => {
      availabilityMap.set(item.symbol.toUpperCase(), item.availableFrom);
    });

    return limitations.map((item) => {
      const symbol = item.symbol.toUpperCase();
      return {
        symbol,
        leverage: Number(item.leverage ?? 1),
        availableFrom: normalizeDate(availabilityMap.get(symbol))
      };
    });
  }, [limitations, availability]);

  const filteredRows = useMemo(() => {
    const leverageMin = parseOptionalNumber(state.leverageMin);
    const leverageMax = parseOptionalNumber(state.leverageMax);
    const dateFrom = state.availableFromMin || null;
    const dateTo = state.availableFromMax || null;

    return rows.filter((row) => {
      if (leverageMin !== null && row.leverage < leverageMin) return false;
      if (leverageMax !== null && row.leverage > leverageMax) return false;
      if (dateFrom && (!row.availableFrom || row.availableFrom < dateFrom)) return false;
      if (dateTo && (!row.availableFrom || row.availableFrom > dateTo)) return false;
      return true;
    });
  }, [rows, state.leverageMin, state.leverageMax, state.availableFromMin, state.availableFromMax]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    const { sortKey, sortDir } = state;

    next.sort((a, b) => {
      let result = 0;
      if (sortKey === 'symbol') result = a.symbol.localeCompare(b.symbol);
      if (sortKey === 'leverage') result = a.leverage - b.leverage;
      if (sortKey === 'availableFrom') {
        const aParsed = parseDateLike(a.availableFrom);
        const bParsed = parseDateLike(b.availableFrom);
        const aDate = aParsed ? aParsed.getTime() : null;
        const bDate = bParsed ? bParsed.getTime() : null;
        result = compareNullableNumber(aDate, bDate);
      }
      return sortDir === 'asc' ? result : -result;
    });

    return next;
  }, [filteredRows, state.sortDir, state.sortKey]);

  const exchangeOptions = useMemo(
    () => exchanges.map((exchange) => ({ value: exchange.key, label: exchange.name })),
    [exchanges]
  );

  const setField = <K extends keyof AssetsViewState>(field: K, value: AssetsViewState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSort = (key: SortKey) => {
    setState((prev) => {
      if (prev.sortKey === key) {
        return { ...prev, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' };
      }
      return { ...prev, sortKey: key, sortDir: 'asc' };
    });
  };

  const copySymbols = useCallback(async (symbols: string[], source: 'long' | 'short' | 'table') => {
    if (symbols.length === 0) {
      setCopyStatus('Нет данных для копирования.');
      return;
    }

    const text = symbols
      .map((symbol) => formatSymbol(symbol, state.symbolFormat))
      .join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const label = source === 'long' ? 'LONG' : source === 'short' ? 'SHORT' : 'Таблица';
      setCopyStatus(`${label}: скопировано ${symbols.length} строк.`);
    } catch {
      setCopyStatus('Не удалось скопировать данные.');
    }
  }, [state.symbolFormat]);

  const handleReset = () => {
    setState((prev) => ({
      ...defaultState,
      exchange: prev.exchange
    }));
  };

  const sortMark = (key: SortKey): string => {
    if (state.sortKey !== key) return '';
    return state.sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const renderHeader = (
    label: string,
    key: SortKey,
    options?: {
      infoKey?: keyof typeof infoHints;
      thClassName?: string;
      innerClassName?: string;
    }
  ) => (
    <th className={options?.thClassName}>
      <div className={`${styles.thInner} ${options?.innerClassName ?? ''}`.trim()}>
        <div className={options?.infoKey ? styles.headerLabelWithInfo : undefined}>
          {options?.infoKey && (
            <Tooltip label={infoHints[options.infoKey]} multiline w={260}>
              <Badge size="xs" variant="light" color="gray" className={styles.infoBadge}>
                <IconInfoCircle size={11} />
              </Badge>
            </Tooltip>
          )}
          <button
            type="button"
            className={styles.sortButton}
            onClick={() => handleSort(key)}
          >
            {label}
            {sortMark(key)}
            {state.sortKey !== key && <IconArrowsSort size={12} className={styles.sortIcon} />}
          </button>
        </div>
      </div>
    </th>
  );

  if (loadingExchanges) {
    return (
      <Container size="lg" py="xl" className={`ui-surface ${styles.viewRoot}`}>
        <Stack align="center" gap="sm" mt="xl">
          <Loader size="sm" />
          <Text c="dimmed">Загрузка вкладки активов...</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl" className={`ui-surface ${styles.viewRoot}`}>
      <Stack gap="lg">
        <div className={`ui-topbar ${styles.topbar}`}>
          <Title order={2} ta="center">Активы</Title>
        </div>

        <Paper withBorder p="md" radius="md" className={`ui-card ${styles.exchangeCard}`}>
          <Group justify="center" gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">Биржа</Text>
            <Select
              w={320}
              value={state.exchange}
              data={exchangeOptions}
              onChange={(value) => setField('exchange', (value as ExchangeType) ?? '')}
              allowDeselect={false}
              searchable
            />
          </Group>
        </Paper>

        {connectionError && (
          <Paper withBorder p="sm" radius="md" className="ui-card">
            <ConnectionAlert visible />
          </Paper>
        )}

        <Card withBorder radius="md" className={`ui-card ${styles.sectionCard}`} p="lg">
          <Title order={4} ta="center" mb="sm">Топ-10 активных монет за сутки на платформе Veles</Title>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <Paper withBorder radius="md" p="md" className={styles.topListCard}>
              <Group justify="space-between" mb="xs">
                <Badge color="green" variant="light">LONG</Badge>
                <ActionIcon
                  variant="light"
                  color="blue"
                  onClick={() => void copySymbols(topLong, 'long')}
                  title="Скопировать список LONG"
                >
                  <IconCopy size={16} />
                </ActionIcon>
              </Group>
              <ol className={styles.topList}>
                {topLong.map((symbol) => (
                  <li key={`long-${symbol}`}>{symbol}</li>
                ))}
              </ol>
            </Paper>

            <Paper withBorder radius="md" p="md" className={styles.topListCard}>
              <Group justify="space-between" mb="xs">
                <Badge color="red" variant="light">SHORT</Badge>
                <ActionIcon
                  variant="light"
                  color="blue"
                  onClick={() => void copySymbols(topShort, 'short')}
                  title="Скопировать список SHORT"
                >
                  <IconCopy size={16} />
                </ActionIcon>
              </Group>
              <ol className={styles.topList}>
                {topShort.map((symbol) => (
                  <li key={`short-${symbol}`}>{symbol}</li>
                ))}
              </ol>
            </Paper>
          </SimpleGrid>
        </Card>

        <Card withBorder radius="md" className={`ui-card ${styles.sectionCard}`} p="lg">
          <Stack gap="sm">
            <Title order={4} ta="center">Таблица активов</Title>

            <div className={styles.filtersRow}>
              <div className={styles.symbolBlock}>
                <Select
                  label="Symbol"
                  value={state.symbolFormat}
                  onChange={(value) => setField('symbolFormat', (value as SymbolFormat) ?? 'PAIR')}
                  data={[
                    { value: 'BASE', label: 'BTC' },
                    { value: 'NOSLASH', label: `BTC${quoteCurrency}` },
                    { value: 'PAIR', label: `BTC/${quoteCurrency}` }
                  ]}
                  allowDeselect={false}
                />
              </div>
              <Input.Wrapper label="Leverage" className={`${styles.rangeBlock} ${styles.leverageBlock}`.trim()}>
                <div className={styles.rangeInputs}>
                  <TextInput
                    type="number"
                    value={state.leverageMin}
                    onChange={(event) => setField('leverageMin', event.currentTarget.value)}
                    placeholder="от"
                    aria-label="Leverage от"
                    className={styles.compactInput}
                  />
                  <TextInput
                    type="number"
                    value={state.leverageMax}
                    onChange={(event) => setField('leverageMax', event.currentTarget.value)}
                    placeholder="до"
                    aria-label="Leverage до"
                    className={styles.compactInput}
                  />
                </div>
              </Input.Wrapper>
              <Input.Wrapper label="История" className={`${styles.rangeBlock} ${styles.historyBlock}`.trim()}>
                <div className={styles.historyInputs}>
                  <TextInput
                    type={historyFromFocused || Boolean(state.availableFromMin) ? 'date' : 'text'}
                    value={state.availableFromMin}
                    onFocus={() => setHistoryFromFocused(true)}
                    onBlur={() => setHistoryFromFocused(false)}
                    onChange={(event) => setField('availableFromMin', event.currentTarget.value)}
                    placeholder="от"
                    aria-label="История от"
                    className={styles.compactDateInput}
                  />
                  <TextInput
                    type={historyToFocused || Boolean(state.availableFromMax) ? 'date' : 'text'}
                    value={state.availableFromMax}
                    onFocus={() => setHistoryToFocused(true)}
                    onBlur={() => setHistoryToFocused(false)}
                    onChange={(event) => setField('availableFromMax', event.currentTarget.value)}
                    placeholder="до"
                    aria-label="История до"
                    className={styles.compactDateInput}
                  />
                </div>
              </Input.Wrapper>
            </div>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Показано: {sortedRows.length} из {rows.length}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconCopy size={14} />}
                  onClick={() => void copySymbols(sortedRows.map((row) => row.symbol), 'table')}
                >
                  Копировать
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconRestore size={14} />}
                  onClick={handleReset}
                >
                  Сбросить
                </Button>
              </Group>
            </Group>

            {copyStatus && <Text size="sm" c="teal">{copyStatus}</Text>}

            <ScrollArea h={540} type="always" scrollbarSize={8}>
              <Table striped highlightOnHover withTableBorder className={styles.assetsTable}>
                <Table.Thead>
                  <Table.Tr>
                    {renderHeader('Symbol', 'symbol', {
                      thClassName: styles.symbolCol,
                      innerClassName: styles.symbolHeaderInner
                    })}
                    {renderHeader('Leverage', 'leverage', {
                      infoKey: 'leverage',
                      thClassName: styles.metricCol,
                      innerClassName: styles.metricHeaderInner
                    })}
                    {renderHeader('AvailableFrom', 'availableFrom', {
                      infoKey: 'availableFrom',
                      thClassName: styles.metricCol,
                      innerClassName: styles.metricHeaderInner
                    })}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loadingData ? (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Group justify="center" py="md">
                          <Loader size="xs" />
                          <Text size="sm" c="dimmed">Загрузка данных...</Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : sortedRows.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Text ta="center" c="dimmed" py="md">
                          По текущим фильтрам ничего не найдено.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    sortedRows.map((row) => (
                      <Table.Tr key={row.symbol}>
                        <Table.Td className={styles.symbolCol}>
                          <Text fw={600} className={styles.symbolValue}>
                            {formatSymbol(row.symbol, state.symbolFormat)}
                          </Text>
                        </Table.Td>
                        <Table.Td className={styles.metricCol}>{row.leverage}</Table.Td>
                        <Table.Td className={styles.metricCol}>
                          {row.availableFrom ? row.availableFrom : '-'}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
