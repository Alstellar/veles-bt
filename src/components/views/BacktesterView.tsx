// src/components/views/BacktesterView.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container, Title, Button, Stack, Group, Paper, Modal, ScrollArea, Code, Text
} from '@mantine/core';
import {
  IconPlayerPlay, IconDeviceFloppy, IconList, IconCalculator, IconPlayerStop, IconBug
} from '@tabler/icons-react';

import { StaticSettings } from '../StaticSettings';
import { BacktestVersionSettings } from '../BacktestVersionSettings';
import { OrderSettings } from '../OrderSettings';
import { EntrySettings } from '../EntrySettings';
import { ExitSettings } from '../ExitSettings';
import { ConnectionAlert } from '../ConnectionAlert';

import { ConfigGenerator } from '../../services/ConfigGenerator';
import { ConfigGeneratorV2 } from '../../services/ConfigGeneratorV2';
import { ValidatorService } from '../../services/ValidatorService';
import { StorageService } from '../../services/StorageService';
import { LogService } from '../../services/LogService';
import { fetchAvailability, fetchLimitations } from '../../services/apiService';
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
import type { BacktestQueueController, QueueItem } from '../../hooks/useBacktestQueue';
import type { BacktestQueueControllerV2, QueueItemV2 } from '../../hooks/useBacktestQueueV2';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig, SymbolAvailability, SymbolLimitation, Condition, BacktestVersion } from '../../types';
import { generateCustomVolumeDistributions } from '../../utils/customOrderVolumes';
import { isSpot } from '../../types';
import { makeBatchId } from '../../utils/batchId';
import { parseDateLike, toIsoDateTime } from '../../utils/datePolicy';
import { debug_mode } from '../../config/backtestQueue';
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
  queueControllerV2: BacktestQueueControllerV2;
  backtestVersion: BacktestVersion;
  onBacktestVersionChange: (version: BacktestVersion) => void;
  testQueue: number;
  onTestQueueChange: (queue: number) => void;
  testIntervalSeconds: number;
  onTestIntervalChange: (seconds: number) => void;
  onOpenLiveResultsModal: (title?: string, version?: BacktestVersion, batchId?: string | null) => void;
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

interface DebugRandomConfigState {
  total: number;
  index: number;
  symbol: string;
  version: BacktestVersion;
  payload: unknown;
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
      if (c.volumeMode === 'RANGE' || c.volumeMode === 'LIST') {
        const volumeVariants = generateCustomVolumeDistributions(c.orders, c.volumeMode).distributions.length;
        customComb *= volumeVariants;
      }
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
    if (orderState.signal.volumeMode === 'RANGE' || orderState.signal.volumeMode === 'LIST') {
      const volumeVariants = generateCustomVolumeDistributions(
        [orderState.signal.baseOrder, ...orderState.signal.orders],
        orderState.signal.volumeMode
      ).distributions.length;
      sigComb *= volumeVariants;
    }
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
      if (exitConfig.profitMultiple.volumeMode === 'RANGE' || exitConfig.profitMultiple.volumeMode === 'LIST') {
        const volumeVariants = generateCustomVolumeDistributions(
          exitConfig.profitMultiple.orders,
          exitConfig.profitMultiple.volumeMode
        ).distributions.length;
        profitCombinations *= volumeVariants;
      }
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

function normalizeBaseSymbol(value: string): string {
  return value.replace('/USDT', '').trim().toUpperCase();
}

function getConfiguredSymbols(staticConfig: StaticConfig): string[] {
  const selected = Array.isArray(staticConfig.selectedSymbols)
    ? staticConfig.selectedSymbols.map((item) => normalizeBaseSymbol(String(item))).filter((item) => item.length > 0)
    : [];
  if (selected.length > 0) return Array.from(new Set(selected));
  const single = normalizeBaseSymbol(staticConfig.symbol || '');
  return single ? [single] : [];
}

function resolveLimitationBySymbol(limitations: SymbolLimitation[], userSymbol: string): SymbolLimitation | null {
  const search = normalizeBaseSymbol(userSymbol);
  const withSlash = `${search}/USDT`;
  const noSlash = `${search}USDT`;
  return limitations.find((item) => {
    const itemSym = item.symbol.toUpperCase();
    const itemId = item.externalId ? item.externalId.toUpperCase() : '';
    return itemSym === search || itemSym === withSlash || itemId === noSlash || itemSym.startsWith(`${search}/`);
  }) ?? null;
}

function resolveAvailabilityBySymbol(availabilities: SymbolAvailability[], userSymbol: string): SymbolAvailability | null {
  const search = normalizeBaseSymbol(userSymbol);
  const withSlash = `${search}/USDT`;
  const noSlash = `${search}USDT`;
  return availabilities.find((item) => {
    const itemSym = item.symbol.toUpperCase();
    return itemSym === search || itemSym === withSlash || itemSym === noSlash || itemSym.startsWith(`${search}/`);
  }) ?? null;
}

function resolveDateFromBySymbol(
  staticConfig: StaticConfig,
  symbol: string,
  availabilities: SymbolAvailability[]
): { dateFrom: Date | null; skipped: boolean } {
  const base = normalizeBaseSymbol(symbol);
  const configuredFrom = parseDateLike(staticConfig.dateFrom as unknown as Date | string | number);
  const configuredTo = parseDateLike(staticConfig.dateTo as unknown as Date | string | number);
  if (!configuredFrom || !configuredTo) return { dateFrom: null, skipped: true };

  const savedFromIso = staticConfig.dateFromBySymbol?.[base] ?? (
    staticConfig.wholePeriodMode ? staticConfig.wholePeriodFromBySymbol?.[base] : undefined
  );
  const savedFrom = parseDateLike(savedFromIso);
  const availability = resolveAvailabilityBySymbol(availabilities, base);
  const availableFrom = parseDateLike(availability?.availableFrom);

  let dateFrom = staticConfig.wholePeriodMode
    ? (savedFrom ?? availableFrom)
    : (savedFrom ?? configuredFrom);

  if (!dateFrom) return { dateFrom: null, skipped: true };
  if (!staticConfig.wholePeriodMode && availableFrom && availableFrom.getTime() > dateFrom.getTime()) {
    dateFrom = availableFrom;
  }
  if (dateFrom.getTime() > configuredTo.getTime()) {
    return { dateFrom, skipped: true };
  }

  return { dateFrom, skipped: false };
}

function collectRunnableSymbols(staticConfig: StaticConfig, limitations: SymbolLimitation[]) {
  const configured = getConfiguredSymbols(staticConfig);
  const invalid: string[] = [];
  const leverageMismatch: string[] = [];
  const runnable: string[] = [];
  const spotExchange = isSpot(staticConfig.exchange);

  configured.forEach((symbol) => {
    const limitation = resolveLimitationBySymbol(limitations, symbol);
    if (!limitation) {
      invalid.push(symbol);
      return;
    }

    if (!spotExchange && typeof limitation.leverage === 'number' && staticConfig.leverage > limitation.leverage) {
      leverageMismatch.push(symbol);
      return;
    }

    runnable.push(symbol);
  });

  return { configured, invalid, leverageMismatch, runnable };
}

function makeProbeKey(scope: string, variantId?: string): string | null {
  if (!variantId) return null;
  return `${scope}:${variantId}`;
}

export function BacktesterView({
  staticConfig, setStaticConfig,
  entryConfig, setEntryConfig,
  orderState, setOrderState,
  exitConfig, setExitConfig,
  onSaveTemplate,
  onImportSettings,
  queueController,
  queueControllerV2,
  backtestVersion,
  onBacktestVersionChange,
  testQueue,
  onTestQueueChange,
  testIntervalSeconds,
  onTestIntervalChange,
  onOpenLiveResultsModal,
  resumeBatchId,
  onResumeHandled,
  connectionError
}: BacktesterProps) {
  const sectionOrder = ['cfg-static', 'cfg-backtest', 'cfg-entry', 'cfg-order', 'cfg-exit', 'cfg-run'] as const;

  const activeQueueController = backtestVersion === 'v2' ? queueControllerV2 : queueController;
  const activeBatchId = backtestVersion === 'v2'
    ? queueControllerV2.currentBatchId
    : queueController.currentBatchId;
  const {
    stop,
    isRunning, progress
  } = activeQueueController;

  const [activeSection, setActiveSection] = useState<string>('cfg-static');
  const [isSymbolValid, setIsSymbolValid] = useState<boolean | null>(null);
  const [signalProbeStates, setSignalProbeStates] = useState<Record<string, SignalProbeStoredState>>({});
  const [debugRandomConfig, setDebugRandomConfig] = useState<DebugRandomConfigState | null>(null);
  const [debugRandomConfigOpened, setDebugRandomConfigOpened] = useState(false);

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
              fingerprint,
              count: response.count,
              updatedAt: Date.now()
            }
          };
        }

        return {
          ...prev,
          [key]: {
            status: 'error',
            fingerprint,
            error: response.error || 'Не удалось получить количество сигналов',
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
    void (async () => {
      try {
        const runtime = await StorageService.getBatchRuntime(batchId);
        const batch = await StorageService.getBatchById(batchId);
        const targetVersion: BacktestVersion =
          runtime?.backtestVersion ??
          batch?.backtestVersion ??
          (runtime?.apiVersion === 'v2' || batch?.apiVersion === 'v2' ? 'v2' : 'v1');
        await LogService.info('configurator', 'run.resume_requested', {
          batchId,
          targetVersion,
          hasRuntime: Boolean(runtime),
          hasBatch: Boolean(batch)
        }, batchId);
        onBacktestVersionChange(targetVersion);
        onOpenLiveResultsModal(undefined, targetVersion, batchId);
        if (targetVersion === 'v2') {
          await queueControllerV2.resume(batchId);
          return;
        }
        await queueController.resume(batchId);
      } catch (error) {
        await LogService.captureError(error, {
          source: 'configurator',
          event: 'run.resume_failed',
          context: { batchId }
        });
      }
    })();
  }, [resumeBatchId, onResumeHandled, onOpenLiveResultsModal, onBacktestVersionChange, queueController, queueControllerV2]);

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
  const configuredSymbols = useMemo(
    () => getConfiguredSymbols(staticConfig),
    [staticConfig.symbol, staticConfig.selectedSymbols]
  );
  const symbolsCount = Math.max(1, configuredSymbols.length);
  const effectiveTotalTests = stats.totalCount * symbolsCount;
  const effectiveTimeString = useMemo(() => {
    const totalSeconds = effectiveTotalTests * 30;
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    let timeString = '';
    if (d > 0) timeString += `${d} д `;
    if (h > 0) timeString += `${h} ч `;
    if (m > 0) timeString += `${m} мин`;
    if (!timeString) timeString = '~ 30 сек';
    return timeString.trim();
  }, [effectiveTotalTests]);

  const validation = useMemo(
    () => ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig),
    [staticConfig, entryConfig, orderState, exitConfig]
  );

  useEffect(() => {
    let cancelled = false;
    if (configuredSymbols.length === 0 || !staticConfig.exchange) {
      setIsSymbolValid(null);
      return;
    }

    const validateSymbol = async () => {
      try {
        const limitations = await fetchLimitations(staticConfig.exchange);
        const valid = configuredSymbols.every((symbol) => hasSymbolInLimitations(limitations, symbol));
        if (!cancelled) setIsSymbolValid(valid);
      } catch {
        if (!cancelled) setIsSymbolValid(null);
      }
    };

    void validateSymbol();
    return () => {
      cancelled = true;
    };
  }, [staticConfig.exchange, configuredSymbols]);

  const periodLabel = useMemo(() => {
    const from = parseDateLike(staticConfig.dateFrom);
    const to = parseDateLike(staticConfig.dateTo);
    if (!from || !to) return '-';
    const ms = to.getTime() - from.getTime();
    if (!Number.isFinite(ms)) return '-';
    return `${Math.max(0, Math.floor(ms / 86400000))} д`;
  }, [staticConfig.dateFrom, staticConfig.dateTo]);

  const stepWarnings = useMemo(() => {
    const symbolWarn = isSymbolValid === false;
    return {
      baseWarn: validation.sections.static || symbolWarn,
      backtestWarn: false,
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

  const handleShowRandomConfig = () => {
    if (!validation.valid) {
      alert(`Ошибка валидации:\n${validation.error}`);
      return;
    }

    const symbols = configuredSymbols.length > 0
      ? configuredSymbols
      : [String(staticConfig.symbol || '').trim()].filter(Boolean);
    if (symbols.length === 0) {
      alert('Ошибка: не выбран актив для генерации случайного конфига.');
      return;
    }

    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const staticConfigForSymbol: StaticConfig = {
      ...staticConfig,
      symbol,
      selectedSymbols: [symbol]
    };
    const generated = backtestVersion === 'v2'
      ? ConfigGeneratorV2.generate(staticConfigForSymbol, entryConfig, orderState, exitConfig, '#DEBUG')
      : ConfigGenerator.generate(staticConfigForSymbol, entryConfig, orderState, exitConfig, '#DEBUG');

    if (generated.configs.length === 0) {
      alert('Ошибка: не сгенерировано ни одной конфигурации.');
      return;
    }

    const index = Math.floor(Math.random() * generated.configs.length);
    setDebugRandomConfig({
      total: generated.configs.length,
      index: index + 1,
      symbol,
      version: backtestVersion,
      payload: generated.configs[index]
    });
    setDebugRandomConfigOpened(true);
  };

  const handleValidateData = async () => {
    if (!validation.valid) {
      alert(`Ошибка валидации:\n${validation.error}`);
      return;
    }

    try {
      const limitations = await fetchLimitations(staticConfig.exchange);
      const symbolCheck = collectRunnableSymbols(staticConfig, limitations);
      if (symbolCheck.configured.length === 0) {
        alert('Ошибка валидации: не выбраны активы для запуска.');
        return;
      }

      if (symbolCheck.invalid.length > 0 || symbolCheck.leverageMismatch.length > 0) {
        const parts: string[] = [];
        if (symbolCheck.invalid.length > 0) {
          parts.push(`Не найдены на бирже: ${symbolCheck.invalid.join(', ')}`);
        }
        if (symbolCheck.leverageMismatch.length > 0) {
          parts.push(`Плечо выше максимального: ${symbolCheck.leverageMismatch.join(', ')}`);
        }
        alert(`Ошибка валидации:\n${parts.join('\n')}`);
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

    let symbolsToRun: string[] = [];
    let skippedSymbols: string[] = [];
    const dateSkippedSymbols: string[] = [];
    const dateFromBySymbol: Record<string, string> = {};
    try {
      const [limitations, availabilities] = await Promise.all([
        fetchLimitations(staticConfig.exchange),
        fetchAvailability(staticConfig.exchange).catch(() => [])
      ]);
      const symbolCheck = collectRunnableSymbols(staticConfig, limitations);
      if (symbolCheck.configured.length === 0) {
        alert('Ошибка валидации: не выбраны активы для запуска.');
        return;
      }
      skippedSymbols = [...symbolCheck.invalid, ...symbolCheck.leverageMismatch];
      const runnableByDate = symbolCheck.runnable.filter((symbol) => {
        const period = resolveDateFromBySymbol(staticConfig, symbol, availabilities);
        if (period.skipped || !period.dateFrom) {
          dateSkippedSymbols.push(symbol);
          return false;
        }

        dateFromBySymbol[normalizeBaseSymbol(symbol)] = period.dateFrom.toISOString();
        return true;
      });
      symbolsToRun = runnableByDate;
      if (symbolsToRun.length === 0) {
        const parts: string[] = [];
        if (symbolCheck.invalid.length > 0) parts.push(`Не найдены на бирже: ${symbolCheck.invalid.join(', ')}`);
        if (symbolCheck.leverageMismatch.length > 0) parts.push(`Плечо выше максимального: ${symbolCheck.leverageMismatch.join(', ')}`);
        if (dateSkippedSymbols.length > 0) parts.push(`Нет доступного периода истории: ${dateSkippedSymbols.join(', ')}`);
        alert(`Запуск невозможен:\n${parts.join('\n')}`);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Ошибка валидации: не удалось проверить ограничения биржи (${message}).`);
      return;
    }

    try {
      const batchId = makeBatchId();
      const namePrefix = staticConfig.namePrefix || 'Backtest';

      const configs = symbolsToRun.flatMap((symbol) => {
        const symbolDateFrom = parseDateLike(dateFromBySymbol[normalizeBaseSymbol(symbol)]) ?? staticConfig.dateFrom;
        const staticConfigForSymbol: StaticConfig = {
          ...staticConfig,
          symbol,
          selectedSymbols: [symbol],
          dateFrom: symbolDateFrom,
          dateFromBySymbol
        };
        const generated = backtestVersion === 'v2'
          ? ConfigGeneratorV2.generate(staticConfigForSymbol, entryConfig, orderState, exitConfig, '#TEMP')
          : ConfigGenerator.generate(staticConfigForSymbol, entryConfig, orderState, exitConfig, '#TEMP');
        return generated.configs;
      });
      if (configs.length === 0) {
        alert('Ошибка: не сгенерировано ни одной конфигурации.');
        return;
      }

      const skippedSuffix = skippedSymbols.length > 0
        ? `\nПропущено активов: ${skippedSymbols.length} (${skippedSymbols.join(', ')})`
        : '';
      const dateSkippedSuffix = dateSkippedSymbols.length > 0
        ? `\nПропущено по периоду истории: ${dateSkippedSymbols.length} (${dateSkippedSymbols.join(', ')})`
        : '';
      const confirmed = window.confirm(`Сгенерировано тестов: ${configs.length}.\nАктивов к запуску: ${symbolsToRun.length}.${skippedSuffix}${dateSkippedSuffix}\n\nЗапустить выполнение?`);
      if (!confirmed) return;

      const queueItems = configs.map((cfg) => {
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
        backtestVersion,
        apiVersion: backtestVersion === 'v2' ? 'v2' : 'v1',
        namePrefix,
        symbol: symbolsToRun.length > 1
          ? `${symbolsToRun[0]} +${symbolsToRun.length - 1}`
          : symbolsToRun[0],
        exchange: staticConfig.exchange,
        totalTests: configs.length,
        velesIds: [],
        mode: 'CONFIGURATOR',
        resumeSource: {
          staticConfig: {
            ...staticConfig,
            symbol: symbolsToRun[0],
            selectedSymbols: symbolsToRun,
            dateFromBySymbol,
            wholePeriodFromBySymbol: staticConfig.wholePeriodMode ? dateFromBySymbol : staticConfig.wholePeriodFromBySymbol,
            dateFrom: parsedFromIso,
            dateTo: parsedToIso
          },
          entryConfig,
          orderState,
          exitConfig
        }
      });

      const snapshotId = await LogService.createSnapshot('configurator.run_input', {
        batchId,
        namePrefix,
        mode: 'CONFIGURATOR',
        backtestVersion,
        apiVersion: backtestVersion === 'v2' ? 'v2' : 'v1',
        testQueue,
        testIntervalSeconds,
        totalGenerated: configs.length,
        requestedSymbols: configuredSymbols,
        runnableSymbols: symbolsToRun,
        skippedSymbols,
        staticConfig: {
          ...staticConfig,
          symbol: symbolsToRun[0],
          selectedSymbols: symbolsToRun,
          dateFromBySymbol,
          wholePeriodFromBySymbol: staticConfig.wholePeriodMode ? dateFromBySymbol : staticConfig.wholePeriodFromBySymbol,
          dateFrom: parsedFromIso,
          dateTo: parsedToIso
        },
        entryConfig,
        orderState,
        exitConfig
      }, { batchId, runId: batchId });
      await LogService.log({
        level: 'info',
        source: 'configurator',
        event: 'run.prepared',
        batchId,
        runId: batchId,
        stage: 'prepare',
        code: 'RUN_PREPARED',
        snapshotId,
        context: {
          totalTests: configs.length,
          symbolsCount: symbolsToRun.length,
          backtestVersion,
          testQueue,
          testIntervalSeconds
        }
      });

      onOpenLiveResultsModal(`${namePrefix} (${batchId})`, backtestVersion, batchId);
      if (backtestVersion === 'v2') {
        queueControllerV2.run(batchId, queueItems as QueueItemV2[]);
        return;
      }
      queueController.run(batchId, queueItems as QueueItem[]);
    } catch (error) {
      await LogService.captureError(error, {
        source: 'configurator',
        event: 'run.start_failed',
        context: {
          backtestVersion,
          testQueue,
          testIntervalSeconds
        }
      });
      const message = error instanceof Error ? error.message : String(error);
      alert(`Не удалось запустить бектесты: ${message}`);
    }
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
              <StaticSettings config={staticConfig} onChange={setStaticConfig} multiSymbolMode />
            </div>
            <div id="cfg-backtest" className={styles.sectionGlass}>
              <BacktestVersionSettings
                backtestVersion={backtestVersion}
                onBacktestVersionChange={onBacktestVersionChange}
                testQueue={testQueue}
                onTestQueueChange={onTestQueueChange}
                testIntervalSeconds={testIntervalSeconds}
                onTestIntervalChange={onTestIntervalChange}
              />
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
              <OrderSettings
                state={orderState}
                onChange={setOrderState}
                hiddenModes={[]}
                resolveSignalProbeState={resolveSignalProbeState}
                onSignalProbeRequest={requestSignalProbe}
                onSignalProbeDirty={markSignalProbeDirty}
              />
            </div>
            <div id="cfg-exit" className={styles.sectionGlass}>
              <ExitSettings
                config={exitConfig}
                onChange={setExitConfig}
                hiddenProfitModes={[]}
                stopLossHideSignalMode={false}
                resolveSignalProbeState={resolveSignalProbeState}
                onSignalProbeRequest={requestSignalProbe}
                onSignalProbeDirty={markSignalProbeDirty}
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
                    color="blue"
                    leftSection={<IconList size={20} />}
                    onClick={() => onOpenLiveResultsModal(undefined, backtestVersion, activeBatchId ?? null)}
                  >
                    Открыть таблицу (Запущено...)
                  </Button>
                )}
              </Group>

              {debug_mode && (
                <Button
                  size="md"
                  color="grape"
                  variant="light"
                  fullWidth
                  leftSection={<IconBug size={18} />}
                  onClick={handleShowRandomConfig}
                  disabled={isRunning}
                  mt="sm"
                >
                  Рандомный конфиг
                </Button>
              )}

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
              <button type="button" onClick={() => scrollToSection('cfg-backtest')} className={`${styles.stepButton} ${styles.stepRow} ${activeSection === 'cfg-backtest' ? styles.stepActive : ''} ${stepWarnings.backtestWarn ? styles.stepWarn : ''}`}>
                <span>Режим бектестов</span>
                {stepWarnings.backtestWarn && <span className={styles.warnBadge}>!</span>}
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
              <div className={styles.kv}><span>Активов</span><strong>{symbolsCount}</strong></div>
              <div className={styles.kv}><span>Алгоритм</span><strong>{staticConfig.algo}</strong></div>
              <div className={styles.kv}><span>Период</span><strong>{periodLabel}</strong></div>
            </div>

            <div className={styles.summaryBlock}>
              <div className={styles.kv}><span>Комбинаций входа</span><strong>{stats.entryCombinations}</strong></div>
              <div className={styles.kv}><span>Комбинаций сетки</span><strong>{stats.orderCombinations}</strong></div>
              <div className={styles.kv}><span>Комбинаций выхода</span><strong>{stats.exitCombinations}</strong></div>
              <div className={styles.kv}><span>Всего комбинаций</span><strong>{effectiveTotalTests}</strong></div>
              <div className={styles.kv}><span>Время теста</span><strong>{effectiveTimeString}</strong></div>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        opened={debugRandomConfigOpened}
        onClose={() => setDebugRandomConfigOpened(false)}
        title="Рандомный конфиг"
        size="xl"
        centered
      >
        {debugRandomConfig && (
          <Stack gap="sm">
            <Group gap="md">
              <Text size="sm">
                Кандидат: <strong>{debugRandomConfig.index}</strong> из <strong>{debugRandomConfig.total}</strong>
              </Text>
              <Text size="sm">
                Актив: <strong>{debugRandomConfig.symbol}</strong>
              </Text>
              <Text size="sm">
                Версия: <strong>{debugRandomConfig.version}</strong>
              </Text>
            </Group>
            <ScrollArea h={520} type="auto" offsetScrollbars>
              <Code block>{JSON.stringify(debugRandomConfig.payload, null, 2)}</Code>
            </ScrollArea>
          </Stack>
        )}
      </Modal>

    </Container>
  );
}

