// src/utils/pageParser.ts
import type { VelesPageContext } from '../types';

// Чтобы TypeScript не ругался на chrome
declare const chrome: any;

/**
 * Получает контекст страницы (Биржа, Пара, Направление).
 * Читает данные, которые Background Script собрал из сетевых запросов и сохранил в Storage.
 */
export async function getPageContext(): Promise<VelesPageContext> {
    // 1. Получаем ID активной вкладки и её URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
        throw new Error('No active tab');
    }

    // --- 🛑 НОВАЯ ПРОВЕРКА: Фильтр по URL ---
    // Если в адресе нет "/bot/", значит мы вышли из редактора.
    // Возвращаем пустой контекст, чтобы попап показал "Меню" или "Не найдено".
    const isBotUrl = tab.url && tab.url.includes('/bot/');

    if (!isBotUrl) {
        console.log('🚫 Current URL is not a bot page:', tab.url);
        return {
            symbol: '',
            exchange: '',
            algo: 'LONG',
            isBotPage: false // ГЛАВНОЕ ИЗМЕНЕНИЕ
        };
    }

    // 2. Формируем ключ хранилища для текущей вкладки
    const storageKey = `veles_state_${tab.id}`;
    
    // 3. Читаем данные из local storage
    const result = await new Promise<any>((resolve) => {
        chrome.storage.local.get(storageKey, (items: any) => {
            resolve(items);
        });
    });

    const state = result[storageKey];

    console.log('📖 Popup read state from Storage:', state);

    // 4. Если данные найдены — возвращаем их
    if (state && state.symbol && state.exchange) {
        return {
            symbol: state.symbol,
            exchange: state.exchange,
            // Если направление еще не поймали, по умолчанию LONG
            algo: (state.algo || 'LONG') as 'LONG' | 'SHORT',
            isBotPage: true
        };
    }

    // 5. FALLBACK (Запасной вариант)
    // Если мы на странице бота (прошли проверку URL), но данных в памяти еще нет
    console.warn('⚠️ Bot page detected, but no state in storage yet. Using defaults.');
    return {
        symbol: 'BTC/USDT', 
        exchange: 'BINANCE_FUTURES',
        algo: 'LONG',
        isBotPage: true
    };
}