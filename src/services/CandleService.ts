// src/services/CandleService.ts
import { VELES_DEFAULT_ORIGIN, getVelesApiUrl, toVelesOrigin } from '../config/velesDomains';
import { ConnectionService } from './ConnectionService';

export interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeDate: number; // timestamp
}

// Типы интервалов для Veles API
type VelesInterval = 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'FOUR_HOUR';

const INTERVAL_MAP: Record<string, VelesInterval> = {
    '15m': 'FIFTEEN_MINUTES',
    '1h': 'ONE_HOUR',
    '4h': 'FOUR_HOUR'
};

const DURATION_MAP: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000
};

/**
 * Получает свечи с сервера Veles
 */
export async function fetchCandles(symbol: string, exchange: string, timeframe: string): Promise<Candle[]> {
    const apiInterval = INTERVAL_MAP[timeframe];
    if (!apiInterval) throw new Error(`Unknown timeframe: ${timeframe}`);

    const limit = 200; // Нужно для EMA и RSI
    const duration = DURATION_MAP[timeframe];
    
    // Вычисляем время "С какого момента загружать"
    const fromTime = Date.now() - (duration * limit); 
    const fromISO = new Date(fromTime).toISOString();

    const encodedSymbol = encodeURIComponent(symbol);

    let origin = VELES_DEFAULT_ORIGIN;
    const connection = await ConnectionService.getConnection();
    if (connection.success) {
      origin = toVelesOrigin(connection.connection.origin);
    }
    const url = `${getVelesApiUrl('/candles', origin)}?symbol=${encodedSymbol}&exchange=${exchange}&interval=${apiInterval}&from=${fromISO}&limit=${limit}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Veles API Error: ${response.status}`);
        }

        const data = await response.json();

        // Преобразуем ответ в чистый формат
        return data.map((c: any) => ({
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            closeDate: new Date(c.closeDate).getTime()
        })).sort((a: Candle, b: Candle) => a.closeDate - b.closeDate);

    } catch (e) {
        console.error(`Failed to fetch candles for ${timeframe}:`, e);
        return [];
    }
}
