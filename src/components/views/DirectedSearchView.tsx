import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import {
  IconCalculator,
  IconDeviceFloppy,
  IconPlayerPlay,
  IconSettingsAutomation,
  IconAbacus,
  IconCash,
  IconTable
} from '@tabler/icons-react';
import { StaticSettings } from '../StaticSettings';
import { EntrySettings } from '../EntrySettings';
import { ConnectionAlert } from '../ConnectionAlert';
import { ResultsModal } from '../ResultsModal';
import { ValidatorService } from '../../services/ValidatorService';
import {
  buildDefaultDirectedSearchConfig,
  buildDirectedSearchDimensions,
  validateDirectedSearchBase
} from '../../services/DirectedSearchService';
import { fetchLimitations } from '../../services/apiService';
import { useDirectedSearch } from '../../hooks/useDirectedSearch';
import { parseDateLike } from '../../utils/datePolicy';
import type {
  DirectedSearchConfig,
  DirectedSearchNumericParam,
  EntryConfig,
  ExitConfig,
  OrderState,
  StaticConfig,
  SymbolLimitation
} from '../../types';
import styles from './BacktesterView.module.css';

interface Props {
  staticConfig: StaticConfig;
  setStaticConfig: (v: StaticConfig) => void;
  entryConfig: EntryConfig;
  setEntryConfig: (v: EntryConfig) => void;
  orderState: OrderState;
  setOrderState: (v: OrderState) => void;
  exitConfig: ExitConfig;
  setExitConfig: (v: ExitConfig) => void;
  onSaveTemplate: () => void;
  connectionError?: string | null;
}

const PARAM_MODE_OPTIONS = [
  { value: 'FIXED', label: 'Фиксированное значение' },
  { value: 'LIST', label: 'Список значений' },
  { value: 'RANGE', label: 'Диапазон' }
];

const SEARCH_ALGORITHM_OPTIONS = [
  { value: 'GENETIC', label: 'Генетический алгоритм' }
];

const GOAL_OPTIONS = [
  { value: 'NET', label: 'Net' },
  { value: 'NET_MAE_ABS', label: 'Net / МПУ' },
  { value: 'NET_PER_DAY', label: 'Эфф. в день' }
];

function hasSymbolInLimitations(limitations: SymbolLimitation[], userSymbol: string): boolean {
  const search = userSymbol.toUpperCase().trim();
  if (!search) return false;

  const searchWithSlash = `${search}/USDT`;
  const searchNoSlash = `${search}USDT`;

  return limitations.some((item) => {
    const itemSym = item.symbol.toUpperCase();
    const itemId = item.externalId ? item.externalId.toUpperCase() : '';

    return (
      itemSym === search ||
      itemSym === searchWithSlash ||
      itemId === search ||
      itemId === searchNoSlash ||
      itemSym.startsWith(`${search}/`)
    );
  });
}

function SearchSection({
  title,
  icon,
  children
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.sectionGlass}>
      <Paper p={0} bg="transparent">
        <Group mb="xs">
          <ThemeIcon variant="light" color="blue">{icon}</ThemeIcon>
          <Text fw={700} size="lg">{title}</Text>
        </Group>
        <Paper withBorder p="md" radius="md" bg="gray.0">
          {children}
        </Paper>
      </Paper>
    </div>
  );
}

function NumericParamEditor({
  title,
  description,
  param,
  onChange,
  disabled = false,
  headerRight
}: {
  title: string;
  description?: string;
  param: DirectedSearchNumericParam;
  onChange: (next: DirectedSearchNumericParam) => void;
  disabled?: boolean;
  headerRight?: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="md" bg={disabled ? 'gray.0' : 'white'}>
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap" style={{ minHeight: 36 }}>
          <div style={{ flex: 1 }}>
            <Text fw={700}>{title}</Text>
            {description && <Text size="xs" c="dimmed">{description}</Text>}
          </div>
          {headerRight}
        </Group>

        <Select
          label="Режим ввода"
          data={PARAM_MODE_OPTIONS}
          value={param.mode}
          onChange={(value) => {
            if (!value) return;
            onChange({ ...param, mode: value as DirectedSearchNumericParam['mode'] });
          }}
          disabled={disabled}
          allowDeselect={false}
        />

        {param.mode === 'FIXED' && (
          <TextInput
            label="Значение"
            value={param.fixedValue}
            onChange={(e) => onChange({ ...param, fixedValue: e.currentTarget.value })}
            disabled={disabled}
          />
        )}

        {param.mode === 'LIST' && (
          <TextInput
            label="Значения"
            description="Через запятую"
            value={param.listValues}
            onChange={(e) => onChange({ ...param, listValues: e.currentTarget.value })}
            disabled={disabled}
          />
        )}

        {param.mode === 'RANGE' && (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <TextInput
              label="От"
              value={param.rangeFrom}
              onChange={(e) => onChange({ ...param, rangeFrom: e.currentTarget.value })}
              disabled={disabled}
            />
            <TextInput
              label="До"
              value={param.rangeTo}
              onChange={(e) => onChange({ ...param, rangeTo: e.currentTarget.value })}
              disabled={disabled}
            />
            <TextInput
              label="Шаг"
              value={param.rangeStep}
              onChange={(e) => onChange({ ...param, rangeStep: e.currentTarget.value })}
              disabled={disabled}
            />
          </SimpleGrid>
        )}

        {disabled && (
          <Text size="xs" c="dimmed">Параметр не используется</Text>
        )}
      </Stack>
    </Paper>
  );
}

export function DirectedSearchView({
  staticConfig,
  setStaticConfig,
  entryConfig,
  setEntryConfig,
  orderState,
  setOrderState,
  exitConfig,
  setExitConfig,
  onSaveTemplate,
  connectionError
}: Props) {
  const search = useDirectedSearch();
  const [resultsOpened, setResultsOpened] = useState(false);
  const [directedConfig, setDirectedConfig] = useState<DirectedSearchConfig>(() => (
    buildDefaultDirectedSearchConfig(orderState, exitConfig)
  ));
  const [isSymbolValid, setIsSymbolValid] = useState<boolean | null>(null);

  const normalizedOrderState = useMemo<OrderState>(() => ({
    ...orderState,
    mode: 'SIMPLE'
  }), [orderState]);

  const normalizedExitConfig = useMemo<ExitConfig>(() => ({
    ...exitConfig,
    profitMode: 'SINGLE',
    stopLoss: {
      ...exitConfig.stopLoss,
      enabledSignal: false,
      conditionalIndent: [],
      filterSlots: []
    }
  }), [exitConfig]);

  const validation = useMemo(
    () => ValidatorService.validate(staticConfig, entryConfig, normalizedOrderState, normalizedExitConfig),
    [staticConfig, entryConfig, normalizedOrderState, normalizedExitConfig]
  );

  const baseValidationError = useMemo(
    () => validateDirectedSearchBase(entryConfig, normalizedOrderState, normalizedExitConfig),
    [entryConfig, normalizedOrderState, normalizedExitConfig]
  );

  const dimensionsMeta = useMemo(
    () => buildDirectedSearchDimensions(directedConfig, normalizedOrderState, normalizedExitConfig),
    [directedConfig, normalizedOrderState, normalizedExitConfig]
  );

  const searchSpaceCount = useMemo(() => (
    dimensionsMeta.dimensions.reduce((acc, dimension) => acc * Math.max(1, dimension.values.length), 1)
  ), [dimensionsMeta.dimensions]);

  const periodLabel = useMemo(() => {
    const from = parseDateLike(staticConfig.dateFrom);
    const to = parseDateLike(staticConfig.dateTo);
    if (!from || !to) return '-';
    return `${Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000))} д`;
  }, [staticConfig.dateFrom, staticConfig.dateTo]);

  useEffect(() => {
    let cancelled = false;
    const symbol = staticConfig.symbol.trim();
    if (!symbol || !staticConfig.exchange) {
      setIsSymbolValid(null);
      return;
    }

    const validateSymbol = async () => {
      try {
        const limitations = await fetchLimitations(staticConfig.exchange);
        const valid = hasSymbolInLimitations(limitations, symbol);
        if (!cancelled) setIsSymbolValid(valid);
      } catch {
        if (!cancelled) setIsSymbolValid(null);
      }
    };

    void validateSymbol();
    return () => {
      cancelled = true;
    };
  }, [staticConfig.exchange, staticConfig.symbol]);

  const updateParam = (key: keyof DirectedSearchConfig['params'], value: DirectedSearchNumericParam) => {
    setDirectedConfig((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        [key]: value
      }
    }));
  };

  const ensureCanRun = async (): Promise<string | null> => {
    if (!validation.valid) {
      return validation.error ?? 'Некорректные параметры конфигурации.';
    }

    if (baseValidationError) {
      return baseValidationError;
    }

    if (dimensionsMeta.error) {
      return dimensionsMeta.error;
    }

    try {
      const limitations = await fetchLimitations(staticConfig.exchange);
      const hasSymbol = hasSymbolInLimitations(limitations, staticConfig.symbol);
      if (!hasSymbol) {
        return 'Монета не найдена в выбранной бирже Veles. Проверьте тикер.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Не удалось проверить ограничения биржи: ${message}`;
    }

    return null;
  };

  const handleValidate = async () => {
    const error = await ensureCanRun();
    if (error) {
      alert(`Ошибка валидации:\n${error}`);
      return;
    }

    alert('Валидация направленного поиска пройдена успешно.');
  };

  const handleRun = async () => {
    const error = await ensureCanRun();
    if (error) {
      alert(`Ошибка валидации:\n${error}`);
      return;
    }

    const totalTests = Number(directedConfig.ga.populationSize || 0) * Number(directedConfig.ga.generations || 0);
    const confirmed = window.confirm(
      `Направленный поиск запланирует до ${search.progress.total || totalTests} тестов.\n\nПродолжить запуск?`
    );
    if (!confirmed) return;

    try {
      await search.run({
        staticConfig,
        entryConfig,
        orderState: normalizedOrderState,
        exitConfig: normalizedExitConfig,
        directedConfig
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      alert(`Не удалось запустить направленный поиск: ${message}`);
    }
  };

  return (
    <Container size="xl" py="xl" pb={100} className={styles.viewRoot}>
      <div className={styles.topbar}>
        <Title order={2} ta="center">Направленный поиск</Title>
      </div>

      {connectionError && (
        <Paper withBorder p="sm" radius="md" className={`ui-card ${styles.sectionGlass}`}>
          <ConnectionAlert visible />
        </Paper>
      )}

      <div className={styles.layout}>
        <div>
          <Stack gap="xl" className={styles.sectionsStack}>
            <div className={styles.sectionGlass}>
              <StaticSettings
                config={staticConfig}
                onChange={setStaticConfig}
                titleVariant="section"
                multiSymbolMode={false}
              />
            </div>

            <SearchSection title="Алгоритм поиска" icon={<IconSettingsAutomation size={20} />}>
              <Stack gap="md">
                <Select
                  label="Алгоритм"
                  data={SEARCH_ALGORITHM_OPTIONS}
                  value={directedConfig.algorithm}
                  onChange={(value) => {
                    if (!value) return;
                    setDirectedConfig((prev) => ({
                      ...prev,
                      algorithm: value as DirectedSearchConfig['algorithm']
                    }));
                  }}
                  allowDeselect={false}
                />

                <Group align="end" grow wrap="nowrap">
                  <Select
                    label="Целевая функция"
                    data={GOAL_OPTIONS}
                    value={directedConfig.goal}
                    onChange={(value) => value && setDirectedConfig((prev) => ({ ...prev, goal: value as DirectedSearchConfig['goal'] }))}
                    allowDeselect={false}
                  />
                  <Button
                    variant="light"
                    leftSection={<IconCalculator size={16} />}
                    onClick={() => setDirectedConfig(buildDefaultDirectedSearchConfig(normalizedOrderState, normalizedExitConfig))}
                  >
                    Сбросить
                  </Button>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                  <TextInput
                    label="Размер популяции"
                    value={directedConfig.ga.populationSize}
                    onChange={(e) => setDirectedConfig((prev) => ({ ...prev, ga: { ...prev.ga, populationSize: e.currentTarget.value } }))}
                  />
                  <TextInput
                    label="Число поколений"
                    value={directedConfig.ga.generations}
                    onChange={(e) => setDirectedConfig((prev) => ({ ...prev, ga: { ...prev.ga, generations: e.currentTarget.value } }))}
                  />
                  <TextInput
                    label="Вероятность мутации"
                    value={directedConfig.ga.mutationRate}
                    onChange={(e) => setDirectedConfig((prev) => ({ ...prev, ga: { ...prev.ga, mutationRate: e.currentTarget.value } }))}
                  />
                  <TextInput
                    label="Элитных кандидатов"
                    value={directedConfig.ga.eliteCount}
                    onChange={(e) => setDirectedConfig((prev) => ({ ...prev, ga: { ...prev.ga, eliteCount: e.currentTarget.value } }))}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                  <TextInput
                    label="Средняя длительность"
                    description="Не более, часов"
                    value={directedConfig.constraints.maxAvgDealDurationMinutes}
                    onChange={(e) => setDirectedConfig((prev) => ({
                      ...prev,
                      constraints: { ...prev.constraints, maxAvgDealDurationMinutes: e.currentTarget.value }
                    }))}
                  />
                  <TextInput
                    label="Количество сделок"
                    description="Не менее"
                    value={directedConfig.constraints.minDeals}
                    onChange={(e) => setDirectedConfig((prev) => ({
                      ...prev,
                      constraints: { ...prev.constraints, minDeals: e.currentTarget.value }
                    }))}
                  />
                  <TextInput
                    label="Net / МПУ"
                    description="Не менее"
                    value={directedConfig.constraints.minNetMaeRatio}
                    onChange={(e) => setDirectedConfig((prev) => ({
                      ...prev,
                      constraints: { ...prev.constraints, minNetMaeRatio: e.currentTarget.value }
                    }))}
                  />
                </SimpleGrid>
              </Stack>
            </SearchSection>

            <div className={styles.sectionGlass}>
              <EntrySettings
                config={entryConfig}
                onChange={setEntryConfig}
              />
            </div>

            <SearchSection title="Ордера сделки" icon={<IconAbacus size={20} />}>
              <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
                <NumericParamEditor
                  title="Подтяжка сетки"
                  param={directedConfig.params.pullUp}
                  onChange={(value) => updateParam('pullUp', value)}
                />
                <NumericParamEditor
                  title="Количество ордеров"
                  param={directedConfig.params.orders}
                  onChange={(value) => updateParam('orders', value)}
                />
                <NumericParamEditor
                  title="Мартингейл"
                  param={directedConfig.params.martingale}
                  onChange={(value) => updateParam('martingale', value)}
                />
                <NumericParamEditor
                  title="Отступ"
                  param={directedConfig.params.indent}
                  onChange={(value) => updateParam('indent', value)}
                />
                <NumericParamEditor
                  title="Перекрытие"
                  param={directedConfig.params.overlap}
                  onChange={(value) => updateParam('overlap', value)}
                />
                <NumericParamEditor
                  title="Логарифм. распределение"
                  param={directedConfig.params.logarithmicFactor}
                  onChange={(value) => updateParam('logarithmicFactor', value)}
                  disabled={!normalizedOrderState.simple.logarithmicEnabled}
                  headerRight={(
                    <Switch
                      checked={normalizedOrderState.simple.logarithmicEnabled}
                      onChange={(e) => setOrderState({
                        ...orderState,
                        simple: {
                          ...orderState.simple,
                          logarithmicEnabled: e.currentTarget.checked
                        }
                      })}
                      size="md"
                    />
                  )}
                />
              </SimpleGrid>
            </SearchSection>

            <SearchSection title="Выход из сделки" icon={<IconCash size={20} />}>
              <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
                <NumericParamEditor
                  title="Тейк-профит"
                  description="Простой режим SINGLE"
                  param={directedConfig.params.takeProfitPercent}
                  onChange={(value) => updateParam('takeProfitPercent', value)}
                />
                <NumericParamEditor
                  title="Стоп-лосс"
                  description="Обычный stop-loss"
                  param={directedConfig.params.stopLossIndent}
                  onChange={(value) => updateParam('stopLossIndent', value)}
                  disabled={!normalizedExitConfig.stopLoss.enabledSimple}
                  headerRight={(
                    <Switch
                      checked={normalizedExitConfig.stopLoss.enabledSimple}
                      onChange={(e) => setExitConfig({
                        ...exitConfig,
                        stopLoss: {
                          ...exitConfig.stopLoss,
                          enabledSimple: e.currentTarget.checked
                        }
                      })}
                      size="md"
                    />
                  )}
                />
              </SimpleGrid>
            </SearchSection>

            <div className={styles.sectionGlass}>
              <Group grow className={styles.runButtons}>
                <Button
                  size="md"
                  color="blue"
                  variant="light"
                  leftSection={<IconCalculator size={20} />}
                  onClick={handleValidate}
                  disabled={search.isRunning}
                >
                  Валидация данных
                </Button>

                {!search.isRunning ? (
                  <Button
                    size="md"
                    color="green"
                    leftSection={<IconPlayerPlay size={20} />}
                    onClick={handleRun}
                  >
                    Запустить поиск
                  </Button>
                ) : (
                  <Button
                    size="md"
                    color="red"
                    leftSection={<IconTable size={20} />}
                    onClick={() => setResultsOpened(true)}
                  >
                    Открыть результаты
                  </Button>
                )}
              </Group>

              {Boolean(search.currentBatchId) && (
                <Button
                  mt="sm"
                  variant="outline"
                  fullWidth
                  onClick={() => setResultsOpened(true)}
                >
                  Показать таблицу результатов
                </Button>
              )}
            </div>
          </Stack>
        </div>

        <aside className={styles.sideColumn}>
          <div className={styles.sideCard}>
            <Stack gap="xs">
              <Button
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={onSaveTemplate}
                disabled={search.isRunning}
                fullWidth
              >
                Сохранить шаблон
              </Button>
            </Stack>
          </div>

          <div className={styles.sideCard}>
            <div className={styles.sideTitle}>Сводка</div>

            <div className={styles.summaryBlock}>
              <div className={styles.kv}><span>Биржа</span><strong>{staticConfig.exchange}</strong></div>
              <div className={styles.kv}><span>Тикер</span><strong>{staticConfig.symbol || '-'}</strong></div>
              <div className={styles.kv}><span>Алгоритм</span><strong>{staticConfig.algo}</strong></div>
              <div className={styles.kv}><span>Период</span><strong>{periodLabel}</strong></div>
            </div>

            <div className={styles.summaryBlock}>
              <div className={styles.kv}><span>Алгоритм поиска</span><strong>GA</strong></div>
              <div className={styles.kv}><span>Пространство поиска</span><strong>{searchSpaceCount}</strong></div>
              <div className={styles.kv}><span>Поколений</span><strong>{directedConfig.ga.generations}</strong></div>
              <div className={styles.kv}><span>Популяция</span><strong>{directedConfig.ga.populationSize}</strong></div>
              <div className={styles.kv}><span>Измерений</span><strong>{dimensionsMeta.dimensions.length}</strong></div>
              <div className={styles.kv}><span>Статус монеты</span><strong>{isSymbolValid === false ? 'Ошибка' : isSymbolValid === true ? 'Ок' : '-'}</strong></div>
            </div>

            {baseValidationError && (
              <div className={styles.summaryBlock}>
                <Badge color="red" variant="light" fullWidth>Требуется SIMPLE / SINGLE / обычный SL</Badge>
                <Text size="xs" c="dimmed">{baseValidationError}</Text>
              </div>
            )}

            {dimensionsMeta.error && (
              <div className={styles.summaryBlock}>
                <Badge color="red" variant="light" fullWidth>Ошибка пространства поиска</Badge>
                <Text size="xs" c="dimmed">{dimensionsMeta.error}</Text>
              </div>
            )}

            {search.results.length > 0 && (
              <div className={styles.summaryBlock}>
                <Text fw={700} size="sm">Топ кандидаты</Text>
                <Stack gap="xs">
                  {search.results.slice(0, 5).map((result, index) => (
                    <Paper key={`${result.resultId ?? 'err'}-${index}`} withBorder p="xs" radius="md">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text size="sm" fw={700}>#{index + 1}</Text>
                          <Text size="xs" c="dimmed">
                            {result.error ? result.error : `Metric: ${Number(result.metricValue ?? 0).toFixed(4)}`}
                          </Text>
                        </div>
                        <Badge color={result.passedConstraints ? 'teal' : 'orange'} variant="light">
                          {result.passedConstraints ? 'OK' : 'Filtered'}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ResultsModal
        opened={resultsOpened}
        onClose={() => setResultsOpened(false)}
        title={search.currentBatchId ? `Направленный поиск (${search.currentBatchId})` : 'Результаты'}
        batchId={search.currentBatchId}
        targetIds={search.currentBatchIds}
        isLive={search.isRunning}
        status={search.statusMessage}
        progress={search.progress}
        onStop={search.stop}
        logs={search.logs}
      />
    </Container>
  );
}
