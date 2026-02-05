// src/hooks/useResultsData.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import dayjs from 'dayjs'; // Импортируем dayjs для расчета дат
import { DatabaseService } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';

// Удаляем 'winRate' из ключей сортировки
export type SortKey = keyof BacktestResultItem | 'recoveryFactor' | 'days' | 'dealsPerDay';

export interface SortState { key: SortKey; reversed: boolean; }

// Обновляем список колонок по умолчанию (убрали winRate)
const INITIAL_COLUMNS = {
  name: true, exchange: true, pair: true, 
  period: true, days: true, 
  net: true, recovery: true, 
  effDay: true, deals: true, dealsPerDay: true, 
  mfeAbs: true, mfePct: true, maeAbs: true, maePct: true,
  avgTime: true, maxTime: true // Поменяли местами Avg и Max, как в ТЗ
};

export function useResultsData(targetIds: number[], opened: boolean, isLive?: boolean) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestResultItem[]>([]);
  
  // Состояние сортировки (по умолчанию: Net Profit убывание)
  const [sort, setSort] = useState<SortState>({ key: 'netQuote', reversed: true });
  
  // Состояние видимости колонок
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(INITIAL_COLUMNS);

  // Загрузка данных из БД
  const loadData = useCallback(async () => {
    // В режиме Live не показываем спиннер, чтобы не моргало при обновлениях
    if (!isLive) setLoading(true);
    try {
      const items = await DatabaseService.getTestsByIds(targetIds);
      setData(items);
    } catch (e) {
      console.error('Ошибка загрузки результатов:', e);
    } finally {
      if (!isLive) setLoading(false);
    }
  }, [targetIds, isLive]);

  // Эффект: Загружаем данные при открытии или изменении списка ID
  useEffect(() => {
    if (opened && targetIds.length > 0) {
      loadData();
    } else if (!opened) {
      // Очищаем данные при закрытии (опционально, для экономии памяти)
      if (!isLive) setData([]);
    }
  }, [opened, targetIds, loadData, isLive]);

  // Умная сортировка с вычисляемыми полями
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      // Инициализируем значением из объекта, если ключ там есть
      let valA: number | string | undefined | null = a[sort.key as keyof BacktestResultItem] as any;
      let valB: number | string | undefined | null = b[sort.key as keyof BacktestResultItem] as any;

      // --- ВЫЧИСЛЯЕМЫЕ ПОЛЯ ---

      // 1. Recovery Factor (Net / MPU)
      // Берем модуль от просадки (MAE Abs). Если просадка 0, считаем результат очень хорошим (999)
      if (sort.key === 'recoveryFactor') {
        const maeA = Math.abs(a.maeAbsolute || 0);
        valA = maeA > 0 ? (a.netQuote || 0) / maeA : ((a.netQuote || 0) > 0 ? 999 : -999);

        const maeB = Math.abs(b.maeAbsolute || 0);
        valB = maeB > 0 ? (b.netQuote || 0) / maeB : ((b.netQuote || 0) > 0 ? 999 : -999);
      }

      // 2. Days (Длительность истории в днях)
      if (sort.key === 'days') {
         valA = dayjs(a.to).diff(dayjs(a.from), 'day');
         valB = dayjs(b.to).diff(dayjs(b.from), 'day');
      }

      // 3. Deals per Day (Частота сделок)
      if (sort.key === 'dealsPerDay') {
         // Защита от деления на 0, берем минимум 1 день
         const daysA = Math.max(1, dayjs(a.to).diff(dayjs(a.from), 'day'));
         valA = (a.totalDeals || 0) / daysA;
         
         const daysB = Math.max(1, dayjs(b.to).diff(dayjs(b.from), 'day'));
         valB = (b.totalDeals || 0) / daysB;
      }

      // --- ОБЫЧНАЯ СОРТИРОВКА ---
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      
      const cmp = valA > valB ? 1 : -1;
      return sort.reversed ? -cmp : cmp;
    });
  }, [data, sort]);

  // Функция переключения сортировки
  const toggleSort = (key: SortKey) => {
    setSort(prev => ({ key, reversed: prev.key === key ? !prev.reversed : true }));
  };

  return {
    data: sortedData,
    rawData: data,
    loading,
    sort,
    toggleSort,
    visibleColumns,
    setVisibleColumns,
    reloadData: loadData
  };
}