// src/services/VelesInjections.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function injectedRunTest(payload: any, token: string) {
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
  const url = '/api/backtests/';
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-csrf-token": token,
    "X-Requested-With": "XMLHttpRequest"
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
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      error: err?.message || 'Failed to fetch',
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

export async function injectedCheckStatus(id: number, token: string) {
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
  const headers = { "Accept": "application/json", "x-csrf-token": token, "X-Requested-With": "XMLHttpRequest" };
  try {
    const response = await fetch(url, {
      method,
      headers
    });
    if (response.ok) return { success: true, data: await response.json() };
    const body = await readErrorBody(response);
    return {
      success: false,
      status: response.status,
      body: body.json,
      error: response.status,
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
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Failed to fetch',
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

export async function injectedGetStats(id: number) {
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
  const headers = { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" };
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
        error: "Stats Error " + statsRes.status,
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
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Failed to fetch',
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

export async function injectedGetProfile(token?: string | null) {
  try {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (token) {
      headers["x-csrf-token"] = token;
    }

    const response = await fetch('/api/me', {
      method: "GET",
      headers
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function injectedGetStatisticsPage(page: number, size: number) {
  try {
    const url = `/api/backtests/statistics?page=${page}&size=${size}&sort=date,desc`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function injectedCountEntries(payload: any, token: string) {
  try {
    const response = await fetch('/api/bots/entries', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-csrf-token': token,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { success: response.ok, status: response.status, body: json };
  } catch (err: any) {
    return { success: false, status: 0, error: err?.message || 'Failed to fetch' };
  }
}
