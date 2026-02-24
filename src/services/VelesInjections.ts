// src/services/VelesInjections.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function injectedRunTest(payload: any, token: string) {
  try {
    const response = await fetch("https://veles.finance/api/backtests/", {
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

export async function injectedCheckStatus(id: number, token: string) {
  try {
    const response = await fetch(`https://veles.finance/api/backtests/${id}`, {
      method: "GET",
      headers: { "Accept": "application/json", "x-csrf-token": token, "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function injectedGetStats(id: number) {
  try {
    const statsRes = await fetch(`https://veles.finance/api/backtests/statistics/${id}`, {
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

    const response = await fetch("https://veles.finance/api/me", {
      method: "GET",
      headers
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function injectedGetStatisticsPage(page: number, size: number) {
  try {
    const url = `https://veles.finance/api/backtests/statistics?page=${page}&size=${size}&sort=date,desc`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.ok) return { success: true, data: await response.json() };
    return { success: false, error: response.status };
  } catch (e: any) { return { success: false, error: e.message }; }
}
