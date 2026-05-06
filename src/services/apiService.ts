import type {
  AlgoType,
  ExchangeType,
  ExchangeInfo,
  SymbolAvailability,
  SymbolLimitation
} from '../types';
import { ConnectionService } from './ConnectionService';
import { DatabaseService, type ReferenceCacheRecord, type ReferenceCacheExchangeRecord } from './DatabaseService';
import { getVelesApiUrl } from '../config/velesDomains';
import { isPairForExchange } from '../utils/exchangeQuote';

const DICTIONARY_TTL_MS = 24 * 60 * 60 * 1000;
const REFERENCE_WARMUP_CHUNK = 4;
let dictionariesWarmupPromise: Promise<void> | null = null;

const shouldKeepLimitation = (item: Partial<SymbolLimitation> | null | undefined, exchange: ExchangeType): boolean => {
  if (!item) return false;
  return isPairForExchange(item.symbol, exchange) || isPairForExchange(item.externalId, exchange);
};

const shouldKeepAvailability = (item: Partial<SymbolAvailability> | null | undefined, exchange: ExchangeType): boolean => {
  if (!item) return false;
  return isPairForExchange(item.symbol, exchange);
};

const getHeaders = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  Authorization: `Bearer ${token}`
});

const unwrapPayload = <T,>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'payload' in raw) {
    return (raw as { payload: T }).payload;
  }
  return raw as T;
};

const resolveApiContext = async (): Promise<{ token: string; origin: string }> => {
  const connection = await ConnectionService.getConnection();
  if (!connection.success) {
    throw new Error(ConnectionService.reasonToMessage(connection.reason));
  }
  return {
    token: connection.connection.token,
    origin: connection.connection.origin
  };
};

const handleHttpError = (response: Response, fallback: string): never => {
  if (response.status === 401 || response.status === 403) {
    ConnectionService.invalidate();
    throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
  }
  throw new Error(`${fallback}: ${response.status} ${response.statusText}`);
};

const fetchExchangesNetwork = async (): Promise<ExchangeInfo[]> => {
  const { token, origin } = await resolveApiContext();
  const response = await fetch(getVelesApiUrl('/exchanges', origin), {
    method: 'GET',
    headers: getHeaders(token),
    credentials: 'include'
  });

  if (!response.ok) {
    handleHttpError(response, 'Ошибка загрузки списка бирж');
  }

  const data = unwrapPayload<ExchangeInfo[]>(await response.json());
  if (!Array.isArray(data)) return [];

  return data.filter((item): item is ExchangeInfo => {
    return Boolean(item?.key && item?.name && (item?.type === 'SPOT' || item?.type === 'FUTURES'));
  });
};

const fetchLimitationsNetwork = async (exchange: ExchangeType): Promise<SymbolLimitation[]> => {
  const { token, origin } = await resolveApiContext();
  const response = await fetch(
    `${getVelesApiUrl('/pairs/limitations/dictionary', origin)}?exchange=${encodeURIComponent(exchange)}`,
    {
      method: 'GET',
      headers: getHeaders(token),
      credentials: 'include'
    }
  );

  if (!response.ok) {
    handleHttpError(response, 'Ошибка загрузки списка монет');
  }

  const payload = unwrapPayload<SymbolLimitation[]>(await response.json());
  if (!Array.isArray(payload)) return [];

  return payload.filter((item) => shouldKeepLimitation(item, exchange));
};

const fetchAvailabilityNetwork = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
  const { token, origin } = await resolveApiContext();
  const response = await fetch(
    `${getVelesApiUrl('/pairs/availability/dictionary', origin)}?exchange=${encodeURIComponent(exchange)}`,
    {
      method: 'GET',
      headers: getHeaders(token),
      credentials: 'include'
    }
  );

  if (!response.ok) {
    handleHttpError(response, 'Ошибка загрузки доступной истории');
  }

  const payload = unwrapPayload<SymbolAvailability[]>(await response.json());
  if (!Array.isArray(payload)) return [];
  return payload.filter((item) => shouldKeepAvailability(item, exchange));
};

const isDictionariesCacheFresh = (cache: ReferenceCacheRecord | null): boolean => {
  if (!cache) return false;
  return Date.now() - cache.updatedAt < DICTIONARY_TTL_MS;
};

const buildEmptyReferenceCache = (): Omit<ReferenceCacheRecord, 'key'> => ({
  updatedAt: Date.now(),
  exchanges: [],
  byExchange: {}
});

const mergeExchangeIntoCache = (
  cache: Omit<ReferenceCacheRecord, 'key'>,
  exchange: ExchangeType,
  payload: ReferenceCacheExchangeRecord
): Omit<ReferenceCacheRecord, 'key'> => ({
  ...cache,
  byExchange: {
    ...cache.byExchange,
    [exchange]: payload
  }
});

const runWithConcurrency = async <T,>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<Array<PromiseSettledResult<T>>> => {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) return;
      try {
        const value = await tasks[current]();
        results[current] = { status: 'fulfilled', value };
      } catch (error) {
        results[current] = { status: 'rejected', reason: error };
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, () => worker());
  await Promise.all(workers);
  return results;
};

export const warmupReferenceDictionaries = async (force = false): Promise<void> => {
  if (dictionariesWarmupPromise && !force) {
    return dictionariesWarmupPromise;
  }

  const runner = async () => {
    const existing = await DatabaseService.getReferenceCache();
    if (!force && isDictionariesCacheFresh(existing) && (existing?.exchanges.length ?? 0) > 0) {
      return;
    }

    const exchanges = await fetchExchangesNetwork();
    const baseCache: Omit<ReferenceCacheRecord, 'key'> = existing
      ? {
          updatedAt: existing.updatedAt,
          exchanges: existing.exchanges,
          byExchange: existing.byExchange
        }
      : buildEmptyReferenceCache();

    const tasks = exchanges.map((exchangeInfo) => async () => {
      const exchange = exchangeInfo.key;
      const [limitations, availability] = await Promise.all([
        fetchLimitationsNetwork(exchange),
        fetchAvailabilityNetwork(exchange)
      ]);
      return { exchange, limitations, availability };
    });

    const settled = await runWithConcurrency(tasks, REFERENCE_WARMUP_CHUNK);
    let nextCache = {
      ...baseCache,
      updatedAt: Date.now(),
      exchanges
    };

    settled.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      nextCache = mergeExchangeIntoCache(nextCache, result.value.exchange, {
        limitations: result.value.limitations,
        availability: result.value.availability,
        updatedAt: Date.now()
      });
    });

    await DatabaseService.setReferenceCache(nextCache);
  };

  const promise = runner().finally(() => {
    if (dictionariesWarmupPromise === promise) {
      dictionariesWarmupPromise = null;
    }
  });
  dictionariesWarmupPromise = promise;
  return promise;
};

export const fetchExchanges = async (): Promise<ExchangeInfo[]> => {
  const cache = await DatabaseService.getReferenceCache();
  if (cache?.exchanges.length) {
    if (!isDictionariesCacheFresh(cache)) {
      void warmupReferenceDictionaries().catch(() => undefined);
    }
    return cache.exchanges;
  }

  const exchanges = await fetchExchangesNetwork();
  await DatabaseService.setReferenceCache({
    updatedAt: cache?.updatedAt ?? Date.now(),
    exchanges,
    byExchange: cache?.byExchange ?? {}
  });
  return exchanges;
};

export const fetchLimitations = async (exchange: ExchangeType): Promise<SymbolLimitation[]> => {
  const cache = await DatabaseService.getReferenceCache();
  const cachedEntry = cache?.byExchange?.[exchange];
  if (cachedEntry) {
    if (!isDictionariesCacheFresh(cache)) {
      void warmupReferenceDictionaries().catch(() => undefined);
    }
    return cachedEntry.limitations;
  }

  try {
    await warmupReferenceDictionaries();
    const warmed = await DatabaseService.getReferenceCache();
    const warmedEntry = warmed?.byExchange?.[exchange];
    if (warmedEntry) return warmedEntry.limitations;
  } catch {
    // fallback to per-exchange request
  }

  const limitations = await fetchLimitationsNetwork(exchange);
  const current = (await DatabaseService.getReferenceCache()) ?? {
    key: 'global',
    ...buildEmptyReferenceCache()
  };
  await DatabaseService.setReferenceCache(
    mergeExchangeIntoCache(
      {
        updatedAt: current.updatedAt,
        exchanges: current.exchanges,
        byExchange: current.byExchange
      },
      exchange,
      {
        limitations,
        availability: current.byExchange?.[exchange]?.availability ?? [],
        updatedAt: Date.now()
      }
    )
  );
  return limitations;
};

export const fetchAvailability = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
  const cache = await DatabaseService.getReferenceCache();
  const cachedEntry = cache?.byExchange?.[exchange];
  if (cachedEntry) {
    if (!isDictionariesCacheFresh(cache)) {
      void warmupReferenceDictionaries().catch(() => undefined);
    }
    return cachedEntry.availability;
  }

  try {
    await warmupReferenceDictionaries();
    const warmed = await DatabaseService.getReferenceCache();
    const warmedEntry = warmed?.byExchange?.[exchange];
    if (warmedEntry) return warmedEntry.availability;
  } catch {
    // fallback to per-exchange request
  }

  const availability = await fetchAvailabilityNetwork(exchange);
  const current = (await DatabaseService.getReferenceCache()) ?? {
    key: 'global',
    ...buildEmptyReferenceCache()
  };
  await DatabaseService.setReferenceCache(
    mergeExchangeIntoCache(
      {
        updatedAt: current.updatedAt,
        exchanges: current.exchanges,
        byExchange: current.byExchange
      },
      exchange,
      {
        limitations: current.byExchange?.[exchange]?.limitations ?? [],
        availability,
        updatedAt: Date.now()
      }
    )
  );
  return availability;
};

export const fetchTopSymbols = async (exchange: ExchangeType, algorithm: AlgoType): Promise<string[]> => {
  const { token, origin } = await resolveApiContext();
  const response = await fetch(
    `${getVelesApiUrl('/statistics/symbols/top', origin)}?exchange=${encodeURIComponent(exchange)}&algorithm=${encodeURIComponent(algorithm)}`,
    {
      method: 'GET',
      headers: getHeaders(token),
      credentials: 'include'
    }
  );

  if (!response.ok) {
    handleHttpError(response, 'Ошибка загрузки топа активов');
  }

  const payload = unwrapPayload<string[]>(await response.json());
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
};

export const fetchImportPayload = async (code: string): Promise<unknown> => {
  const { token, origin } = await resolveApiContext();
  const response = await fetch(getVelesApiUrl(`/bots/${encodeURIComponent(code)}`, origin), {
    method: 'GET',
    headers: getHeaders(token),
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Конфигурация по ссылке не найдена (404)');
    }
    handleHttpError(response, 'Ошибка загрузки конфигурации');
  }

  return unwrapPayload<unknown>(await response.json());
};
