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

    const currentUrl = tab.url || '';

    // --- 🛑 ИСПРАВЛЕННАЯ ПРОВЕРКА URL ---
    // Мы считаем страницей бота:
    // 1. .../cabinet/bot/12345 (Редактирование существующего)
    // 2. .../cabinet/bot (Создание нового)
    // 3. .../cabinet/create-bot (Иногда встречается такой путь, добавим на всякий случай)
    const isBotPageUrl = currentUrl.includes('/cabinet/bot') || currentUrl.includes('/bot/');

    if (!isBotPageUrl) {
        console.log('🚫 Current URL is not a bot page:', currentUrl);
        return {
            symbol: '',
            exchange: '',
            algo: 'LONG',
            isBotPage: false 
        };
    }

    // 2. Формируем ключ хранилища для текущей вкладки
    const storageKey = `veles_state_${tab.id}`;
    
    // 3. Читаем данные из local storage
    // Это критически важно для НОВЫХ ботов, так как их конфиг существует только здесь (перехваченный background.ts)
    const result = await new Promise<any>((resolve) => {
        chrome.storage.local.get(storageKey, (items: any) => {
            resolve(items);
        });
    });

    const state = result[storageKey];

    console.log('📖 Popup read state from Storage:', state);

    // 4. Если данные найдены (Background перехватил выбор пользователя) — возвращаем их
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
    // Если мы на странице бота, но пользователь еще ничего не нажимал и background пуст.
    // Возвращаем пустые значения, но isBotPage: true, чтобы PopupView мог показать
    // сообщение "Выберите пару для анализа" вместо "Меню".
    console.warn('⚠️ Bot page detected, but no state in storage yet.');
    return {
        symbol: '',            // Пусто, чтобы PopupView понял, что данных не хватает
        exchange: '',
        algo: 'LONG',
        isBotPage: true        // Важно! Это включит интерфейс анализатора
    };
}