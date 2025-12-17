// src/services/authService.ts

const VELES_MATCH_PATTERN = 'https://veles.finance/*';

// 1. Функция поиска открытой вкладки Veles
async function getVelesTab(): Promise<chrome.tabs.Tab | undefined> {
  console.log('[VelesBT 🛠] Ищем вкладку Veles Finance...');
  const tabs = await chrome.tabs.query({ url: VELES_MATCH_PATTERN });
  
  if (tabs.length > 0) {
    console.log(`[VelesBT 🛠] Найдено вкладок: ${tabs.length}. Используем ID: ${tabs[0].id}`);
  } else {
    console.warn('[VelesBT 🛠] ❌ Вкладка Veles Finance не найдена! Убедись, что сайт открыт.');
  }
  
  return tabs[0];
}

// 2. Основная функция получения токена
export const getVelesToken = async (): Promise<string | null> => {
  try {
    const targetTab = await getVelesTab();

    if (!targetTab || !targetTab.id) {
      return null;
    }

    console.log('[VelesBT 🛠] Пытаемся извлечь CSRF токен из страницы...');

    // Внедряем микро-скрипт прямо в эту вкладку
    const result = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => {
        const meta = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="_csrf"]');
        return meta ? meta.getAttribute('content') : null;
      },
    });

    if (result && result[0] && result[0].result) {
      console.log('[VelesBT 🛠] ✅ Токен успешно получен!');
      // console.log('Token:', result[0].result); // Можно раскомментировать для полной отладки
      return result[0].result;
    }
    
    console.warn('[VelesBT 🛠] ❌ Токен не найден в meta-тегах страницы.');
    return null;

  } catch (error) {
    console.error('[VelesBT 🛠] 💥 Критическая ошибка при получении токена:', error);
    return null;
  }
};