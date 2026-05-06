/**
 * Veles API V2 Injections
 * Injection functions for the new backtest engine API (/api/backtests/v2/)
 */

export async function injectedRunTestV2(payload: unknown, token: string) {
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
  const method = 'POST';
  const url = '/api/backtests/v2/';
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-csrf-token': token,
    'X-Requested-With': 'XMLHttpRequest'
  };
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    const json = parseJsonSafe(text);
    const trace = response.ok ? undefined : {
      method,
      url,
      request: { headers, body: payload },
      response: {
        status: response.status,
        ok: response.ok,
        headers: headersToObject(response.headers),
        bodyText: text,
        bodyJson: json
      },
      durationMs: Date.now() - startedAt
    };
    return { success: response.ok, status: response.status, body: json, trace };
  } catch (err: unknown) {
    return {
      success: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      trace: {
        method,
        url,
        request: { headers, body: payload },
        error: errorToTraceError(err),
        durationMs: Date.now() - startedAt
      }
    };
  }
}

export async function injectedCheckStatusV2(id: number, token: string) {
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
  const readErrorBody = async (response: Response) => {
    const text = await response.text().catch(() => '');
    return { text, json: parseJsonSafe(text) };
  };
  const startedAt = Date.now();
  const method = 'GET';
  const url = `/api/backtests/${id}`;
  const headers = {
    'Accept': 'application/json',
    'x-csrf-token': token,
    'X-Requested-With': 'XMLHttpRequest'
  };
  try {
    const response = await fetch(url, {
      method,
      headers
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    const body = await readErrorBody(response);
    return {
      success: false,
      status: response.status,
      body: body.json,
      trace: {
        method,
        url,
        request: { headers },
        response: {
          status: response.status,
          ok: response.ok,
          headers: headersToObject(response.headers),
          bodyText: body.text,
          bodyJson: body.json
        },
        durationMs: Date.now() - startedAt
      }
    };
  } catch (e: unknown) {
    return {
      success: false,
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

export async function injectedGetStatsV2(id: number) {
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
  const readErrorBody = async (response: Response) => {
    const text = await response.text().catch(() => '');
    return { text, json: parseJsonSafe(text) };
  };
  const startedAt = Date.now();
  const method = 'GET';
  const url = `/api/backtests/statistics/${id}`;
  const headers = {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };
  try {
    const statsRes = await fetch(url, {
      method,
      headers
    });
    if (!statsRes.ok) {
      const body = await readErrorBody(statsRes);
      return {
        success: false,
        status: statsRes.status,
        error: 'Stats Error ' + statsRes.status,
        body: body.json,
        trace: {
          method,
          url,
          request: { headers },
          response: {
            status: statsRes.status,
            ok: statsRes.ok,
            headers: headersToObject(statsRes.headers),
            bodyText: body.text,
            bodyJson: body.json
          },
          durationMs: Date.now() - startedAt
        }
      };
    }
    const statsData = await statsRes.json();
    const shareToken = statsData.slug || statsData.code || null;
    return { success: true, stats: statsData, shareToken };
  } catch (e: unknown) {
    return {
      success: false,
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
