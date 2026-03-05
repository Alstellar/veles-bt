// src/services/VelesInjections.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function injectedRunTest(payload: any, token: string) {
  try {
    const response = await fetch('/api/backtests/', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-csrf-token": token,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { success: response.ok, status: response.status, body: json };
  } catch (err: any) {
    return { success: false, status: 0, error: err.message };
  }
}

export async function injectedValidateSymbols(payload: any, token: string) {
  try {
    const response = await fetch('/api/bots/validate/symbols', {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-csrf-token": token,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    const successful = Array.isArray(body?.successful)
      ? body.successful.filter((s: unknown) => typeof s === 'string')
      : [];
    const failed = Array.isArray(body?.failed)
      ? body.failed.filter((s: unknown) => typeof s === 'string')
      : [];

    return {
      success: response.ok,
      status: response.status,
      body,
      successful,
      failed,
      error: response.ok ? undefined : (body?.message || text || `HTTP ${response.status}`)
    };
  } catch (err: any) {
    return { success: false, status: 0, successful: [], failed: [], error: err.message };
  }
}

export async function injectedGetApiKeys(token: string) {
  try {
    const response = await fetch('/api/api-keys?size=100&sort=createdAt,desc', {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-csrf-token": token,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    const content = Array.isArray(body?.content) ? body.content : [];
    const items = content
      .map((entry: any) => ({
        id: Number(entry?.id),
        exchange: typeof entry?.exchange === 'string' ? entry.exchange : ''
      }))
      .filter((entry: { id: number; exchange: string }) => Number.isFinite(entry.id) && entry.id > 0 && entry.exchange.length > 0);

    return {
      success: response.ok,
      status: response.status,
      body,
      items,
      error: response.ok ? undefined : (body?.message || text || `HTTP ${response.status}`)
    };
  } catch (err: any) {
    return { success: false, status: 0, body: null, items: [], error: err.message };
  }
}

export async function injectedCheckStatus(id: number, token: string) {
  try {
    const response = await fetch(`/api/backtests/${id}`, {
      method: "GET",
      headers: { "Accept": "application/json", "x-csrf-token": token, "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function injectedGetStats(id: number) {
  try {
    const statsRes = await fetch(`/api/backtests/statistics/${id}`, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    if (!statsRes.ok) return { success: false, error: "Stats Error " + statsRes.status };
    const statsData = await statsRes.json();
    const shareToken = statsData.slug || statsData.code || null;
    return { success: true, stats: statsData, shareToken };
  } catch (e: any) { return { success: false, error: e.message }; }
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
