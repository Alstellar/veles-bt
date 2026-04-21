/**
 * Veles API V2 Injections
 * Injection functions for the new backtest engine API (/api/backtests/v2/)
 */

export async function injectedRunTestV2(payload: unknown, token: string) {
  try {
    const response = await fetch('/api/backtests/v2/', {
      method: 'POST',
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
  } catch (err: unknown) {
    return { success: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function injectedCheckStatusV2(id: number, token: string) {
  try {
    const response = await fetch(`/api/backtests/${id}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-csrf-token': token,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    return { success: false, error: response.status };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function injectedGetStatsV2(id: number) {
  try {
    const statsRes = await fetch(`/api/backtests/statistics/${id}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!statsRes.ok) return { success: false, error: 'Stats Error ' + statsRes.status };
    const statsData = await statsRes.json();
    const shareToken = statsData.slug || statsData.code || null;
    return { success: true, stats: statsData, shareToken };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}