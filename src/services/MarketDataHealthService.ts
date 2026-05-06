import type { VelesHttpTrace } from '../types/velesTrace';
import { maskTraceHeaders } from '../types/velesTrace';
import { injectedCheckRecentCandles } from './VelesMarketDataInjections';

export const NO_MARKET_DATA_CLASSIFICATION = 'DELISTED_OR_NO_MARKET_DATA' as const;

export interface MarketDataConfigLike {
  symbol: string;
  exchange: string;
}

export interface RecentCandlesProbe {
  success: boolean;
  alive: boolean | null;
  candlesCount: number | null;
  status?: number;
  error?: string;
  trace?: VelesHttpTrace;
}

export interface NoMarketDataClassification {
  classification: typeof NO_MARKET_DATA_CLASSIFICATION | null;
  message: string | null;
  candleProbe: RecentCandlesProbe;
}

function prepareTrace(trace: VelesHttpTrace | undefined): VelesHttpTrace | undefined {
  if (!trace) return undefined;
  return {
    ...trace,
    request: {
      ...trace.request,
      headers: maskTraceHeaders(trace.request.headers)
    }
  };
}

function scriptErrorTrace(method: string, url: string, error: unknown): VelesHttpTrace {
  const message = error instanceof Error ? error.message : String(error);
  return {
    method,
    url,
    request: {},
    error: error instanceof Error
      ? { name: error.name, message: message || error.name, stack: error.stack }
      : { message },
    durationMs: 0
  };
}

export class MarketDataHealthService {
  static buildNoMarketDataMessage(config: MarketDataConfigLike): string {
    const symbol = String(config.symbol ?? 'unknown');
    const exchange = String(config.exchange ?? 'unknown');
    return `${symbol} ${exchange}: нет свежих свечей Veles за последние часы. Актив может быть делистнут или недоступен для бектеста.`;
  }

  static async checkRecentCandles(
    tabId: number,
    symbol: string,
    exchange: string,
    hoursBack = 12,
    limit = 300
  ): Promise<RecentCandlesProbe> {
    const fromIso = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    let result: chrome.scripting.InjectionResult<Awaited<ReturnType<typeof injectedCheckRecentCandles>>>[];
    try {
      result = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectedCheckRecentCandles,
        args: [symbol, exchange, fromIso, limit]
      });
    } catch (error) {
      return {
        success: false,
        alive: null,
        candlesCount: null,
        error: error instanceof Error ? error.message : String(error),
        trace: scriptErrorTrace(
          'GET',
          `/api/candles?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}&interval=FIFTEEN_MINUTES&from=${encodeURIComponent(fromIso)}&limit=${limit}`,
          error
        )
      };
    }

    const res = result[0]?.result;
    return {
      success: Boolean(res?.success),
      alive: typeof res?.alive === 'boolean' ? res.alive : null,
      candlesCount: typeof res?.candlesCount === 'number' ? res.candlesCount : null,
      status: res?.status,
      error: res?.error,
      trace: prepareTrace(res?.trace as VelesHttpTrace | undefined)
    };
  }

  static async classifyNoMarketDataAfterLaunch5xx(
    tabId: number,
    config: MarketDataConfigLike
  ): Promise<NoMarketDataClassification> {
    const candleProbe = await this.checkRecentCandles(tabId, config.symbol, config.exchange, 12, 300);
    const noMarketData = candleProbe.success && candleProbe.alive === false && candleProbe.candlesCount === 0;
    return {
      classification: noMarketData ? NO_MARKET_DATA_CLASSIFICATION : null,
      message: noMarketData ? this.buildNoMarketDataMessage(config) : null,
      candleProbe
    };
  }
}
