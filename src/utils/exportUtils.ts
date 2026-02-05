// src/utils/exportUtils.ts
import type { BacktestResultItem } from '../types';
import { formatDurationHuman } from './formatters';

export function downloadAsCsv(data: BacktestResultItem[], filename = 'veles-results.csv') {
    if (!data || data.length === 0) return;

    // 1. Заголовки (CSV Header)
    // Порядок важен
    const headers = [
        'ID',
        'Название',
        'Символ',
        'Биржа',
        'Направление',
        'Дата (От)',
        'Дата (До)',
        'Чистый Профит (USDT)',
        'Эфф. в день (USDT)',
        'Сделки (Всего)',
        'Профит',
        'Убыток',
        'БУ',
        'Win Rate (%)',
        'МПП (%)',
        'МПУ (%)',
        'Ср. время сделки'
    ];

    // 2. Преобразование данных в строки
    const rows = data.map(item => {
        // Расчет Win Rate
        const totalClosed = (item.profits || 0) + (item.losses || 0);
        const winRate = totalClosed > 0 
            ? ((item.profits || 0) / totalClosed * 100).toFixed(2) 
            : '0.00';

        return [
            item.id,
            `"${item.name.replace(/"/g, '""')}"`, // Экранирование кавычек в названии
            item.symbol,
            item.exchange,
            item.algorithm,
            new Date(item.from).toLocaleDateString(),
            new Date(item.to).toLocaleDateString(),
            (item.netQuote || 0).toFixed(2),
            (item.netQuotePerDay || 0).toFixed(2),
            item.totalDeals,
            item.profits || 0,
            item.losses || 0,
            item.breakevens || 0,
            winRate,
            (item.mfePercent || 0).toFixed(2),
            (item.maePercent || 0).toFixed(2),
            `"${formatDurationHuman(item.avgDuration)}"`
        ].join(';'); // Используем точку с запятой для лучшей совместимости с Excel
    });

    // 3. Сборка контента с BOM (для UTF-8 в Excel)
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