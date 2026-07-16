import { StorageService } from '../services/StorageService';
import { getMcpSettings, getMcpStatus } from '../bridge/mcpSettings';
import { PROTOCOL_VERSION } from '../bridge/protocol';

function getExtensionVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

export async function getStatus() {
  const mcpSettings = await getMcpSettings();
  const mcpStatus = await getMcpStatus();
  return {
    extensionVersion: getExtensionVersion(),
    protocolVersion: PROTOCOL_VERSION,
    mcp: {
      enabled: mcpSettings.enabled,
      port: mcpSettings.port,
      connected: mcpStatus.connected,
      lastError: mcpStatus.lastError,
      lastConnectedAt: mcpStatus.lastConnectedAt,
      lastDisconnectedAt: mcpStatus.lastDisconnectedAt
    }
  };
}

export async function ping() {
  return {
    ok: true,
    extensionVersion: getExtensionVersion(),
    protocolVersion: PROTOCOL_VERSION,
    ts: Date.now()
  };
}

export async function getSettings() {
  const [v2IntervalSeconds, backtestVersion, testQueue, mcpSettings] = await Promise.all([
    StorageService.getV2IntervalSeconds(),
    StorageService.getBacktestVersion(),
    StorageService.getTestQueue(),
    getMcpSettings()
  ]);

  return {
    v2IntervalSeconds,
    backtestVersion,
    testQueue,
    mcp: {
      enabled: mcpSettings.enabled,
      port: mcpSettings.port
      // token intentionally omitted
    }
  };
}
