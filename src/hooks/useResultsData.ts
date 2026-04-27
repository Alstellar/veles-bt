import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { DatabaseService, type BatchTestSortKey } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';

export type SortKey = keyof BacktestResultItem | 'recoveryFactor' | 'days' | 'dealsPerDay';

export interface SortState {
  key: SortKey;
  reversed: boolean;
}

const INITIAL_COLUMNS = {
  name: true,
  exchange: true,
  pair: true,
  sourceTemplate: true,
  period: true,
  days: true,
  net: true,
  recovery: true,
  effDay: true,
  deals: true,
  dealsPerDay: true,
  mfeAbs: true,
  mfePct: true,
  maeAbs: true,
  maePct: true,
  avgTime: true,
  maxTime: true
};

const SORT_KEY_MAP: Partial<Record<SortKey, BatchTestSortKey>> = {
  date: 'date',
  name: 'name',
  exchange: 'exchange',
  symbol: 'symbol',
  sourceTemplateUrl: 'sourceTemplateUrl',
  from: 'from',
  netQuote: 'netQuote',
  recoveryFactor: 'recoveryFactor',
  netQuotePerDay: 'netQuotePerDay',
  totalDeals: 'totalDeals',
  dealsPerDay: 'dealsPerDay',
  mfeAbsolute: 'mfeAbsolute',
  mfePercent: 'mfePercent',
  maeAbsolute: 'maeAbsolute',
  maePercent: 'maePercent',
  avgDuration: 'avgDuration',
  maxDuration: 'maxDuration',
  days: 'days'
};

const toDbSortKey = (key: SortKey): BatchTestSortKey => SORT_KEY_MAP[key] ?? 'netQuote';

const sortInMemory = (items: BacktestResultItem[], sort: SortState): BacktestResultItem[] => {
  return [...items].sort((a, b) => {
    let valA: number | string | undefined | null = a[sort.key as keyof BacktestResultItem] as never;
    let valB: number | string | undefined | null = b[sort.key as keyof BacktestResultItem] as never;

    if (sort.key === 'recoveryFactor') {
      const maeA = Math.abs(a.maeAbsolute || 0);
      const maeB = Math.abs(b.maeAbsolute || 0);
      valA = maeA > 0 ? (a.netQuote || 0) / maeA : ((a.netQuote || 0) > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
      valB = maeB > 0 ? (b.netQuote || 0) / maeB : ((b.netQuote || 0) > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
    }

    if (sort.key === 'days') {
      valA = dayjs(a.to).diff(dayjs(a.from), 'day');
      valB = dayjs(b.to).diff(dayjs(b.from), 'day');
    }

    if (sort.key === 'dealsPerDay') {
      const daysA = Math.max(1, dayjs(a.to).diff(dayjs(a.from), 'day'));
      const daysB = Math.max(1, dayjs(b.to).diff(dayjs(b.from), 'day'));
      valA = (a.totalDeals || 0) / daysA;
      valB = (b.totalDeals || 0) / daysB;
    }

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    const cmp = valA > valB ? 1 : -1;
    return sort.reversed ? -cmp : cmp;
  });
};

export function useResultsData(batchId: string | null | undefined, targetIds: number[], opened: boolean, isLive?: boolean) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<string>('20');
  const [sort, setSort] = useState<SortState>({ key: 'netQuote', reversed: true });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(INITIAL_COLUMNS);

  const limit = Math.max(1, Number.parseInt(pageSize, 10) || 20);

  useEffect(() => {
    setPage(1);
  }, [batchId, pageSize, sort.key, sort.reversed]);

  const loadData = useCallback(async () => {
    if (!isLive) setLoading(true);
    try {
      if (batchId) {
        const result = await DatabaseService.getBatchTestsPage({
          batchId,
          sortKey: toDbSortKey(sort.key),
          reversed: sort.reversed,
          offset: (page - 1) * limit,
          limit
        });
        setData(result.items);
        setTotal(result.total);
        return;
      }

      if (targetIds.length > 0) {
        const items = await DatabaseService.getTestsByIds(targetIds);
        const sorted = sortInMemory(items, sort);
        setTotal(sorted.length);
        setData(sorted.slice((page - 1) * limit, page * limit));
        return;
      }

      setData([]);
      setTotal(0);
    } catch (e) {
      console.error('Ошибка загрузки результатов:', e);
      setData([]);
      setTotal(0);
    } finally {
      if (!isLive) setLoading(false);
    }
  }, [batchId, targetIds, isLive, sort, page, limit]);

  useEffect(() => {
    if (opened) {
      void loadData();
    } else {
      setData([]);
      setTotal(0);
    }
  }, [opened, loadData]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => ({ key, reversed: prev.key === key ? !prev.reversed : true }));
  };

  return {
    data,
    loading,
    sort,
    toggleSort,
    visibleColumns,
    setVisibleColumns,
    reloadData: loadData,
    page,
    setPage,
    pageSize,
    setPageSize,
    total
  };
}
