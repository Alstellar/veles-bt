// src/utils/exportUtils.ts
import type { BacktestResultItem } from '../types';
import { formatDurationHuman } from './formatters';

export function downloadAsCsv(data: BacktestResultItem[], filename = 'veles-results.csv') {
    if (!data || data.length === 0) return;

    // 1. Заголовки (CSV Header)
    const headers = [
        'ID',
        'Ссылка',
        'Шаблон',
        'Название',
        'Символ',
        'Биржа',
        'Направление',
        'Дата (От)',
        'Дата (До)',
        'Дней (Всего)',
        'Net (USDT)',
        'Net / МПУ',
        'Эфф. в день (USDT)',
        'Сделки (Всего)',
        'Сделок в день',
        'Win Rate (%)',
        'МПП (USDT)',
        'МПП (%)',
        'МПУ (USDT)',
        'МПУ (%)',
        'Ср. время сделки',
        'Макс. время сделки'
    ];

    // 2. Преобразование данных в строки
    const rows = data.map((rawItem) => {
        // Приводим к any, чтобы TS не ругался на нестандартные поля
        const item = rawItem as any;
        const stats = item.stats || {};

        const start = new Date(item.from).getTime();
        const end = new Date(item.to).getTime();
        
        // Длительность теста
        const daysCount = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        
        // Сделки
        const totalDeals = item.totalDeals ?? stats.totalDeals ?? 0;
        const dealsPerDay = totalDeals / daysCount;

        // Финансы
        const netQuote = item.netQuote ?? stats.netQuote ?? 0;
        const netQuotePerDay = item.netQuotePerDay ?? stats.netQuotePerDay ?? 0;

        // Win Rate
        const profits = item.profits ?? stats.profits ?? 0;
        const losses = item.losses ?? stats.losses ?? 0;
        const totalClosed = profits + losses;
        const winRate = totalClosed > 0 
            ? (profits / totalClosed * 100).toFixed(2) 
            : '0.00';

        // === ИСПРАВЛЕНИЕ: ИСПОЛЬЗУЕМ ВЕРНЫЕ КЛЮЧИ ===
        // Данные лежат в maeAbsolute / mfeAbsolute
        const mfeVal = item.mfeAbsolute ?? stats.mfeAbsolute ?? item.mfe ?? 0;
        const maeVal = item.maeAbsolute ?? stats.maeAbsolute ?? item.mae ?? 0;

        // Проценты
        const mfeProc = item.mfePercent ?? stats.mfePercent ?? 0;
        const maeProc = item.maePercent ?? stats.maePercent ?? 0;

        // Время
        const avgDur = item.avgDuration ?? stats.avgDuration ?? 0;
        const maxDur = item.maxDuration ?? stats.maxDuration ?? 0;

        // Расчет Net / МПУ (Recovery Factor)
        const absMae = Math.abs(maeVal); 
        const recoveryFactor = absMae > 0.0001 
            ? (netQuote / absMae).toFixed(2) 
            : '0.00';

        const backtestUrl = `https://veles.finance/backtests/${item.id}`;

        return [
            item.id,
            backtestUrl,
            item.sourceTemplateUrl ?? '',
            `"${item.name.replace(/"/g, '""')}"`,
            item.symbol,
            item.exchange,
            item.algorithm,
            new Date(item.from).toLocaleDateString(),
            new Date(item.to).toLocaleDateString(),
            daysCount.toFixed(1),
            
            // Финансы
            netQuote.toFixed(2),
            recoveryFactor,
            netQuotePerDay.toFixed(2),
            
            // Сделки
            totalDeals,
            dealsPerDay.toFixed(1),
            winRate,
            
            // МПП (MFE) - Макс. прибыль в моменте
            mfeVal.toFixed(2),
            mfeProc.toFixed(2),
            
            // МПУ (MAE) - Макс. просадка
            maeVal.toFixed(2),
            maeProc.toFixed(2),
            
            // Время
            `"${formatDurationHuman(avgDur)}"`,
            `"${formatDurationHuman(maxDur)}"`
        ].join(';');
    });

    // 3. Сборка (UTF-8 BOM)
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');

    // 4. Скачивание
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

