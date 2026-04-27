// src/components/views/BacktesterViewV2.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Container, Title, Button, Stack, Group, Paper
} from '@mantine/core';
import {
  IconPlayerPlay, IconDeviceFloppy, IconCalculator
} from '@tabler/icons-react';

import { StaticSettings } from '../StaticSettings';
import { OrderSettings } from '../OrderSettings';
import { EntrySettings } from '../EntrySettings';
import { ExitSettings } from '../ExitSettings';
import { ConnectionAlert } from '../ConnectionAlert';

import { ConfigGeneratorV2 } from '../../services/ConfigGeneratorV2';
import { ValidatorService } from '../../services/ValidatorService';
import { StorageService } from '../../services/StorageService';
import { fetchLimitations } from '../../services/apiService';
import { ConnectionService } from '../../services/ConnectionService';
import { VelesService } from '../../services/VelesService';
import {
  buildSignalProbeFingerprint,
  buildSignalProbePayload,
  normalizeSignalProbeSymbol,
  type SignalProbeRequestType,
  type SignalProbeStoredState,
  type SignalProbeViewState
} from '../../services/SignalProbeService';
import type { BacktestQueueControllerV2, QueueItemV2 } from '../../hooks/useBacktestQueueV2';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, Condition } from '../../types';
import type { SymbolLimitation } from '../../types';
import { makeBatchId } from '../../utils/batchId';
import { parseDateLike, toIsoDateTime } from '../../utils/datePolicy';
import styles from './BacktesterView.module.css';

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

export interface BacktesterV2Props {
  staticConfig: StaticConfig;
  setStaticConfig: (v: StaticConfig) => void;
  entryConfig: EntryConfig;
  setEntryConfig: (v: EntryConfig) => void;
  orderState: OrderState;
  setOrderState: (v: OrderState) => void;
  exitConfig: ExitConfig;
  setExitConfig: (v: ExitConfig) => void;
  onSaveTemplate: () => void;
  onImportSettings: () => void;
  queueController: BacktestQueueControllerV2;
  onOpenLiveResultsModal: (title?: string) => void;
  resumeBatchId?: string | null;
  onResumeHandled?: () => void;
  connectionError?: string | null;
}

interface ComboStats {
  entryCombinations: number;
  orderCombinations: number;
  exitCombinations: number;
  totalCount: number;
  timeString: string;
}

const SECTION_ORDER = ['cfg-static', 'cfg-entry', 'cfg-order', 'cfg-exit', 'cfg-run'] as const;

function calculateStats(entryConfig: EntryConfig, orderState: OrderState, exitConfig: ExitConfig): ComboStats {
  let entryCombinations = 1;
  if (entryConfig.filterSlots.length > 0) {
    entryCombinations = entryConfig.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
  }

  let orderCombinations = 0;
  if (orderState.mode === 'SIMPLE') {
    const s = orderState.simple;
    orderCombinations = s.orders.length * s.martingale.length * s.indent.length * s.overlap.length *
      (s.logarithmicEnabled && s.logarithmicFactor.length ? s.logarithmicFactor.length : 1);
  } else if (orderState.mode === 'CUSTOM') {
    const c = orderState.custom;
    let customComb = 1;
    if (c.orders.length > 0) {
      c.orders.forEach((o) => {
        const variants = o.indent.length || 1;
        customComb *= variants;
      });
    } else {
      customComb = 0;
    }
    orderCombinations = customComb;
  } else {
    orderCombinations = 0;
  }

  let profitCombinations = 1;
  if (exitConfig.profitMode === 'SINGLE') {
    profitCombinations = exitConfig.profitSingle.percents.length || 1;
  } else if (exitConfig.profitMode === 'SIGNAL') {
    const pnl = exitConfig.profitSignal.checkPnl.length || 1;
    let ind = 1;
    if (exitConfig.profitSignal.filterSlots.length > 0) {
      ind = exitConfig.profitSignal.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }
    profitCombinations = pnl * ind;
  }

  let slCombinations = 1;
  if (exitConfig.stopLoss.enabledSimple) {
    slCombinations *= (exitConfig.stopLoss.indent.length || 1);
  }
  if (exitConfig.stopLoss.enabledSignal) {
    const slIndents = exitConfig.stopLoss.conditionalIndent.length || 1;
    let slIndics = 1;
    if (exitConfig.stopLoss.filterSlots.length > 0) {
      slIndics = exitConfig.stopLoss.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }
    slCombinations *= (slIndents * slIndics);
  }

  const exitCombinations = profitCombinations * slCombinations;
  const totalCount = entryCombinations * orderCombinations * exitCombinations;
  const totalSeconds = totalCount * 30;
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  let timeString = '';
  if (d > 0) timeString += `${d} д `;
  if (h > 0) timeString += `${h} ч `;
  if (m > 0) timeString += `${m} мин`;
  if (!timeString) timeString = '~ 30 сек';

  return {
    entryCombinations,
    orderCombinations,
    exitCombinations,
    totalCount,
    timeString: timeString.trim()
  };
}

export function BacktesterViewV2({
  staticConfig,
  setStaticConfig,
  entryConfig,
  setEntryConfig,
  orderState,
  setOrderState,
  exitConfig,
  setExitConfig,
  onSaveTemplate,
  onImportSettings,
  queueController,
  onOpenLiveResultsModal,
  resumeBatchId,
  onResumeHandled,
  connectionError
}: BacktesterV2Props) {
  const { run, resume, isRunning } = queueController;
  const viewRootRef = useRef<HTMLDivElement | null>(null);

  const [activeSection, setActiveSection] = useState<string>('cfg-static');
  const [isSymbolValid, setIsSymbolValid] = useState<boolean | null>(null);
  const [signalProbeStates, setSignalProbeStates] = useState<Record<string, SignalProbeStoredState>>({});

  const makeProbeKey = (scope: string, variantId?: string) => {
    if (!variantId) return null;
    return `${scope}:${variantId}`;
  };

  const resolveSignalProbeState = useCallback(
    (
      scope: string,
      variant: Condition,
      requestType: SignalProbeRequestType
    ): SignalProbeViewState => {
      const key = makeProbeKey(scope, variant.id);
      if (!key) return { status: 'idle' };

      const symbol = String(staticConfig.symbol || '').trim();
      if (!symbol) return { status: 'idle' };

      const fingerprint = buildSignalProbeFingerprint({
        requestType,
        algorithm: staticConfig.algo,
        exchange: staticConfig.exchange,
        symbol,
        condition: variant
      });
      const state = signalProbeStates[key];

      if (!state || state.fingerprint !== fingerprint) {
        return { status: 'idle' };
      }

      if (state.status === 'loading') {
        return { status: 'loading' };
      }

      if (state.status === 'ready' && typeof state.count === 'number') {
        return { status: 'ready', count: state.count };
      }

      return { status: 'error', error: state.error || 'Ошибка запроса' };
    },
    [signalProbeStates, staticConfig.algo, staticConfig.exchange, staticConfig.symbol]
  );

  const markSignalProbeDirty = useCallback((scope: string, variantId: string) => {
    const key = makeProbeKey(scope, variantId);
    if (!key) return;

    setSignalProbeStates((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const requestSignalProbe = useCallback(
    async (
      scope: string,
      variant: Condition,
      requestType: SignalProbeRequestType
    ) => {
      const key = makeProbeKey(scope, variant.id);
      if (!key) return;

      const symbol = normalizeSignalProbeSymbol(String(staticConfig.symbol || '').trim());
      const fingerprint = buildSignalProbeFingerprint({
        requestType,
        algorithm: staticConfig.algo,
        exchange: staticConfig.exchange,
        symbol,
        condition: variant
      });

      setSignalProbeStates((prev) => ({
        ...prev,
        [key]: {
          status: 'loading',
          fingerprint,
          updatedAt: Date.now()
        }
      }));

      if (!symbol) {
        setSignalProbeStates((prev) => {
          const current = prev[key];
          if (!current || current.status !== 'loading' || current.fingerprint !== fingerprint) {
            return prev;
          }
          return {
            ...prev,
            [key]: {
              status: 'error',
              fingerprint,
              error: 'Укажите тикер',
              updatedAt: Date.now()
            }
          };
        });
        return;
      }

      const connection = await ConnectionService.getConnection({ force: true });
      if (!connection.success) {
        const message = ConnectionService.reasonToMessage(connection.reason);
        setSignalProbeStates((prev) => {
          const current = prev[key];
          if (!current || current.status !== 'loading' || current.fingerprint !== fingerprint) {
            return prev;
          }
          return {
            ...prev,
            [key]: {
              status: 'error',
              fingerprint,
              error: message,
              updatedAt: Date.now()
            }
          };
        });
        return;
      }

      const payload = buildSignalProbePayload({
        requestType,
        algorithm: staticConfig.algo,
        exchange: staticConfig.exchange,
        symbol,
        condition: variant
      });
      const response = await VelesService.countEntries(
        connection.connection.tabId,
        connection.connection.token,
        payload
      );

      setSignalProbeStates((prev) => {
        const current = prev[key];
        if (!current || current.status !== 'loading' || current.fingerprint !== fingerprint) {
          return prev;
        }

        if (response.success && typeof response.count === 'number') {
          return {
            ...prev,
            [key]: {
              status: 'ready',
              count: response.count,
              fingerprint,
              updatedAt: Date.now()
            }
          };
        }

        return {
          ...prev,
          [key]: {
            status: 'error',
            fingerprint,
            error: response.error || 'Ошибка проверки сигналов',
            updatedAt: Date.now()
          }
        };
      });
    },
    [staticConfig.algo, staticConfig.exchange, staticConfig.symbol]
  );

  useEffect(() => {
    if (!resumeBatchId) return;
    const batchId = resumeBatchId;
    onResumeHandled?.();
    onOpenLiveResultsModal();
    void resume(batchId);
  }, [resumeBatchId, resume, onResumeHandled, onOpenLiveResultsModal]);

  useEffect(() => {
    const root = viewRootRef.current;
    if (!root) return;

    const nodes = SECTION_ORDER
      .map((id) => root.querySelector<HTMLElement>(`#${id}`))
      .filter((node): node is HTMLElement => node !== null);

    if (nodes.length === 0) return;

    const anchorRatio = 0.22;
    const bottomThresholdPx = 24;
    const hysteresisPx = 36;
    let rafId = 0;

    const pickActiveSection = () => {
      const doc = document.documentElement;
      const nearBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - bottomThresholdPx;
      if (nearBottom) {
        setActiveSection((prev) => (prev === 'cfg-run' ? prev : 'cfg-run'));
        return;
      }

      const anchorAbsY = window.scrollY + (window.innerHeight * anchorRatio);
      const absTopByIndex = (index: number): number =>
        window.scrollY + nodes[index].getBoundingClientRect().top;

      let candidateIndex = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (absTopByIndex(i) <= anchorAbsY) {
          candidateIndex = i;
        } else {
          break;
        }
      }

      setActiveSection((prev) => {
        const prevIndex = nodes.findIndex((node) => node.id === prev);
        const currentIndex = prevIndex >= 0 ? prevIndex : 0;
        if (candidateIndex === currentIndex) return prev;

        if (candidateIndex > currentIndex) {
          const nextIndex = Math.min(currentIndex + 1, nodes.length - 1);
          const nextTop = absTopByIndex(nextIndex);
          if (anchorAbsY < nextTop + hysteresisPx) return prev;
          return nodes[nextIndex].id;
        }

        const prevTop = absTopByIndex(currentIndex);
        if (anchorAbsY > prevTop - hysteresisPx) return prev;
        return nodes[Math.max(0, currentIndex - 1)].id;
      });
    };

    const schedulePick = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        pickActiveSection();
      });
    };

    const observer = new IntersectionObserver(
      () => schedulePick(),
      {
        root: null,
        threshold: [0, 1]
      }
    );

    nodes.forEach((node) => observer.observe(node));
    window.addEventListener('scroll', schedulePick, { passive: true });
    window.addEventListener('resize', schedulePick);
    schedulePick();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedulePick);
      window.removeEventListener('resize', schedulePick);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const stats = useMemo(() => calculateStats(entryConfig, orderState, exitConfig), [entryConfig, orderState, exitConfig]);

  const validation = useMemo(
    () => ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig),
    [staticConfig, entryConfig, orderState, exitConfig]
  );

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

  const stepWarnings = useMemo(() => {
    const symbolWarn = isSymbolValid === false;
    return {
      baseWarn: validation.sections.static || symbolWarn,
      entryWarn: validation.sections.entry,
      orderWarn: validation.sections.order,
      exitWarn: validation.sections.exit,
      runWarn: !validation.valid || symbolWarn
    };
  }, [validation, isSymbolValid]);

  const periodLabel = useMemo(() => {
    const from = parseDateLike(staticConfig.dateFrom);
    const to = parseDateLike(staticConfig.dateTo);
    if (!from || !to) return '-';
    const ms = to.getTime() - from.getTime();
    if (!Number.isFinite(ms)) return '-';
    return `${Math.max(0, Math.floor(ms / 86400000))} д`;
  }, [staticConfig.dateFrom, staticConfig.dateTo]);

  const scrollToSection = (id: string) => {
    const el = viewRootRef.current?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (!el) return;
    setActiveSection(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleValidateData = async () => {
    if (!validation.valid) {
      alert(`Ошибка валидации:\n${validation.error}`);
      return;
    }

    try {
      const limitations = await fetchLimitations(staticConfig.exchange);
      const hasSymbol = hasSymbolInLimitations(limitations, staticConfig.symbol);
      if (!hasSymbol) {
        alert('Ошибка валидации: монета не найдена в выбранной бирже Veles. Проверьте тикер.');
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Ошибка валидации: не удалось проверить ограничения биржи (${message}).`);
      return;
    }

    alert('Валидация пройдена: параметры заполнены корректно.');
  };

  const handleRunTests = useCallback(async () => {
    if (!validation.valid) {
      alert(`Ошибка валидации:\n${validation.error}`);
      return;
    }

    try {
      const limitations = await fetchLimitations(staticConfig.exchange);
      const hasSymbol = hasSymbolInLimitations(limitations, staticConfig.symbol);

      if (!hasSymbol) {
        alert('Ошибка валидации: монета не найдена в выбранной бирже Veles. Проверьте тикер.');
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Ошибка валидации: не удалось проверить ограничения биржи (${message}).`);
      return;
    }
    const namePrefix = staticConfig.namePrefix || 'Test';
    const batchId = makeBatchId();

    const { configs } = ConfigGeneratorV2.generate(staticConfig, entryConfig, orderState, exitConfig, '#TEMP');
    if (configs.length === 0) {
      alert('Ошибка: не сгенерировано ни одной конфигурации.');
      return;
    }

    const confirmed = window.confirm(`Сгенерировано тестов: ${configs.length}.\n\nЗапустить выполнение?`);
    if (!confirmed) return;

    const queueItems: QueueItemV2[] = configs.map((cfg) => {
      const realName = cfg.name.replace('#TEMP', batchId);
      return {
        id: crypto.randomUUID(),
        config: { ...cfg, name: realName },
        status: 'PENDING'
      };
    });

    const parsedFromIso = toIsoDateTime(parseDateLike(staticConfig.dateFrom as unknown as Date | string | number));
    const parsedToIso = toIsoDateTime(parseDateLike(staticConfig.dateTo as unknown as Date | string | number));
    if (!parsedFromIso || !parsedToIso) {
      alert('Ошибка валидации: некорректная дата начала или окончания теста.');
      return;
    }

    await StorageService.saveBatch({
      id: batchId,
      timestamp: Date.now(),
      apiVersion: 'v2',
      namePrefix,
      symbol: staticConfig.symbol,
      exchange: staticConfig.exchange,
      totalTests: configs.length,
      velesIds: [],
      mode: 'CONFIGURATOR',
      resumeSource: {
        staticConfig: {
          ...staticConfig,
          dateFrom: parsedFromIso,
          dateTo: parsedToIso
        },
        entryConfig,
        orderState,
        exitConfig
      }
    });

    onOpenLiveResultsModal(`${namePrefix} (${batchId})`);
    run(batchId, queueItems);
  }, [staticConfig, entryConfig, orderState, exitConfig, run, onOpenLiveResultsModal, validation, isSymbolValid]);

  return (
    <Container ref={viewRootRef} size="xl" py="xl" pb={100} className={styles.viewRoot}>
      <div className={styles.topbar}>
        <Title order={2} ta="center">Конфигуратор 2.0</Title>
      </div>

      {connectionError && (
        <Paper withBorder p="sm" radius="md" className={`ui-card ${styles.sectionGlass}`}>
          <ConnectionAlert visible />
        </Paper>
      )}

      <div className={styles.layout}>
        <div>
          <Stack gap="xl" className={styles.sectionsStack}>
            <div id="cfg-static" className={styles.sectionGlass}>
              <StaticSettings config={staticConfig} onChange={setStaticConfig} />
            </div>
            <div id="cfg-entry" className={styles.sectionGlass}>
              <EntrySettings
                config={entryConfig}
                onChange={setEntryConfig}
                probeScope="entry"
                resolveSignalProbeState={resolveSignalProbeState}
                onSignalProbeRequest={requestSignalProbe}
                onSignalProbeDirty={markSignalProbeDirty}
              />
            </div>
            <div id="cfg-order" className={styles.sectionGlass}>
              <OrderSettings state={orderState} onChange={setOrderState} hiddenModes={['SIGNAL']} />
            </div>
            <div id="cfg-exit" className={styles.sectionGlass}>
              <ExitSettings
                config={exitConfig}
                onChange={setExitConfig}
                resolveSignalProbeState={resolveSignalProbeState}
                onSignalProbeRequest={requestSignalProbe}
                onSignalProbeDirty={markSignalProbeDirty}
                hiddenProfitModes={['MULTIPLE']}
                stopLossHideSignalMode
              />
            </div>

            <div id="cfg-run" className={styles.sectionGlass}>
              <Group grow className={styles.runButtons}>
                <Button
                  size="md"
                  color="blue"
                  variant="light"
                  leftSection={<IconCalculator size={20} />}
                  onClick={handleValidateData}
                  disabled={isRunning}
                >
                  Валидация данных
                </Button>

                {!isRunning ? (
                  <Button
                    size="md"
                    color="green"
                    leftSection={<IconPlayerPlay size={20} />}
                    onClick={handleRunTests}
                  >
                    Запустить бектесты
                  </Button>
                ) : (
                  <Button
                    size="md"
                    color="red"
                    onClick={() => queueController.stop()}
                  >
                    Остановить
                  </Button>
                )}
              </Group>
            </div>
          </Stack>
        </div>

        <aside className={styles.sideColumn}>
          <div className={styles.sideCard}>
            <Stack gap="xs">
              <Button variant="default" fullWidth onClick={onImportSettings}>Импорт настроек</Button>
              <Button
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={onSaveTemplate}
                disabled={isRunning}
                fullWidth
              >
                Сохранить шаблон
              </Button>
            </Stack>
          </div>

          <div className={styles.sideCard}>
            <div className={styles.sideTitle}>Шаги</div>
            <div className={styles.stepsTable}>
              <button type="button" onClick={() => scrollToSection('cfg-static')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-static' ? styles.stepActive : ''} ${stepWarnings.baseWarn ? styles.stepWarn : ''}`}>
                <span>Базовые настройки</span>
                {stepWarnings.baseWarn && <span className={styles.warnBadge}>!</span>}
              </button>
              <button type="button" onClick={() => scrollToSection('cfg-entry')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-entry' ? styles.stepActive : ''} ${stepWarnings.entryWarn ? styles.stepWarn : ''}`}>
                <span>Условия открытия сделки</span>
                {stepWarnings.entryWarn && <span className={styles.warnBadge}>!</span>}
              </button>
              <button type="button" onClick={() => scrollToSection('cfg-order')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-order' ? styles.stepActive : ''} ${stepWarnings.orderWarn ? styles.stepWarn : ''}`}>
                <span>Ордера сделки</span>
                {stepWarnings.orderWarn && <span className={styles.warnBadge}>!</span>}
              </button>
              <button type="button" onClick={() => scrollToSection('cfg-exit')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-exit' ? styles.stepActive : ''} ${stepWarnings.exitWarn ? styles.stepWarn : ''}`}>
                <span>Выход из сделки</span>
                {stepWarnings.exitWarn && <span className={styles.warnBadge}>!</span>}
              </button>
              <button type="button" onClick={() => scrollToSection('cfg-run')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-run' ? styles.stepActive : ''} ${stepWarnings.runWarn ? styles.stepWarn : ''}`}>
                <span>Запуск бектестов</span>
                {stepWarnings.runWarn && <span className={styles.warnBadge}>!</span>}
              </button>
            </div>
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
              <div className={styles.kv}><span>Комбинаций входа</span><strong>{stats.entryCombinations}</strong></div>
              <div className={styles.kv}><span>Комбинаций сетки</span><strong>{stats.orderCombinations}</strong></div>
              <div className={styles.kv}><span>Комбинаций выхода</span><strong>{stats.exitCombinations}</strong></div>
              <div className={styles.kv}><span>Всего комбинаций</span><strong>{stats.totalCount}</strong></div>
              <div className={styles.kv}><span>Время теста</span><strong>{stats.timeString}</strong></div>
            </div>

            <div className={styles.summaryBlock}>
              <div className={styles.kv}><span>API версия</span><strong>V2</strong></div>
            </div>
          </div>
        </aside>
      </div>

    </Container>
  );
}
