// src/utils/tabUtils.ts

/**
 * Получает текущую активную вкладку пользователя.
 * Используется для определения контекста (находится ли юзер на сайте Veles).
 */
export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return null;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

/**
 * Проверяет, является ли переданный URL страницей настройки бота Veles.
 * Критерий: домен veles.finance и путь /cabinet/bot/
 */
export function isVelesBotPage(url?: string): boolean {
    if (!url) return false;
    return url.includes('veles.finance/cabinet/bot');
}