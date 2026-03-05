// src/utils/tabUtils.ts

import { getVelesOriginFromUrl } from '../config/velesDomains';

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
 * Критерий: поддерживаемый домен Veles и путь /cabinet/bot/
 */
export function isVelesBotPage(url?: string): boolean {
    if (!url) return false;
    if (!getVelesOriginFromUrl(url)) return false;
    try {
        const parsed = new URL(url);
        return parsed.pathname.includes('/cabinet/bot');
    } catch {
        return false;
    }
}
