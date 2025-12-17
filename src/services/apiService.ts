import type { ExchangeType, SymbolLimitation, SymbolAvailability } from '../types';
import { getVelesToken } from './authService';

const BASE_API = 'https://veles.finance/api';

const getHeaders = (token: string | null) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 1. Получение справочника лимитов
export const fetchLimitations = async (exchange: ExchangeType): Promise<SymbolLimitation[]> => {
  console.groupCollapsed(`[VelesBT 🛠] API Request: Limitations (${exchange})`); // Группируем логи
  
  try {
    const token = await getVelesToken();
    
    if (!token) {
      console.warn('[VelesBT 🛠] ⚠️ Запрос без токена! Данные могут быть неполными.');
    }

    const url = `${BASE_API}/pairs/limitations/dictionary?exchange=${exchange}`;
    console.log(`[VelesBT 🛠] Fetching: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(token),
    });

    console.log(`[VelesBT 🛠] Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Требуется авторизация в Veles (401 Unauthorized)');
      }
      throw new Error(`Ошибка API Veles: ${response.statusText}`);
    }

    const data = await response.json();
    const payload = data.payload || [];
    
    console.log(`[VelesBT 🛠] ✅ Получено записей: ${payload.length}`);
    if (payload.length > 0) {
      console.log('[VelesBT 🛠] Пример первой записи:', payload[0]);
    }
    
    console.groupEnd();
    return payload;

  } catch (error) {
    console.error('[VelesBT 🛠] Ошибка запроса:', error);
    console.groupEnd();
    throw error;
  }
};

// 2. Получение справочника доступности
export const fetchAvailability = async (exchange: ExchangeType): Promise<SymbolAvailability[]> => {
  console.groupCollapsed(`[VelesBT 🛠] API Request: Availability (${exchange})`);
  
  try {
    const token = await getVelesToken();
    const url = `${BASE_API}/pairs/availability/dictionary?exchange=${exchange}`;
    
    console.log(`[VelesBT 🛠] Fetching: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(token),
    });

    console.log(`[VelesBT 🛠] Status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Ошибка получения доступности пар: ${response.statusText}`);
    }

    const data = await response.json();
    const payload = data.payload || [];

    console.log(`[VelesBT 🛠] ✅ Получено записей: ${payload.length}`);
    
    console.groupEnd();
    return payload;
  } catch (error) {
    console.error('[VelesBT 🛠] Ошибка запроса:', error);
    console.groupEnd();
    throw error;
  }
};