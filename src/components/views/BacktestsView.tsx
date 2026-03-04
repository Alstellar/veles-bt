import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  Input,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconArrowNarrowDown,
  IconArrowNarrowUp,
  IconArrowsSort,
  IconCalculator,
  IconList,
  IconPlayerPlay,
  IconPlayerStop
} from '@tabler/icons-react';
import dayjs from 'dayjs';

import { ConnectionAlert } from '../ConnectionAlert';
import { StorageService } from '../../services/StorageService';
import {
  fetchAvailability,
  fetchExchanges,
  fetchImportPayload,
  fetchLimitations
} from '../../services/apiService';
import type { BacktestQueueController, QueueItem } from '../../hooks/useBacktestQueue';
import type {
  BacktestsResumeSource,
  BacktestsResumeTemplate,
  ExchangeInfo,
  ExchangeType,
  SymbolAvailability,
  SymbolLimitation
} from '../../types';
import {
  DEFAULT_BACKTESTS_NAME_TEMPLATE,
  buildQueueItemsFromBacktestsSource,
  buildSymbolMaxLeverageMap,
  extractTemplateFromPayload,
  getExchangeFilteredSymbols,
  parseSymbolsInput,
  parseTemplateLinksInput,
  toIsoDateString,
  type MatrixPairError
} from '../../services/BacktestsMatrixService';
import styles from './BacktestsView.module.css';

interface BacktestsViewProps {
  queueController: BacktestQueueController;
  onOpenLiveResultsModal: (title?: string) => void;
  resumeBatchId?: string | null;
  onResumeHandled?: () => void;
  connectionError?: string | null;
}

interface MatrixValidationResult {
  ok: boolean;
  errors: string[];
  source: BacktestsResumeSource | null;
  templatesCount: number;
  symbolsCount: number;
  queueSize: number;
  invalidLinks: string[];
  unreadableLinks: string[];
  missingSymbols: string[];
  skippedPairs: MatrixPairError[];
}

type AssetsSortKey = 'symbol' | 'leverage' | 'availableFrom';
type AssetsSortDir = 'asc' | 'desc';

interface FilteredAssetRow {
  symbol: string;
  leverage: number | null;
  availableFrom: string | null;
}

const FALLBACK_EXCHANGES: ExchangeInfo[] = [
  { name: 'Binance Futures', key: 'BINANCE_FUTURES', type: 'FUTURES' },
  { name: 'Binance Spot', key: 'BINANCE', type: 'SPOT' },
  { name: 'Bybit Futures', key: 'BYBIT_FUTURES', type: 'FUTURES' },
  { name: 'Bybit Spot', key: 'BYBIT_SPOT', type: 'SPOT' },
  { name: 'OKX Futures', key: 'OKX_FUTURES', type: 'FUTURES' },
  { name: 'OKX Spot', key: 'OKX_SPOT', type: 'SPOT' },
  { name: 'BingX Futures', key: 'BINGX_FUTURES', type: 'FUTURES' },
  { name: 'Bitget Futures', key: 'BITGET_FUTURES', type: 'FUTURES' },
  { name: 'Gate.io Spot', key: 'GATE_IO_SPOT', type: 'SPOT' },
  { name: 'Gate.io Futures', key: 'GATE_IO_FUTURES', type: 'FUTURES' },
  { name: 'HTX Spot', key: 'HUOBI_SPOT', type: 'SPOT' }
];

const parseOptionalNumber = (value: number | '' | null): number | null => {
  if (value === '' || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDateToIso = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const compareNullableNumber = (a: number | null, b: number | null, dir: AssetsSortDir): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const diff = a - b;
  return dir === 'asc' ? diff : -diff;
};

const makeBatchId = (): string => {
  return `#${Math.floor(Date.now() % 0xfffff).toString(16).toUpperCase()}`;
};

const toNumberInputValue = (value: string | number): number | '' => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return '';
};

const toDateValue = (value: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const DEFAULT_MAKER_FEE = '0.02';
const DEFAULT_TAKER_FEE = '0.055';

const normalizeFeeInput = (value: string): string => value.trim().replace(',', '.');

const parseFeeValue = (value: string): number | null => {
  const normalized = normalizeFeeInput(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

export function BacktestsView({
  queueController,
  onOpenLiveResultsModal,
  resumeBatchId,
  onResumeHandled,
  connectionError
}: BacktestsViewProps) {
  const {
    run,
    stop,
    isRunning,
    progress
  } = queueController;

  const [nameTemplate, setNameTemplate] = useState(DEFAULT_BACKTESTS_NAME_TEMPLATE);
  const [dateFrom, setDateFrom] = useState<Date | null>(dayjs().subtract(1, 'year').toDate());
  const [dateTo, setDateTo] = useState<Date | null>(new Date());
  const [makerFee, setMakerFee] = useState(DEFAULT_MAKER_FEE);
  const [takerFee, setTakerFee] = useState(DEFAULT_TAKER_FEE);
  const [isPublic, setIsPublic] = useState(true);
  const [useWicks, setUseWicks] = useState(true);

  const [linksText, setLinksText] = useState('');
  const [assetsSource, setAssetsSource] = useState<'manual' | 'exchange_filtered'>('manual');
  const [assetsInputText, setAssetsInputText] = useState('');

  const [exchange, setExchange] = useState<ExchangeType>('BINANCE_FUTURES');
  const [leverageMin, setLeverageMin] = useState<number | ''>('');
  const [leverageMax, setLeverageMax] = useState<number | ''>('');
  const [availableFromMin, setAvailableFromMin] = useState<Date | null>(null);
  const [selectedFilteredSymbols, setSelectedFilteredSymbols] = useState<string[]>([]);
  const [hasCustomFilteredSelection, setHasCustomFilteredSelection] = useState(false);
  const [assetsSortKey, setAssetsSortKey] = useState<AssetsSortKey>('symbol');
  const [assetsSortDir, setAssetsSortDir] = useState<AssetsSortDir>('asc');

  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([]);
  const [limitations, setLimitations] = useState<SymbolLimitation[]>([]);
  const [availability, setAvailability] = useState<SymbolAvailability[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<MatrixValidationResult | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadExchanges = async () => {
      setLoadingExchanges(true);
      try {
        const remote = await fetchExchanges().catch(() => []);
        const list = remote.length > 0 ? remote : FALLBACK_EXCHANGES;
        if (!mounted) return;

        setExchanges(list);

        const hasCurrent = list.some((item) => item.key === exchange);
        if (!hasCurrent) {
          setExchange((list[0]?.key ?? 'BINANCE_FUTURES') as ExchangeType);
        }
      } finally {
        if (mounted) setLoadingExchanges(false);
      }
    };

    void loadExchanges();
    return () => {
      mounted = false;
    };
  }, [exchange]);

  useEffect(() => {
    if (!exchange) return;
    let mounted = true;

    const loadAssets = async () => {
      setLoadingAssets(true);
      try {
        const [limits, avail] = await Promise.all([
          fetchLimitations(exchange).catch(() => []),
          fetchAvailability(exchange).catch(() => [])
        ]);

        if (!mounted) return;
        setLimitations(limits);
        setAvailability(avail);
      } finally {
        if (mounted) setLoadingAssets(false);
      }
    };

    void loadAssets();
    return () => {
      mounted = false;
    };
  }, [exchange]);

  const exchangeOptions = useMemo(
    () => exchanges.map((item) => ({ value: item.key, label: item.name })),
    [exchanges]
  );

  const availabilityMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    availability.forEach((item) => {
      map[item.symbol.toUpperCase()] = normalizeDateToIso(item.availableFrom);
    });
    return map;
  }, [availability]);

  const manualSymbolsResult = useMemo(
    () => parseSymbolsInput(assetsInputText, limitations),
    [assetsInputText, limitations]
  );

  const filteredSymbols = useMemo(() => {
    return getExchangeFilteredSymbols(
      limitations,
      {
        leverageMin: parseOptionalNumber(leverageMin),
        leverageMax: parseOptionalNumber(leverageMax),
        availableFromMin: availableFromMin ? dayjs(availableFromMin).format('YYYY-MM-DD') : null
      },
      availabilityMap
    );
  }, [availabilityMap, availableFromMin, leverageMax, leverageMin, limitations]);

  useEffect(() => {
    setSelectedFilteredSymbols((prev) => {
      if (!hasCustomFilteredSelection) return filteredSymbols;
      const visible = new Set(filteredSymbols);
      return prev.filter((symbol) => visible.has(symbol));
    });
  }, [filteredSymbols, hasCustomFilteredSelection]);

  const filteredRows = useMemo<FilteredAssetRow[]>(() => {
    const bySymbol = new Map<string, SymbolLimitation>();
    limitations.forEach((item) => bySymbol.set(item.symbol.toUpperCase(), item));
    return filteredSymbols.map((symbol) => {
      const limitation = bySymbol.get(symbol);
      return {
        symbol,
        leverage: limitation?.leverage ?? null,
        availableFrom: availabilityMap[symbol] ?? null
      };
    });
  }, [availabilityMap, filteredSymbols, limitations]);

  const sortedFilteredRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => {
      let result = 0;

      if (assetsSortKey === 'symbol') {
        result = a.symbol.localeCompare(b.symbol);
        return assetsSortDir === 'asc' ? result : -result;
      }

      if (assetsSortKey === 'leverage') {
        result = compareNullableNumber(a.leverage, b.leverage, assetsSortDir);
      }

      if (assetsSortKey === 'availableFrom') {
        const aDate = a.availableFrom ? Date.parse(a.availableFrom) : null;
        const bDate = b.availableFrom ? Date.parse(b.availableFrom) : null;
        result = compareNullableNumber(aDate, bDate, assetsSortDir);
      }

      if (result !== 0) return result;
      return a.symbol.localeCompare(b.symbol);
    });
    return next;
  }, [assetsSortDir, assetsSortKey, filteredRows]);

  const selectedVisibleCount = useMemo(
    () => selectedFilteredSymbols.filter((symbol) => filteredSymbols.includes(symbol)).length,
    [filteredSymbols, selectedFilteredSymbols]
  );

  const allVisibleSelected = filteredSymbols.length > 0 && selectedVisibleCount === filteredSymbols.length;
  const partiallyVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < filteredSymbols.length;

  const toggleFilteredSymbol = (symbol: string, checked: boolean) => {
    setHasCustomFilteredSelection(true);
    setSelectedFilteredSymbols((prev) => {
      const next = new Set(prev);
      if (checked) next.add(symbol);
      else next.delete(symbol);
      return Array.from(next);
    });
  };

  const toggleAllVisibleSymbols = (checked: boolean) => {
    setHasCustomFilteredSelection(true);
    setSelectedFilteredSymbols(checked ? [...filteredSymbols] : []);
  };

  const handleAssetsSort = (key: AssetsSortKey) => {
    if (assetsSortKey === key) {
      setAssetsSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAssetsSortKey(key);
    setAssetsSortDir('asc');
  };

  const renderSortIcon = (key: AssetsSortKey) => {
    if (assetsSortKey !== key) {
      return <IconArrowsSort size={12} className={styles.sortHeaderIcon} />;
    }

    return assetsSortDir === 'asc' ? (
      <IconArrowNarrowUp size={13} className={`${styles.sortHeaderIcon} ${styles.sortHeaderIconActive}`.trim()} />
    ) : (
      <IconArrowNarrowDown size={13} className={`${styles.sortHeaderIcon} ${styles.sortHeaderIconActive}`.trim()} />
    );
  };

  const parsedTemplateLinks = useMemo(() => parseTemplateLinksInput(linksText), [linksText]);

  const previewTemplatesCount = parsedTemplateLinks.links.length;
  const previewSymbolsCount =
    assetsSource === 'manual' ? manualSymbolsResult.resolvedSymbols.length : selectedFilteredSymbols.length;
  const previewMissingSymbolsCount =
    assetsSource === 'manual' ? manualSymbolsResult.missingSymbols.length : 0;
  const previewPairsCount = previewTemplatesCount * previewSymbolsCount;

  const applyPeriodMonths = (months: number) => {
    const to = dateTo ?? new Date();
    setDateFrom(dayjs(to).subtract(months, 'month').toDate());
  };

  const applyWholePeriod = () => {
    setDateFrom(dayjs('2019-01-01').toDate());
  };

  const buildValidationResult = useCallback(async (): Promise<MatrixValidationResult> => {
    const errors: string[] = [];
    const invalidLinks = parsedTemplateLinks.invalidLines;
    const parsedMakerFee = parseFeeValue(makerFee);
    const parsedTakerFee = parseFeeValue(takerFee);

    if (parsedMakerFee === null) {
      errors.push('Maker Fee (%) должен быть неотрицательным числом.');
    }
    if (parsedTakerFee === null) {
      errors.push('Taker Fee (%) должен быть неотрицательным числом.');
    }

    if (!exchange) errors.push('Выберите биржу.');
    if (!dateFrom || !dateTo) errors.push('Заполните даты начала и конца.');
    if (dateFrom && dateTo && dayjs(dateFrom).isAfter(dayjs(dateTo))) {
      errors.push('Дата начала не может быть позже даты конца.');
    }

    if (parsedTemplateLinks.links.length === 0) {
      errors.push('Добавьте хотя бы одну ссылку на шаблон бота.');
    }
    if (invalidLinks.length > 0) {
      errors.push(`Есть невалидные ссылки: ${invalidLinks.length}.`);
    }

    const symbols =
      assetsSource === 'manual'
        ? manualSymbolsResult.resolvedSymbols
        : selectedFilteredSymbols;

    const missingSymbols =
      assetsSource === 'manual'
        ? manualSymbolsResult.missingSymbols
        : [];

    if (assetsSource === 'manual' && manualSymbolsResult.inputSymbols.length === 0) {
      errors.push('Добавьте хотя бы один актив в блоке "Активы".');
    }
    if (symbols.length === 0) {
      errors.push('Не найдено валидных активов для запуска.');
    }
    if (assetsSource === 'exchange_filtered' && selectedFilteredSymbols.length === 0) {
      errors.push('Выберите хотя бы один актив из списка биржи.');
    }
    if (missingSymbols.length > 0) {
      errors.push(`Есть нераспознанные активы: ${missingSymbols.length}.`);
    }

    const unreadableLinks: string[] = [];
    const templates: BacktestsResumeTemplate[] = [];

    if (errors.length === 0) {
      for (const link of parsedTemplateLinks.links) {
        try {
          const payload = await fetchImportPayload(link.code);
          const template = extractTemplateFromPayload(link.code, link.url, payload);
          templates.push(template);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          unreadableLinks.push(`${link.url} — ${message}`);
        }
      }
    }

    if (templates.length === 0) {
      errors.push('Не удалось загрузить ни одного шаблона.');
    }
    if (unreadableLinks.length > 0) {
      errors.push(`Есть недоступные шаблоны: ${unreadableLinks.length}.`);
    }

    if (errors.length > 0 || !dateFrom || !dateTo) {
      return {
        ok: false,
        errors,
        source: null,
        templatesCount: templates.length,
        symbolsCount: symbols.length,
        queueSize: 0,
        invalidLinks,
        unreadableLinks,
        missingSymbols,
        skippedPairs: []
      };
    }

    const source: BacktestsResumeSource = {
      version: 1,
      exchange,
      dateFrom: toIsoDateString(dateFrom),
      dateTo: toIsoDateString(dateTo),
      nameTemplate: nameTemplate.trim() || DEFAULT_BACKTESTS_NAME_TEMPLATE,
      makerFee: normalizeFeeInput(makerFee) || DEFAULT_MAKER_FEE,
      takerFee: normalizeFeeInput(takerFee) || DEFAULT_TAKER_FEE,
      isPublic,
      useWicks,
      linksText,
      assetsInputText,
      assetsSource,
      symbols,
      symbolMaxLeverage: buildSymbolMaxLeverageMap(limitations),
      templates
    };

    const preview = buildQueueItemsFromBacktestsSource('#PREVIEW', source);

    return {
      ok: true,
      errors: [],
      source,
      templatesCount: templates.length,
      symbolsCount: symbols.length,
      queueSize: preview.items.length,
      invalidLinks,
      unreadableLinks,
      missingSymbols,
      skippedPairs: preview.skipped
    };
  }, [
    assetsInputText,
    assetsSource,
    dateFrom,
    dateTo,
    exchange,
    limitations,
    linksText,
    manualSymbolsResult.inputSymbols.length,
    manualSymbolsResult.missingSymbols,
    manualSymbolsResult.resolvedSymbols,
    nameTemplate,
    makerFee,
    takerFee,
    isPublic,
    useWicks,
    parsedTemplateLinks.invalidLines,
    parsedTemplateLinks.links,
    selectedFilteredSymbols
  ]);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const result = await buildValidationResult();
      setValidationReport(result);

      if (!result.ok) {
        alert(`Ошибка валидации:\n${result.errors.map((item) => `- ${item}`).join('\n')}`);
        return;
      }

      const reportLines = [
        `Шаблонов: ${result.templatesCount}`,
        `Активов: ${result.symbolsCount}`,
        `К запуску: ${result.queueSize}`,
        `Пропущено (плечо): ${result.skippedPairs.length}`
      ];
      alert(`Валидация пройдена:\n${reportLines.join('\n')}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleRun = async () => {
    setIsValidating(true);
    try {
      const result = await buildValidationResult();
      setValidationReport(result);

      if (!result.ok || !result.source) {
        alert(`Ошибка валидации:\n${result.errors.map((item) => `- ${item}`).join('\n')}`);
        return;
      }

      const batchId = makeBatchId();
      const built = buildQueueItemsFromBacktestsSource(batchId, result.source);

      if (built.items.length === 0) {
        alert('После проверок не осталось валидных комбинаций для запуска.');
        return;
      }

      const confirmed = window.confirm(
        [
          `Комбинаций к запуску: ${built.items.length}`,
          `Пропущено по плечу: ${built.skipped.length}`,
          '',
          'Запустить бектесты?'
        ].join('\n')
      );
      if (!confirmed) return;

      const namePrefix = `Бектесты (${result.source.templates.length}x${result.source.symbols.length})`;
      const batchSymbol = result.source.symbols.length === 1 ? result.source.symbols[0] : `${result.source.symbols.length} symbols`;

      await StorageService.saveBatch({
        id: batchId,
        timestamp: Date.now(),
        namePrefix,
        symbol: batchSymbol,
        exchange: result.source.exchange,
        totalTests: built.items.length,
        velesIds: [],
        mode: 'BACKTESTS',
        backtestsSource: result.source,
        completedTests: 0,
        runStatus: 'STOP'
      });

      onOpenLiveResultsModal(`${namePrefix} (${batchId})`);
      run(batchId, built.items);
    } finally {
      setIsValidating(false);
    }
  };

  const resumeBacktestsBatch = useCallback(
    async (batchId: string) => {
      const runtime = await StorageService.getBatchRuntime(batchId);
      const batch = await StorageService.getBatchById(batchId);

      if (!runtime || !batch?.backtestsSource) {
        alert('Этот запуск нельзя продолжить: отсутствуют сохраненные данные.');
        return;
      }

      const source = batch.backtestsSource;
      const regenerated = buildQueueItemsFromBacktestsSource(batchId, source);
      const expectedTotal = runtime.total || regenerated.items.length;

      if (regenerated.items.length !== expectedTotal) {
        await StorageService.updateBatchRunState(batchId, 'STOP', {
          stopReason: 'runtime_error',
          lastError: 'Resume mismatch: generated combinations count differs'
        });
        alert('Продолжить запуск нельзя: изменился размер матрицы комбинаций.');
        return;
      }

      const nextIndex = Math.max(0, Math.min(runtime.nextIndex, regenerated.items.length));
      const preparedItems: QueueItem[] = regenerated.items.map((item, index) => (
        index < nextIndex
          ? { ...item, status: 'FINISHED' }
          : item
      ));

      setExchange(source.exchange);
      setDateFrom(new Date(source.dateFrom));
      setDateTo(new Date(source.dateTo));
      setNameTemplate(source.nameTemplate);
      setMakerFee(source.makerFee ?? DEFAULT_MAKER_FEE);
      setTakerFee(source.takerFee ?? DEFAULT_TAKER_FEE);
      setIsPublic(source.isPublic ?? true);
      setUseWicks(source.useWicks ?? true);
      setLinksText(source.linksText);
      setAssetsSource(source.assetsSource);
      setAssetsInputText(source.assetsInputText);
      setSelectedFilteredSymbols(source.symbols);
      setHasCustomFilteredSelection(true);

      setValidationReport({
        ok: true,
        errors: [],
        source,
        templatesCount: source.templates.length,
        symbolsCount: source.symbols.length,
        queueSize: regenerated.items.length,
        invalidLinks: [],
        unreadableLinks: [],
        missingSymbols: [],
        skippedPairs: regenerated.skipped
      });

      onOpenLiveResultsModal(`${batch.namePrefix} (${batch.id})`);
      run(batchId, preparedItems, { resumeFrom: nextIndex });
    },
    [run, onOpenLiveResultsModal]
  );

  useEffect(() => {
    if (!resumeBatchId) return;
    const batchId = resumeBatchId;
    onResumeHandled?.();
    void resumeBacktestsBatch(batchId);
  }, [onResumeHandled, resumeBacktestsBatch, resumeBatchId]);

  const summaryQueueSize = validationReport?.queueSize ?? previewPairsCount;
  const summarySkipped = validationReport?.skippedPairs.length ?? 0;
  const summaryInvalidLinks = validationReport?.invalidLinks.length ?? parsedTemplateLinks.invalidLines.length;
  const summaryUnreadableLinks = validationReport?.unreadableLinks.length ?? 0;
  const summaryMissingSymbols = validationReport?.missingSymbols.length ?? previewMissingSymbolsCount;

  return (
    <Container size="xl" py="xl" pb={100} className={styles.viewRoot}>
      <div className={styles.topbar}>
        <Title order={2} ta="center">Бектесты</Title>
      </div>

      {connectionError && (
        <Paper withBorder p="sm" radius="md" className={`ui-card ${styles.sectionGlass}`}>
          <ConnectionAlert visible />
        </Paper>
      )}

      <Stack gap="lg" className={styles.sectionsStack}>
        <Paper withBorder radius="md" p="md" className={styles.sectionGlass}>
          <Stack gap="md">
            <Title order={3} className={styles.sectionTitle}>Базовые настройки</Title>

            <TextInput
              label="Шаблон имени"
              value={nameTemplate}
              onChange={(event) => setNameTemplate(event.currentTarget.value)}
              placeholder="{template} {symbol} | {n}/{total} | VH {batch}"
            />
            <Text size="xs" c="dimmed" className={styles.filterInfo}>
              Доступные переменные: {'{template}'}, {'{symbol}'}, {'{pair}'}, {'{n}'}, {'{total}'}, {'{batch}'}.
            </Text>

            <Paper withBorder radius="md" p="sm" className={styles.periodBlock}>
              <Text className={styles.periodTitle}>Даты и период</Text>
              <Group gap="xs" className={styles.periodButtons}>
                <Button variant="default" size="xs" onClick={() => applyPeriodMonths(1)}>1 Мес</Button>
                <Button variant="default" size="xs" onClick={() => applyPeriodMonths(3)}>3 Мес</Button>
                <Button variant="default" size="xs" onClick={() => applyPeriodMonths(6)}>6 Мес</Button>
                <Button variant="default" size="xs" onClick={() => applyPeriodMonths(12)}>1 Год</Button>
                <Button variant="default" size="xs" onClick={applyWholePeriod}>Весь период</Button>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <DateInput
                  label="Дата начала (From)"
                  value={dateFrom}
                  onChange={(value) => setDateFrom(toDateValue(value))}
                  valueFormat="DD.MM.YYYY"
                />
                <DateInput
                  label="Дата конца (To)"
                  value={dateTo}
                  onChange={(value) => setDateTo(toDateValue(value))}
                  valueFormat="DD.MM.YYYY"
                />
              </SimpleGrid>
            </Paper>

            <Divider label="Дополнительно" labelPosition="center" />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Stack gap="lg">
                <TextInput
                  label="Maker Fee (%)"
                  value={makerFee}
                  onChange={(event) => setMakerFee(event.currentTarget.value)}
                />
                <Paper withBorder p="xs" bg="gray.1" radius="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>Публичный тест</Text>
                    <Switch
                      size="md"
                      checked={isPublic}
                      onChange={(event) => setIsPublic(event.currentTarget.checked)}
                    />
                  </Group>
                </Paper>
              </Stack>

              <Stack gap="lg">
                <TextInput
                  label="Taker Fee (%)"
                  value={takerFee}
                  onChange={(event) => setTakerFee(event.currentTarget.value)}
                />
                <Paper withBorder p="xs" bg="gray.1" radius="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>Учитывать тени</Text>
                    <Switch
                      size="md"
                      checked={useWicks}
                      onChange={(event) => setUseWicks(event.currentTarget.checked)}
                    />
                  </Group>
                </Paper>
              </Stack>
            </SimpleGrid>
          </Stack>
        </Paper>

        <div className={styles.columnsGrid}>
          <div className={styles.columnSection}>
            <Paper withBorder radius="md" p="md" className={`${styles.sectionGlass} ${styles.columnPaper}`}>
              <Stack gap="md" className={styles.columnStack}>
                <Title order={3} className={styles.sectionTitle}>Шаблоны</Title>
                <Text size="sm" c="dimmed">
                  Вставьте ссылки на ботов Veles, по одной на строку.
                </Text>
                <div className={styles.templatesTextareaWrap}>
                  <Textarea
                    placeholder={'https://veles.finance/share/SDxEv\nhttps://veles.finance/share/AbCd1'}
                    value={linksText}
                    onChange={(event) => setLinksText(event.currentTarget.value)}
                    rows={15}
                    className={styles.templatesTextarea}
                    styles={{
                      root: { width: '100%', flex: 1 },
                      wrapper: { width: '100%', flex: 1 },
                      input: { width: '100%', minHeight: '100%' }
                    }}
                  />
                </div>
                <Group gap="xs">
                  <Badge color="blue" variant="light">Валидных ссылок: {parsedTemplateLinks.links.length}</Badge>
                  {parsedTemplateLinks.invalidLines.length > 0 && (
                    <Badge color="red" variant="light">Невалидных: {parsedTemplateLinks.invalidLines.length}</Badge>
                  )}
                </Group>
              </Stack>
            </Paper>
          </div>

          <div className={styles.columnSection}>
            <Paper withBorder radius="md" p="md" className={`${styles.sectionGlass} ${styles.columnPaper}`}>
              <Stack gap="md" className={styles.columnStack}>
                <Title order={3} className={styles.sectionTitle}>Активы</Title>

                <div className={styles.assetsTopRow}>
                  <Select
                    label="Биржа"
                    data={exchangeOptions}
                    value={exchange}
                    onChange={(value) => {
                      if (value) setExchange(value as ExchangeType);
                    }}
                    disabled={loadingExchanges}
                    rightSection={loadingExchanges ? <Loader size={14} /> : undefined}
                  />

                  <Select
                    label="Источник активов"
                    data={[
                      { value: 'manual', label: 'Ручной ввод' },
                      { value: 'exchange_filtered', label: 'Активы с биржи' }
                    ]}
                    value={assetsSource}
                    onChange={(value) => {
                      if (value === 'manual' || value === 'exchange_filtered') {
                        setAssetsSource(value);
                      }
                    }}
                  />
                </div>

                {assetsSource === 'manual' ? (
                  <div className={styles.wideCenteredInput}>
                    <Textarea
                      label="Список активов"
                      placeholder={'BTC\nBTCUSDT\nBTC/USDT\nETH, SOL, ADA'}
                      value={assetsInputText}
                      onChange={(event) => setAssetsInputText(event.currentTarget.value)}
                      rows={15}
                    />
                  </div>
                ) : (
                  <Stack gap="sm">
                    <div className={styles.assetsFilterRow}>
                      <div className={styles.leverageGroup}>
                        <Input.Wrapper label="Leverage">
                          <div className={styles.leverageInputs}>
                          <NumberInput
                            value={leverageMin}
                            onChange={(value) => setLeverageMin(toNumberInputValue(value))}
                            min={0}
                            decimalScale={0}
                            placeholder="От"
                            className={styles.compactNumber}
                          />
                          <NumberInput
                            value={leverageMax}
                            onChange={(value) => setLeverageMax(toNumberInputValue(value))}
                            min={0}
                            decimalScale={0}
                            placeholder="До"
                            className={styles.compactNumber}
                          />
                          </div>
                        </Input.Wrapper>
                      </div>
                      <DateInput
                        label="История от"
                        value={availableFromMin}
                        onChange={(value) => setAvailableFromMin(toDateValue(value))}
                        valueFormat="DD.MM.YYYY"
                        className={styles.compactDate}
                      />
                    </div>
                    <Text size="sm" c="dimmed">
                      Подбор активов идет из лимитов выбранной биржи с учетом фильтров.
                    </Text>

                    <div className={styles.symbolsTableWrap}>
                      <ScrollArea h={250} type="auto" offsetScrollbars>
                        <Table stickyHeader verticalSpacing="xs" highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>
                                <Group gap={8} wrap="nowrap">
                                  <Checkbox
                                    checked={allVisibleSelected}
                                    indeterminate={partiallyVisibleSelected}
                                    onChange={(event) => toggleAllVisibleSymbols(event.currentTarget.checked)}
                                  />
                                  <button
                                    type="button"
                                    className={`${styles.sortHeaderButton} ${assetsSortKey === 'symbol' ? styles.sortHeaderButtonActive : ''}`.trim()}
                                    onClick={() => handleAssetsSort('symbol')}
                                  >
                                    <span>Symbol</span>
                                    {renderSortIcon('symbol')}
                                  </button>
                                </Group>
                              </Table.Th>
                              <Table.Th ta="center">
                                <button
                                  type="button"
                                  className={`${styles.sortHeaderButton} ${styles.sortHeaderButtonCenter} ${assetsSortKey === 'leverage' ? styles.sortHeaderButtonActive : ''}`.trim()}
                                  onClick={() => handleAssetsSort('leverage')}
                                >
                                  <span>Leverage</span>
                                  {renderSortIcon('leverage')}
                                </button>
                              </Table.Th>
                              <Table.Th ta="center">
                                <button
                                  type="button"
                                  className={`${styles.sortHeaderButton} ${styles.sortHeaderButtonCenter} ${assetsSortKey === 'availableFrom' ? styles.sortHeaderButtonActive : ''}`.trim()}
                                  onClick={() => handleAssetsSort('availableFrom')}
                                >
                                  <span>AvailableFrom</span>
                                  {renderSortIcon('availableFrom')}
                                </button>
                              </Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {sortedFilteredRows.map((row) => {
                              const checked = selectedFilteredSymbols.includes(row.symbol);
                              return (
                                <Table.Tr key={row.symbol}>
                                  <Table.Td>
                                    <Group gap={8} wrap="nowrap">
                                      <Checkbox
                                        checked={checked}
                                        onChange={(event) => toggleFilteredSymbol(row.symbol, event.currentTarget.checked)}
                                      />
                                      <Text size="sm">{row.symbol}</Text>
                                    </Group>
                                  </Table.Td>
                                  <Table.Td ta="center">
                                    <Text size="sm">{row.leverage ?? '-'}</Text>
                                  </Table.Td>
                                  <Table.Td ta="center">
                                    <Text size="sm">{row.availableFrom ? dayjs(row.availableFrom).format('DD.MM.YYYY') : '-'}</Text>
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </Stack>
                )}

                <Group gap="xs">
                  <Badge color="indigo" variant="light">
                    Найдено активов: {assetsSource === 'manual' ? manualSymbolsResult.resolvedSymbols.length : filteredSymbols.length}
                  </Badge>
                  {assetsSource === 'exchange_filtered' && (
                    <Badge color="blue" variant="light">
                      Выбрано: {selectedVisibleCount}
                    </Badge>
                  )}
                  {loadingAssets && <Badge color="gray" variant="light">Обновление данных...</Badge>}
                  {assetsSource === 'manual' && manualSymbolsResult.missingSymbols.length > 0 && (
                    <Badge color="red" variant="light">Не распознано: {manualSymbolsResult.missingSymbols.length}</Badge>
                  )}
                </Group>
              </Stack>
            </Paper>
          </div>
        </div>

        <Paper withBorder radius="md" p="md" className={styles.sectionGlass}>
          <Stack gap="md">
            <Title order={3} className={styles.sectionTitle}>Сводка</Title>

            <div className={styles.summaryGrid}>
              <div className={styles.summaryBlock}>
                <div className={styles.kv}><span>Валидных ссылок</span><strong>{previewTemplatesCount}</strong></div>
                <div className={styles.kv}><span>Невалидных ссылок</span><strong>{summaryInvalidLinks}</strong></div>
                <div className={styles.kv}><span>Недоступных шаблонов</span><strong>{summaryUnreadableLinks}</strong></div>
              </div>

              <div className={styles.summaryBlock}>
                <div className={styles.kv}><span>Активов (валидных)</span><strong>{previewSymbolsCount}</strong></div>
                <div className={styles.kv}><span>Тикеров не найдено</span><strong>{summaryMissingSymbols}</strong></div>
                <div className={styles.kv}><span>Активов на бирже</span><strong>{limitations.length}</strong></div>
              </div>

              <div className={styles.summaryBlock}>
                <div className={styles.kv}><span>Комбинаций (черновик)</span><strong>{previewPairsCount}</strong></div>
                <div className={styles.kv}><span>Комбинаций к запуску</span><strong>{summaryQueueSize}</strong></div>
                <div className={styles.kv}><span>Пропуски по плечу</span><strong>{summarySkipped}</strong></div>
              </div>

              <div className={styles.summaryBlock}>
                <div className={styles.kv}><span>Режим активов</span><strong>{assetsSource === 'manual' ? 'Ручной' : 'Фильтр биржи'}</strong></div>
                <div className={styles.kv}><span>Период</span><strong>{dateFrom && dateTo ? `${dayjs(dateFrom).format('DD.MM.YYYY')} - ${dayjs(dateTo).format('DD.MM.YYYY')}` : '-'}</strong></div>
                <div className={styles.kv}><span>Биржа</span><strong>{exchange}</strong></div>
              </div>
            </div>

            {validationReport && !validationReport.ok && (
              <Paper withBorder radius="md" p="sm" className={styles.warningPanel}>
                <Text fw={600} c="red" mb={6}>Ошибки валидации</Text>
                <Stack gap={4}>
                  {validationReport.errors.map((item, index) => (
                    <Text key={`${item}-${index}`} size="sm">- {item}</Text>
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="md" className={styles.sectionGlass}>
          <Group grow className={styles.runButtons}>
            <Button
              size="md"
              color="blue"
              variant="light"
              leftSection={<IconCalculator size={20} />}
              onClick={() => void handleValidate()}
              loading={isValidating}
              disabled={loadingExchanges || loadingAssets}
            >
              Валидация данных
            </Button>

            {!isRunning ? (
              <Button
                size="md"
                color="green"
                leftSection={<IconPlayerPlay size={20} />}
                onClick={() => void handleRun()}
                loading={isValidating}
                disabled={loadingExchanges || loadingAssets}
              >
                Запустить бектесты
              </Button>
            ) : (
              <Button
                size="md"
                color="blue"
                leftSection={<IconList size={20} />}
                onClick={() => onOpenLiveResultsModal()}
              >
                Открыть таблицу (выполняется...)
              </Button>
            )}
          </Group>

          {isRunning && (
            <Button
              color="red"
              variant="outline"
              fullWidth
              leftSection={<IconPlayerStop size={18} />}
              onClick={stop}
              mt="sm"
            >
              Остановить выполнение ({progress.current}/{progress.total})
            </Button>
          )}
        </Paper>
      </Stack>

    </Container>
  );
}
