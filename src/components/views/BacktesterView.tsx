// src/components/views/BacktesterView.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  Container, Title, Button, Stack, Group, Paper
} from '@mantine/core';
import {
  IconPlayerPlay, IconDeviceFloppy, IconList, IconCalculator, IconPlayerStop
} from '@tabler/icons-react';

import { StaticSettings } from '../StaticSettings';
import { OrderSettings } from '../OrderSettings';
import { EntrySettings } from '../EntrySettings';
import { ExitSettings } from '../ExitSettings';
import { ConnectionAlert } from '../ConnectionAlert';

import { ConfigGenerator } from '../../services/ConfigGenerator';
import { ValidatorService } from '../../services/ValidatorService';
import { StorageService } from '../../services/StorageService';
import { fetchLimitations } from '../../services/apiService';
import type { BacktestQueueController, QueueItem } from '../../hooks/useBacktestQueue';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, SymbolLimitation } from '../../types';
import { makeBatchId } from '../../utils/batchId';
import styles from './BacktesterView.module.css';

export interface BacktesterProps {
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
  queueController: BacktestQueueController;
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
    let sigComb = orderState.signal.baseOrder.indent.length || 1;
    orderState.signal.orders.forEach((o) => {
      let filterComb = 1;
      if (o.filterSlots?.length > 0) {
        filterComb = o.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
      }
      sigComb *= ((o.indent.length || 1) * filterComb);
    });
    orderCombinations = sigComb;
  }

  let profitCombinations = 1;
  if (exitConfig.profitMode === 'SINGLE') {
    profitCombinations = exitConfig.profitSingle.percents.length || 1;
  } else if (exitConfig.profitMode === 'MULTIPLE') {
    if (exitConfig.profitMultiple.orders.length > 0) {
      exitConfig.profitMultiple.orders.forEach((o) => {
        profitCombinations *= (o.indent.length || 1);
      });
    }
  } else if (exitConfig.profitMode === 'SIGNAL') {
    const pnl = exitConfig.profitSignal.checkPnl.length || 1;
    let ind = 1;
    if (exitConfig.profitSignal.filterSlots.length > 0) {
      ind = exitConfig.profitSignal.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }
    profitCombinations = pnl * ind;
  }

  let slCombinations = 1;
  if (exitConfig.stopLoss.enabledSimple) slCombinations *= (exitConfig.stopLoss.indent.length || 1);
  if (exitConfig.stopLoss.enabledSignal) {
    const slIndents = exitConfig.stopLoss.conditionalIndent.length || 1;
    let slIndics = 1;
    if (exitConfig.stopLoss.filterSlots.length > 0) {
      slIndics = exitConfig.stopLoss.filterSlots.reduce((acc, slot) => acc * (slot.variants.length || 1), 1);
    }
    slCombinations *= (slIndents * slIndics);
  }

  const exitCombinations = profitCombinations * slCombinations;
  const totalCount = orderCombinations * entryCombinations * exitCombinations;
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
      itemId === searchNoSlash ||
      itemSym.startsWith(`${search}/`)
    );
  });
}

export function BacktesterView({
  staticConfig, setStaticConfig,
  entryConfig, setEntryConfig,
  orderState, setOrderState,
  exitConfig, setExitConfig,
  onSaveTemplate,
  onImportSettings,
  queueController,
  onOpenLiveResultsModal,
  resumeBatchId,
  onResumeHandled,
  connectionError
}: BacktesterProps) {
  const sectionOrder = ['cfg-static', 'cfg-entry', 'cfg-order', 'cfg-exit', 'cfg-run'] as const;

  const {
    run, resume, stop,
    isRunning, progress
  } = queueController;

  const [activeSection, setActiveSection] = useState<string>('cfg-static');
  const [isSymbolValid, setIsSymbolValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!resumeBatchId) return;
    const batchId = resumeBatchId;
    onResumeHandled?.();
    onOpenLiveResultsModal();
    void resume(batchId);
  }, [resumeBatchId, resume, onResumeHandled, onOpenLiveResultsModal]);

  useEffect(() => {
    const nodes = sectionOrder
      .map((id) => document.getElementById(id))
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

  const stats = useMemo(
    () => calculateStats(entryConfig, orderState, exitConfig),
    [entryConfig, orderState, exitConfig]
  );

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

  const periodLabel = useMemo(() => {
    const from = new Date(staticConfig.dateFrom);
    const to = new Date(staticConfig.dateTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '-';
    const ms = to.getTime() - from.getTime();
    if (!Number.isFinite(ms)) return '-';
    return `${Math.max(0, Math.floor(ms / 86400000))} д`;
  }, [staticConfig.dateFrom, staticConfig.dateTo]);

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

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
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

  const handleRunTests = async () => {
    if (!validation.valid) {
      alert(`❌ Ошибка валидации:\n${validation.error}`);
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

    const batchId = makeBatchId();
    const namePrefix = staticConfig.namePrefix || 'Backtest';

    const { configs } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig, '#TEMP');
    if (configs.length === 0) {
      alert('Ошибка: не сгенерировано ни одной конфигурации.');
      return;
    }

    const confirmed = window.confirm(`Сгенерировано тестов: ${configs.length}.\n\nЗапустить выполнение?`);
    if (!confirmed) return;

    const queueItems: QueueItem[] = configs.map((cfg) => {
      const realName = cfg.name.replace('#TEMP', batchId);
      return {
        id: crypto.randomUUID(),
        config: { ...cfg, name: realName },
        status: 'PENDING'
      };
    });

    await StorageService.saveBatch({
      id: batchId,
      timestamp: Date.now(),
      namePrefix,
      symbol: staticConfig.symbol,
      exchange: staticConfig.exchange,
      totalTests: configs.length,
      velesIds: [],
      mode: 'CONFIGURATOR',
      resumeSource: {
        staticConfig: {
          ...staticConfig,
          dateFrom: staticConfig.dateFrom.toISOString(),
          dateTo: staticConfig.dateTo.toISOString()
        },
        entryConfig,
        orderState,
        exitConfig
      }
    });

    onOpenLiveResultsModal(`${namePrefix} (${batchId})`);
    run(batchId, queueItems);
  };

  return (
    <Container size="xl" py="xl" pb={100} className={styles.viewRoot}>
      <div className={styles.topbar}>
        <Title order={2} ta="center">Конфигуратор</Title>
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
              <EntrySettings config={entryConfig} onChange={setEntryConfig} />
            </div>
            <div id="cfg-order" className={styles.sectionGlass}>
              <OrderSettings state={orderState} onChange={setOrderState} />
            </div>
            <div id="cfg-exit" className={styles.sectionGlass}>
              <ExitSettings config={exitConfig} onChange={setExitConfig} />
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
                    color="blue"
                    leftSection={<IconList size={20} />}
                    onClick={() => onOpenLiveResultsModal()}
                  >
                    Открыть таблицу (Запущено...)
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
          </div>
        </aside>
      </div>

    </Container>
  );
}
