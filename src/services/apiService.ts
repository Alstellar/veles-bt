import type {
  ExchangeType,
  ExchangeInfo,
  SymbolAvailability,
  SymbolLimitation
} from '../types';
import { getVelesToken } from './authService';

const BASE_API = 'https://veles.finance/api';

const getHeaders = (token: string | null): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const unwrapPayload = <T,>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'payload' in raw) {
    return (raw as { payload: T }).payload;
  }
  return raw as T;
};

export const fetchExchanges = async (): Promise<ExchangeInfo[]> => {
  const token = await getVelesToken();
  const response = await fetch(`${BASE_API}/exchanges`, {
    method: 'GET',
    headers: getHeaders(token)
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
    }
    throw new Error(`Ошибка загрузки списка бирж: ${response.statusText}`);
  }

  const data = unwrapPayload<ExchangeInfo[]>(await response.json());
  if (!Array.isArray(data)) return [];

  return data.filter((item): item is ExchangeInfo => {
    return Boolean(item?.key && item?.name && (item?.type === 'SPOT' || item?.type === 'FUTURES'));
  });
};

export const fetchLimitations = async (exchange: ExchangeType): Promise<SymbolLimitation[]> => {
  const token = await getVelesToken();
  const response = await fetch(
    `${BASE_API}/pairs/limitations/dictionary?exchange=${encodeURIComponent(exchange)}`,
    {
      method: 'GET',
      headers: getHeaders(token)
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
    }
    throw new Error(`Ошибка загрузки списка монет: ${response.statusText}`);
  }

  const payload = unwrapPayload<SymbolLimitation[]>(await response.json());
  return Array.isArray(payload) ? payload : [];
};

export const fetchAvailability = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
  const token = await getVelesToken();
  const response = await fetch(
    `${BASE_API}/pairs/availability/dictionary?exchange=${encodeURIComponent(exchange)}`,
    {
      method: 'GET',
      headers: getHeaders(token)
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
    }
    throw new Error(`Ошибка загрузки доступной истории: ${response.statusText}`);
  }

  const payload = unwrapPayload<SymbolAvailability[]>(await response.json());
  return Array.isArray(payload) ? payload : [];
};

export const fetchImportPayload = async (code: string): Promise<unknown> => {
  const token = await getVelesToken();
  const response = await fetch(`${BASE_API}/bots/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: getHeaders(token)
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Ошибка авторизации в Veles (401 Unauthorized)');
    }
    if (response.status === 404) {
      throw new Error('Конфигурация по ссылке не найдена (404)');
    }
    throw new Error(`Ошибка загрузки конфигурации: ${response.status} ${response.statusText}`);
  }

  return unwrapPayload<unknown>(await response.json());
};
