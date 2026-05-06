export async function injectedCheckRecentCandles(symbol: string, exchange: string, fromIso: string, limit: number) {
  const errorToTraceError = (error: unknown) => {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  };
  const headersToObject = (sourceHeaders: Headers) => {
    const output: Record<string, string> = {};
    sourceHeaders.forEach((value, key) => {
      output[key] = value;
    });
    return output;
  };
  const parseJsonSafe = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return text ? { raw: text } : null;
    }
  };
  const startedAt = Date.now();
  const method = 'GET';
  const params = new URLSearchParams({
    symbol,
    exchange,
    interval: 'FIFTEEN_MINUTES',
    from: fromIso,
    limit: String(limit)
  });
  const url = `/api/candles?${params.toString()}`;
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    const response = await fetch(url, { method, headers });
    const text = await response.text();
    const json = parseJsonSafe(text);
    const candlesCount = Array.isArray(json) ? json.length : null;
    const trace = !response.ok || candlesCount === 0
      ? {
          method,
          url,
          request: { headers },
          response: {
            status: response.status,
            ok: response.ok,
            headers: headersToObject(response.headers),
            bodyText: text,
            bodyJson: json
          },
          durationMs: Date.now() - startedAt
        }
      : undefined;

    return {
      success: response.ok,
      alive: response.ok && typeof candlesCount === 'number' && candlesCount > 0,
      candlesCount,
      status: response.status,
      body: json,
      trace
    };
  } catch (e: unknown) {
    return {
      success: false,
      alive: null,
      candlesCount: null,
      error: e instanceof Error ? e.message : String(e),
      trace: {
        method,
        url,
        request: { headers },
        error: errorToTraceError(e),
        durationMs: Date.now() - startedAt
      }
    };
  }
}
