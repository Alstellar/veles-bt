/**
 * Firefox MV3 event pages (and Chrome service workers) are non-persistent.
 * After ~30–90s idle the background context is terminated: long-poll fetch and
 * setTimeout reconnect are wiped. chrome.alarms survive process death and
 * re-wake the script so the MCP bridge can reconnect.
 *
 * Staggered alarms (~every 20s) keep the page from staying dead between Chrome's
 * 1-minute minimum period. Firefox accepts sub-minute periodInMinutes; Chrome
 * may clamp — stagger still helps.
 */

declare const chrome: any;

export const MCP_KEEPALIVE_ALARM_PREFIX = 'veles_mcp_keepalive_';
const ALARM_COUNT = 3;
/** Stagger offsets so something fires ~every 20s within a 1-minute cycle */
const STAGGER_MINUTES = [0.05, 0.35, 0.65];
const PERIOD_MINUTES = 1;

export function isMcpKeepaliveAlarm(name: string): boolean {
  return name.startsWith(MCP_KEEPALIVE_ALARM_PREFIX);
}

export async function startMcpKeepaliveAlarms(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms?.create) {
    return;
  }
  await clearMcpKeepaliveAlarms();
  for (let i = 0; i < ALARM_COUNT; i++) {
    const name = `${MCP_KEEPALIVE_ALARM_PREFIX}${i}`;
    chrome.alarms.create(name, {
      delayInMinutes: STAGGER_MINUTES[i] ?? 0.1 + i * 0.3,
      periodInMinutes: PERIOD_MINUTES
    });
  }
}

export async function clearMcpKeepaliveAlarms(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms?.clear) {
    return;
  }
  for (let i = 0; i < ALARM_COUNT; i++) {
    await new Promise<void>((resolve) => {
      chrome.alarms.clear(`${MCP_KEEPALIVE_ALARM_PREFIX}${i}`, () => resolve());
    });
  }
}
