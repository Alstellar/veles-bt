import { useCallback, useRef, useState } from 'react';
import type { BacktestResultItem } from '../types';
import type {
  DirectedSearchConfig,
  EntryConfig,
  ExitConfig,
  OrderState,
  StaticConfig,
} from '../types';
import type { BacktestStats } from '../types/veles';
import { ConnectionService } from '../services/ConnectionService';
import { DatabaseService } from '../services/DatabaseService';
import {
  buildCandidatePayload,
  buildDirectedSearchDimensions,
  decodeCandidate,
  evaluateDirectedSearchFitness,
  type DirectedSearchCandidate,
  type SearchDimension,
  validateDirectedSearchBase,
} from '../services/DirectedSearchService';
import { StorageService } from '../services/StorageService';
import { VelesServiceV2 } from '../services/VelesServiceV2';
import { MAX_TEST_DURATION_MS, STATUS_POLL_INTERVAL_MS } from '../services/QueuePolling';
import { makeBatchId } from '../utils/batchId';
import { parseDateLike, toIsoDateTime } from '../utils/datePolicy';

export interface DirectedSearchRunInput {
  staticConfig: StaticConfig;
  entryConfig: EntryConfig;
  orderState: OrderState;
  exitConfig: ExitConfig;
  directedConfig: DirectedSearchConfig;
}

export interface DirectedSearchRunResult {
  candidate: DirectedSearchCandidate;
  resultId: number | null;
  stats: BacktestStats | null;
  score: number;
  metricValue: number | null;
  passedConstraints: boolean;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function genomeKey(genome: number[]): string {
  return genome.join(':');
}

function createRandomGenome(dimensions: SearchDimension[]): number[] {
  return dimensions.map((dimension) => randomInt(Math.max(1, dimension.values.length)));
}

function crossoverGenome(a: number[], b: number[]): number[] {
  return a.map((gene, index) => (Math.random() < 0.5 ? gene : b[index]));
}

function mutateGenome(genome: number[], dimensions: SearchDimension[], mutationRate: number): number[] {
  return genome.map((gene, index) => {
    if (Math.random() >= mutationRate) return gene;
    return randomInt(Math.max(1, dimensions[index].values.length));
  });
}

function selectTournament(pool: DirectedSearchRunResult[], size: number): DirectedSearchRunResult {
  let best = pool[randomInt(pool.length)];
  for (let i = 1; i < size; i += 1) {
    const next = pool[randomInt(pool.length)];
    if (next.score > best.score) best = next;
  }
  return best;
}

function buildResultItem(id: number, name: string, stats: BacktestStats, input: DirectedSearchRunInput): BacktestResultItem {
  const fallbackFromIso = toIsoDateTime(parseDateLike(input.staticConfig.dateFrom)) ?? new Date().toISOString();
  const fallbackToIso = toIsoDateTime(parseDateLike(input.staticConfig.dateTo)) ?? fallbackFromIso;
  const actualFrom = toIsoDateTime(parseDateLike(stats.from)) ?? fallbackFromIso;
  const actualTo = toIsoDateTime(parseDateLike(stats.to)) ?? fallbackToIso;

  return {
    id,
    name,
    date: new Date().toISOString(),
    from: actualFrom,
    to: actualTo,
    symbol: input.staticConfig.symbol.includes('/')
      ? input.staticConfig.symbol.toUpperCase()
      : `${input.staticConfig.symbol.toUpperCase()}/USDT`,
    algorithm: input.staticConfig.algo,
    exchange: input.staticConfig.exchange,
    profitQuote: stats.profitQuote,
    profitBase: null,
    netQuote: stats.netQuote,
    netQuotePerDay: stats.netQuotePerDay ?? null,
    maePercent: stats.maePercent,
    maeAbsolute: stats.maeAbsolute ?? null,
    mfePercent: stats.mfePercent,
    mfeAbsolute: stats.mfeAbsolute ?? null,
    totalDeals: stats.totalDeals,
    profits: stats.profits ?? 0,
    losses: stats.losses ?? 0,
    breakevens: stats.breakevens ?? 0,
    duration: null,
    maxDuration: stats.maxDuration ?? null,
    avgDuration: stats.avgDuration
  };
}

export function useDirectedSearch() {
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentGeneration, setCurrentGeneration] = useState(0);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [currentBatchIds, setCurrentBatchIds] = useState<number[]>([]);
  const [results, setResults] = useState<DirectedSearchRunResult[]>([]);
  const stopRef = useRef(false);

  const addLog = useCallback((message: string) => {
    const line = `[${new Date().toLocaleTimeString('ru-RU', { hour12: false })}] ${message}`;
    setLogs((prev) => [...prev.slice(-199), line]);
    setStatusMessage(line);
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    addLog('Остановка направленного поиска запрошена пользователем.');
  }, [addLog]);

  const run = useCallback(async (input: DirectedSearchRunInput) => {
    if (isRunning) return;

    const baseError = validateDirectedSearchBase(input.entryConfig, input.orderState, input.exitConfig);
    if (baseError) {
      throw new Error(baseError);
    }

    const { dimensions, error } = buildDirectedSearchDimensions(input.directedConfig, input.orderState, input.exitConfig);
    if (error) {
      throw new Error(error);
    }

    const populationSize = Math.max(4, Number.parseInt(input.directedConfig.ga.populationSize, 10) || 12);
    const generations = Math.max(1, Number.parseInt(input.directedConfig.ga.generations, 10) || 6);
    const eliteCount = Math.max(1, Math.min(populationSize - 1, Number.parseInt(input.directedConfig.ga.eliteCount, 10) || 2));
    const mutationRate = Math.max(0, Math.min(1, Number(String(input.directedConfig.ga.mutationRate).replace(',', '.')) || 0.2));
    const totalPlanned = populationSize * generations;

    const batchId = makeBatchId();
    const namePrefix = `${input.staticConfig.namePrefix || 'Search'} GA`;
    const parsedFromIso = toIsoDateTime(parseDateLike(input.staticConfig.dateFrom as unknown as string | number | Date));
    const parsedToIso = toIsoDateTime(parseDateLike(input.staticConfig.dateTo as unknown as string | number | Date));

    if (!parsedFromIso || !parsedToIso) {
      throw new Error('Некорректно указаны даты периода.');
    }

    stopRef.current = false;
    setIsRunning(true);
    setLogs([]);
    setResults([]);
    setCurrentBatchIds([]);
    setCurrentBatchId(batchId);
    setProgress({ current: 0, total: totalPlanned });
    setCurrentGeneration(0);

    await StorageService.saveBatch({
      id: batchId,
      timestamp: Date.now(),
      apiVersion: 'v2',
      namePrefix,
      symbol: input.staticConfig.symbol,
      exchange: input.staticConfig.exchange,
      totalTests: totalPlanned,
      velesIds: [],
      mode: 'DIRECTED_SEARCH',
      runStatus: 'RUN',
      completedTests: 0,
      resumeSource: {
        staticConfig: {
          ...input.staticConfig,
          dateFrom: parsedFromIso,
          dateTo: parsedToIso
        },
        entryConfig: input.entryConfig,
        orderState: input.orderState,
        exitConfig: input.exitConfig
      }
    });

    const seen = new Set<string>();
    let completed = 0;
    let population: number[][] = [];
    let evaluatedGlobal: DirectedSearchRunResult[] = [];

    const buildUniqueGenome = () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const genome = createRandomGenome(dimensions);
        const key = genomeKey(genome);
        if (!seen.has(key)) {
          seen.add(key);
          return genome;
        }
      }
      return createRandomGenome(dimensions);
    };

    const evaluateGenome = async (genome: number[], generation: number, indexInGeneration: number): Promise<DirectedSearchRunResult> => {
      const candidate = decodeCandidate(genome, dimensions);
      const ordinal = completed + 1;
      const testName = `${namePrefix} ${input.staticConfig.symbol.toUpperCase()} | G${generation} C${indexInGeneration} | ${ordinal}/${totalPlanned} | VH ${batchId}`;

      addLog(`Поколение ${generation}: запускаю кандидата ${indexInGeneration}/${populationSize}.`);

      try {
        const connection = await ConnectionService.getConnection({ force: true });
        if (!connection.success) {
          throw new Error(ConnectionService.reasonToMessage(connection.reason));
        }

        const payload = buildCandidatePayload(
          input.staticConfig,
          input.entryConfig,
          input.orderState,
          input.exitConfig,
          candidate.values,
          testName
        );

        const launched = await VelesServiceV2.runTest(connection.connection.tabId, connection.connection.token, payload);
        if (!launched.success || !launched.id) {
          throw new Error(launched.error || `Ошибка запуска (${launched.status})`);
        }

        // Batch linkage is persisted together with results in IndexedDB.
        setCurrentBatchIds((prev) => (prev.includes(launched.id!) ? prev : [...prev, launched.id!]));

        const startedAt = Date.now();
        while (!stopRef.current) {
          const status = await VelesServiceV2.checkStatus(connection.connection.tabId, connection.connection.token, launched.id);
          if (!status.success) {
            throw new Error(status.error || 'Не удалось получить статус теста.');
          }

          const currentStatus = status.data?.status;
          if (currentStatus === 'FINISHED') break;
          if (currentStatus === 'ERROR' || currentStatus === 'FAILED') {
            throw new Error(status.data?.error || 'Тест завершился с ошибкой.');
          }
          if (Date.now() - startedAt > MAX_TEST_DURATION_MS) {
            throw new Error('Тест превысил лимит по времени и был помечен как timeout.');
          }

          await sleep(STATUS_POLL_INTERVAL_MS);
        }

        if (stopRef.current) {
          throw new Error('Остановлено пользователем');
        }

        const statsResponse = await VelesServiceV2.getStats(connection.connection.tabId, launched.id);
        if (!statsResponse.success || !statsResponse.stats) {
          throw new Error(statsResponse.error || 'Не удалось получить статистику теста.');
        }

        const stats = statsResponse.stats;
        const resultItem = buildResultItem(launched.id, testName, stats, input);
        await DatabaseService.saveBatchTests(batchId, [resultItem]);

        const fitness = evaluateDirectedSearchFitness(stats, input.directedConfig);
        addLog(`Кандидат G${generation}/C${indexInGeneration} завершён. Score: ${fitness.metricValue.toFixed(4)}.`);

        return {
          candidate,
          resultId: launched.id,
          stats,
          score: fitness.score,
          metricValue: fitness.metricValue,
          passedConstraints: fitness.passed
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`Кандидат G${generation}/C${indexInGeneration} завершился ошибкой: ${message}`);
        return {
          candidate,
          resultId: null,
          stats: null,
          score: -1_000_000_000,
          metricValue: null,
          passedConstraints: false,
          error: message
        };
      } finally {
        completed += 1;
        setProgress({ current: completed, total: totalPlanned });
        await StorageService.updateBatchRunState(batchId, 'RUN', {
          completedTests: completed
        });
      }
    };

    try {
      for (let i = 0; i < populationSize; i += 1) {
        population.push(buildUniqueGenome());
      }

      for (let generation = 1; generation <= generations; generation += 1) {
        if (stopRef.current) break;

        setCurrentGeneration(generation);
        setStatusMessage(`Поколение ${generation}/${generations}`);

        const generationResults: DirectedSearchRunResult[] = [];
        for (let index = 0; index < population.length; index += 1) {
          if (stopRef.current) break;
          const evaluated = await evaluateGenome(population[index], generation, index + 1);
          generationResults.push(evaluated);
        }

        generationResults.sort((a, b) => b.score - a.score);
        evaluatedGlobal = [...evaluatedGlobal, ...generationResults]
          .sort((a, b) => b.score - a.score)
          .slice(0, 50);
        setResults(evaluatedGlobal);

        if (generation === generations || stopRef.current) break;

        const nextPopulation: number[][] = generationResults
          .slice(0, eliteCount)
          .map((item) => [...item.candidate.genome]);

        while (nextPopulation.length < populationSize) {
          const parentA = selectTournament(generationResults, Math.min(3, generationResults.length));
          const parentB = selectTournament(generationResults, Math.min(3, generationResults.length));
          const child = mutateGenome(
            crossoverGenome(parentA.candidate.genome, parentB.candidate.genome),
            dimensions,
            mutationRate
          );
          nextPopulation.push(child);
        }

        population = nextPopulation;
      }

      if (stopRef.current) {
        await StorageService.updateBatchRunState(currentBatchId ?? batchId, 'STOP', {
          completedTests: completed,
          stopReason: 'manual_stop'
        });
      } else {
        await StorageService.updateBatchRunState(batchId, 'DONE', {
          completedTests: completed
        });
        addLog('Направленный поиск завершён.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Критическая ошибка направленного поиска: ${message}`);
      await StorageService.updateBatchRunState(batchId, 'STOP', {
        completedTests: completed,
        stopReason: 'runtime_error',
        lastError: message
      });
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, [addLog, currentBatchId, isRunning]);

  return {
    isRunning,
    statusMessage,
    logs,
    progress,
    currentGeneration,
    currentBatchId,
    currentBatchIds,
    results,
    run,
    stop
  };
}
