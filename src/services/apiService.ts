import type {
  AlgoType,
  ExchangeType,
  ExchangeInfo,
  SymbolAvailability,
  SymbolLimitation
} from '../types';
import { ConnectionService } from './ConnectionService';

const BASE_API = 'https://veles.finance/api';

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

const resolveToken = async (): Promise<string> => {
  const connection = await ConnectionService.getConnection();
  if (!connection.success) {
    throw new Error(ConnectionService.reasonToMessage(connection.reason));
  }
  return connection.connection.token;
};

const handleHttpError = (response: Response, fallback: string): never => {
  if (response.status === 401 || response.status === 403) {
    ConnectionService.invalidate();
    throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
  }
  throw new Error(`${fallback}: ${response.status} ${response.statusText}`);
};

export const fetchExchanges = async (): Promise<ExchangeInfo[]> => {
  const token = await resolveToken();
  const response = await fetch(`${BASE_API}/exchanges`, {
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
  const token = await resolveToken();
  const response = await fetch(
    `${BASE_API}/pairs/limitations/dictionary?exchange=${encodeURIComponent(exchange)}`,
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
  return Array.isArray(payload) ? payload : [];
};

export const fetchAvailability = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
  const token = await resolveToken();
  const response = await fetch(
    `${BASE_API}/pairs/availability/dictionary?exchange=${encodeURIComponent(exchange)}`,
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
  return Array.isArray(payload) ? payload : [];
};

export const fetchTopSymbols = async (exchange: ExchangeType, algorithm: AlgoType): Promise<string[]> => {
  const token = await resolveToken();
  const response = await fetch(
    `${BASE_API}/statistics/symbols/top?exchange=${encodeURIComponent(exchange)}&algorithm=${encodeURIComponent(algorithm)}`,
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
  const token = await resolveToken();
  const response = await fetch(`${BASE_API}/bots/${encodeURIComponent(code)}`, {
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
