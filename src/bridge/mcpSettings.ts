import { DEFAULT_MCP_PORT } from './protocol';

const SETTINGS_KEY = 'veles_mcp_settings_v1';
const STATUS_KEY = 'veles_mcp_status_v1';

export interface McpSettings {
  enabled: boolean;
  port: number;
  token: string;
}

export interface McpRuntimeStatus {
  connected: boolean;
  lastError: string | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  extensionVersion: string | null;
  updatedAt: number;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  port: DEFAULT_MCP_PORT,
  token: ''
};

export const DEFAULT_MCP_STATUS: McpRuntimeStatus = {
  connected: false,
  lastError: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  extensionVersion: null,
  updatedAt: 0
};

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve(undefined);
      return;
    }
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function normalizeSettings(raw?: Partial<McpSettings> | null): McpSettings {
  const port = Number(raw?.port);
  return {
    enabled: Boolean(raw?.enabled),
    port: Number.isFinite(port) && port > 0 && port <= 65535 ? Math.floor(port) : DEFAULT_MCP_PORT,
    token: typeof raw?.token === 'string' ? raw.token : ''
  };
}

export async function getMcpSettings(): Promise<McpSettings> {
  const raw = await storageGet<Partial<McpSettings>>(SETTINGS_KEY);
  return normalizeSettings(raw);
}

export async function setMcpSettings(settings: McpSettings): Promise<void> {
  await storageSet(SETTINGS_KEY, normalizeSettings(settings));
}

export async function getMcpStatus(): Promise<McpRuntimeStatus> {
  const raw = await storageGet<Partial<McpRuntimeStatus>>(STATUS_KEY);
  if (!raw) return { ...DEFAULT_MCP_STATUS };
  return {
    connected: Boolean(raw.connected),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    lastConnectedAt: typeof raw.lastConnectedAt === 'number' ? raw.lastConnectedAt : null,
    lastDisconnectedAt: typeof raw.lastDisconnectedAt === 'number' ? raw.lastDisconnectedAt : null,
    extensionVersion: typeof raw.extensionVersion === 'string' ? raw.extensionVersion : null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  };
}

export async function setMcpStatus(patch: Partial<McpRuntimeStatus>): Promise<void> {
  const current = await getMcpStatus();
  const next: McpRuntimeStatus = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  await storageSet(STATUS_KEY, next);
}

export { SETTINGS_KEY, STATUS_KEY };
