import type {
  AlgoType,
  ExchangeType,
  ExchangeInfo,
  SymbolAvailability,
  SymbolLimitation
} from '../types';
import { ConnectionService } from './ConnectionService';
import { getVelesApiUrl } from '../config/velesDomains';

const isUsdtPair = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return false;

  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length !== 2) return false;
    const [base, quote] = parts;
    return Boolean(base) && quote === 'USDT';
  }

  return normalized.endsWith('USDT') && normalized.length > 4;
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

export const fetchExchanges = async (): Promise<ExchangeInfo[]> => {
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

export const fetchLimitations = async (exchange: ExchangeType): Promise<SymbolLimitation[]> => {
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

  return payload.filter((item) => {
    return isUsdtPair(item?.symbol) || isUsdtPair(item?.externalId);
  });
};

export const fetchAvailability = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
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
  return payload.filter((item) => isUsdtPair(item?.symbol));
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
