// src/background.ts

// Объявляем chrome как any.
declare const chrome: any;

// Интерфейс состояния для каждой вкладки
interface TabState {
  symbol?: string;    // Например: "BTC/USDT"
  exchange?: string;  // Например: "BYBIT_FUTURES"
  algo?: string;      // "LONG" | "SHORT"
  timestamp: number;
}

// Временный кэш в оперативной памяти (tabId -> State)
const stateCache: Record<number, TabState> = {};
const lastSavedCache: Record<number, Pick<TabState, 'symbol' | 'exchange' | 'algo'>> = {};
const saveTimers: Record<number, ReturnType<typeof setTimeout> | undefined> = {};
const STORAGE_WRITE_THROTTLE_MS = 400;

function scheduleStateSave(tabId: number) {
  if (saveTimers[tabId]) {
    clearTimeout(saveTimers[tabId]);
  }

  saveTimers[tabId] = setTimeout(() => {
    const state = stateCache[tabId];
    if (!state) return;

    const previousSaved = lastSavedCache[tabId];
    const hasMeaningfulChanges =
      !previousSaved ||
      previousSaved.symbol !== state.symbol ||
      previousSaved.exchange !== state.exchange ||
      previousSaved.algo !== state.algo;

    if (!hasMeaningfulChanges) return;

    const payload: TabState = { ...state, timestamp: Date.now() };
    stateCache[tabId] = payload;
    lastSavedCache[tabId] = {
      symbol: payload.symbol,
      exchange: payload.exchange,
      algo: payload.algo
    };

    chrome.storage.local.set({
      [`veles_state_${tabId}`]: payload
    });
  }, STORAGE_WRITE_THROTTLE_MS);
}

/**
 * Основной слушатель сетевых запросов.
 * Анализирует URL, уходящие на api велеса.
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    try {
      const url = new URL(details.url);
      const tabId = details.tabId;

      // Игнорируем фоновые запросы (не от вкладок)
      if (tabId < 0) return;

      // Инициализируем структуру, если её нет
      if (!stateCache[tabId]) {
        stateCache[tabId] = { timestamp: Date.now() };
      }

      let updated = false;
      const current = stateCache[tabId];

      // --- 1. СМЕНА ПАРЫ (Ловим запрос свечей) ---
      // URL: .../api/candles?symbol=BTC%2FUSDT&exchange=...
      if (url.pathname.includes('/api/candles')) {
        const symbol = url.searchParams.get('symbol');
        const exchange = url.searchParams.get('exchange');

        if (symbol) {
           // Декодируем (0G%2FUSDT -> 0G/USDT) и сохраняем
           current.symbol = decodeURIComponent(symbol);
        }
        if (exchange) current.exchange = exchange;
        updated = true;
      }

      // --- 2. СМЕНА НАПРАВЛЕНИЯ / БИРЖИ (Ловим топ монет) ---
      // URL: .../api/statistics/symbols/top?algorithm=LONG&exchange=...
      if (url.pathname.includes('/statistics/symbols/top')) {
        const algo = url.searchParams.get('algorithm');
        const exchange = url.searchParams.get('exchange');

        if (algo) current.algo = algo;
        if (exchange) current.exchange = exchange;
        updated = true;
      }

      // --- 3. СМЕНА АПИ КЛЮЧА (Ловим лимиты) ---
      // URL: .../api/pairs/limitations/dictionary?exchange=...
      if (url.pathname.includes('/limitations/dictionary')) {
          const exchange = url.searchParams.get('exchange');
          if (exchange) {
              current.exchange = exchange;
              updated = true;
          }
      }

      // Если данные обновились — сохраняем в постоянное хранилище
      if (updated) {
        current.timestamp = Date.now();
        console.log(`[Tab ${tabId}] Config Updated:`, current);
        // Сохраняем с throttling и только при реальном изменении symbol/exchange/algo
        scheduleStateSave(tabId);
      }

    } catch (e) {
      console.error('Background error:', e);
    }
  },
  { urls: ["https://veles.finance/api/*"] } // Слушаем только Veles API
);

/**
 * Очистка памяти при закрытии вкладки.
 * Чтобы не засорять storage старыми конфигами.
 */
chrome.tabs.onRemoved.addListener((tabId: number) => {
  if (saveTimers[tabId]) {
    clearTimeout(saveTimers[tabId]);
    delete saveTimers[tabId];
  }
  if (lastSavedCache[tabId]) {
    delete lastSavedCache[tabId];
  }
  if (stateCache[tabId]) {
    delete stateCache[tabId];
    chrome.storage.local.remove(`veles_state_${tabId}`);
    console.log(`[Tab ${tabId}] Cache cleared`);
  }
});
