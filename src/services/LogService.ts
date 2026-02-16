type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  id: string;
  ts: string;
  dayKey: string;
  level: LogLevel;
  source: string;
  event: string;
  sessionId: string;
  batchId?: string;
  message?: string;
  context?: unknown;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
}

interface LogsMeta {
  schemaVersion: 1;
  dayKeys: string[];
}

const LOG_PREFIX = 'vh_logs_';
const META_KEY = 'vh_logs_meta_v1';
const SETTINGS_KEY = 'vh_logs_settings_v1';
const MAX_DAYS_TO_KEEP = 2;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_FIELD_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_NESTING_DEPTH = 6;

function nowIso(): string {
  return new Date().toISOString();
}

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function serializeError(error: unknown): LogEntry['error'] {
  const normalizeMessage = (input: unknown): string => {
    const raw = String(input ?? '');
    const trimmed = raw.length > MAX_FIELD_LENGTH ? `${raw.slice(0, MAX_FIELD_LENGTH)}...[truncated]` : raw;
    // Защита от вставки больших минифицированных кусков кода в message.
    if (
      trimmed.includes('function ') ||
      trimmed.includes('=>') ||
      trimmed.includes('const ') ||
      trimmed.includes('var ') ||
      trimmed.includes('let ')
    ) {
      return '[minified-source-omitted]';
    }
    return trimmed;
  };

  if (error instanceof Error) {
    return {
      name: error.name,
      message: normalizeMessage(error.message),
      stack: error.stack?.slice(0, MAX_FIELD_LENGTH)
    };
  }
  return { message: normalizeMessage(error) };
}

function estimateBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(String(value)).length;
  }
}

function toStringSafe(value: unknown): string {
  if (typeof value === 'function') {
    return `[function ${value.name || 'anonymous'}]`;
  }
  try {
    const str = String(value);
    return str.length > MAX_FIELD_LENGTH ? `${str.slice(0, MAX_FIELD_LENGTH)}...[truncated]` : str;
  } catch {
    return '[unstringifiable]';
  }
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_NESTING_DEPTH) return '[depth-limited]';

  if (typeof value === 'string') {
    return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}...[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) sliced.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`);
    return sliced;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    Object.keys(source).forEach((key) => {
      const lowered = key.toLowerCase();
      if (
        lowered.includes('token') ||
        lowered.includes('authorization') ||
        lowered.includes('cookie') ||
        lowered.includes('csrf') ||
        lowered.includes('password')
      ) {
        output[key] = '[masked]';
        return;
      }
      output[key] = sanitizeValue(source[key], depth + 1);
    });
    return output;
  }

  return toStringSafe(value);
}

export class LogService {
  private static writeQueue: Promise<void> = Promise.resolve();
  private static sessionId = '';
  private static handlersInstalled = false;
  private static verboseCache: boolean | null = null;

  static initialize(): void {
    if (!this.sessionId) {
      this.sessionId = generateId();
    }
    if (!this.handlersInstalled && typeof window !== 'undefined') {
      this.installGlobalErrorHandlers();
      this.handlersInstalled = true;
    }
    void this.info('app', 'app.initialized', {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'
    });
  }

  static getSessionId(): string {
    if (!this.sessionId) this.sessionId = generateId();
    return this.sessionId;
  }

  private static enqueueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private static async storageGet<T>(key: string): Promise<T | undefined> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => resolve(result[key] as T | undefined));
      });
    }
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private static async storageSet(key: string, value: unknown): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  private static async storageRemove(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, () => resolve());
      });
    }
    localStorage.removeItem(key);
  }

  private static async getMeta(): Promise<LogsMeta> {
    const meta = await this.storageGet<LogsMeta>(META_KEY);
    if (!meta || !Array.isArray(meta.dayKeys)) {
      return { schemaVersion: 1, dayKeys: [] };
    }
    return { schemaVersion: 1, dayKeys: [...meta.dayKeys].sort() };
  }

  private static async getSettings(): Promise<{ verboseLogging: boolean }> {
    const settings = await this.storageGet<{ verboseLogging?: boolean }>(SETTINGS_KEY);
    return { verboseLogging: settings?.verboseLogging ?? true };
  }

  private static async setSettings(settings: { verboseLogging: boolean }): Promise<void> {
    await this.storageSet(SETTINGS_KEY, settings);
  }

  static async isVerboseLogging(): Promise<boolean> {
    if (this.verboseCache !== null) return this.verboseCache;
    const settings = await this.getSettings();
    this.verboseCache = settings.verboseLogging;
    return settings.verboseLogging;
  }

  static async setVerboseLogging(enabled: boolean): Promise<void> {
    this.verboseCache = enabled;
    await this.setSettings({ verboseLogging: enabled });
    await this.log({
      level: 'warn',
      source: 'settings',
      event: 'logging_mode.changed',
      context: { verboseLogging: enabled }
    });
  }

  private static async shouldPersist(level: LogLevel, event: string): Promise<boolean> {
    const verbose = await this.isVerboseLogging();
    if (verbose) return true;

    if (level === 'warn' || level === 'error' || level === 'critical') return true;
    if (level === 'debug') return false;

    // В обычном режиме храним только ключевые info-события.
    const infoAllowlist = new Set([
      'app.initialized',
      'queue.started',
      'queue.finished',
      'test.start',
      'test.finished',
      'bug_report.exported'
    ]);
    return infoAllowlist.has(event);
  }

  private static async setMeta(meta: LogsMeta): Promise<void> {
    await this.storageSet(META_KEY, { schemaVersion: 1, dayKeys: [...new Set(meta.dayKeys)].sort() });
  }

  private static async getDayEntries(dayKey: string): Promise<LogEntry[]> {
    const key = `${LOG_PREFIX}${dayKey}`;
    const entries = await this.storageGet<LogEntry[]>(key);
    return Array.isArray(entries) ? entries : [];
  }

  private static async setDayEntries(dayKey: string, entries: LogEntry[]): Promise<void> {
    const key = `${LOG_PREFIX}${dayKey}`;
    await this.storageSet(key, entries);
  }

  private static async dropDay(dayKey: string): Promise<void> {
    await this.storageRemove(`${LOG_PREFIX}${dayKey}`);
  }

  private static async rotateByDays(meta: LogsMeta): Promise<LogsMeta> {
    const sorted = [...meta.dayKeys].sort();
    if (sorted.length <= MAX_DAYS_TO_KEEP) return { schemaVersion: 1, dayKeys: sorted };

    const toDelete = sorted.slice(0, sorted.length - MAX_DAYS_TO_KEEP);
    for (const dayKey of toDelete) {
      await this.dropDay(dayKey);
    }
    return { schemaVersion: 1, dayKeys: sorted.slice(-MAX_DAYS_TO_KEEP) };
  }

  private static async enforceSizeLimit(meta: LogsMeta): Promise<LogsMeta> {
    const sorted = [...meta.dayKeys].sort();
    if (sorted.length === 0) return meta;

    let total = 0;
    const daySizes = new Map<string, number>();

    for (const dayKey of sorted) {
      const entries = await this.getDayEntries(dayKey);
      const size = estimateBytes(entries);
      daySizes.set(dayKey, size);
      total += size;
    }

    let nextDays = [...sorted];
    while (total > MAX_TOTAL_BYTES && nextDays.length > 1) {
      const oldest = nextDays[0];
      total -= daySizes.get(oldest) || 0;
      await this.dropDay(oldest);
      nextDays = nextDays.slice(1);
    }

    if (total > MAX_TOTAL_BYTES && nextDays.length === 1) {
      const lastDay = nextDays[0];
      const entries = await this.getDayEntries(lastDay);
      while (entries.length > 1 && estimateBytes(entries) > MAX_TOTAL_BYTES) {
        entries.shift();
      }
      await this.setDayEntries(lastDay, entries);
    }

    return { schemaVersion: 1, dayKeys: nextDays };
  }

  static async log(input: {
    level: LogLevel;
    source: string;
    event: string;
    batchId?: string;
    message?: string;
    context?: unknown;
    error?: unknown;
  }): Promise<void> {
    if (!(await this.shouldPersist(input.level, input.event))) return;

    const ts = nowIso();
    const entry: LogEntry = {
      id: generateId(),
      ts,
      dayKey: dayKeyFromIso(ts),
      level: input.level,
      source: input.source,
      event: input.event,
      sessionId: this.getSessionId(),
      batchId: input.batchId,
      message: input.message ? toStringSafe(input.message) : undefined,
      context: sanitizeValue(input.context),
      error: input.error ? serializeError(input.error) : undefined
    };

    await this.enqueueWrite(async () => {
      const meta = await this.getMeta();
      const dayEntries = await this.getDayEntries(entry.dayKey);
      dayEntries.push(entry);
      await this.setDayEntries(entry.dayKey, dayEntries);

      const nextMeta: LogsMeta = {
        schemaVersion: 1,
        dayKeys: [...new Set([...meta.dayKeys, entry.dayKey])].sort()
      };

      const rotated = await this.rotateByDays(nextMeta);
      const sizeChecked = await this.enforceSizeLimit(rotated);
      await this.setMeta(sizeChecked);
    });
  }

  static async debug(source: string, event: string, context?: unknown, batchId?: string): Promise<void> {
    await this.log({ level: 'debug', source, event, context, batchId });
  }

  static async info(source: string, event: string, context?: unknown, batchId?: string): Promise<void> {
    await this.log({ level: 'info', source, event, context, batchId });
  }

  static async warn(source: string, event: string, context?: unknown, batchId?: string): Promise<void> {
    await this.log({ level: 'warn', source, event, context, batchId });
  }

  static async error(source: string, event: string, error: unknown, context?: unknown, batchId?: string): Promise<void> {
    await this.log({ level: 'error', source, event, error, context, batchId });
  }

  static async critical(source: string, event: string, error: unknown, context?: unknown, batchId?: string): Promise<void> {
    await this.log({ level: 'critical', source, event, error, context, batchId });
  }

  static async captureError(error: unknown, meta?: { source?: string; event?: string; context?: unknown }): Promise<void> {
    await this.error(meta?.source || 'runtime', meta?.event || 'runtime.error', error, meta?.context);
  }

  static async getLogs(days = MAX_DAYS_TO_KEEP): Promise<LogEntry[]> {
    await this.writeQueue;
    const meta = await this.getMeta();
    const dayKeys = [...meta.dayKeys].sort().slice(-Math.max(1, days));
    const all: LogEntry[] = [];
    for (const dayKey of dayKeys) {
      const entries = await this.getDayEntries(dayKey);
      all.push(...entries);
    }
    return all.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }

  static async exportReportText(): Promise<string> {
    const logs = await this.getLogs(MAX_DAYS_TO_KEEP);
    const manifestVersion =
      typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : 'unknown';
    const verbose = await this.isVerboseLogging();

    const lines: string[] = [];
    lines.push('Veles Helper Bug Report');
    lines.push(`GeneratedAt: ${nowIso()}`);
    lines.push(`ExtensionVersion: ${manifestVersion}`);
    lines.push(`SessionId: ${this.getSessionId()}`);
    lines.push(`LogsDays: ${MAX_DAYS_TO_KEEP}`);
    lines.push(`VerboseLogging: ${verbose ? 'enabled' : 'disabled'}`);
    lines.push(`Entries: ${logs.length}`);
    lines.push('');
    lines.push('Timeline:');

    logs.forEach((entry) => {
      const base = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.event}`;
      lines.push(base);
      if (entry.batchId) lines.push(`  batchId: ${entry.batchId}`);
      if (entry.message) lines.push(`  message: ${entry.message}`);
      if (entry.context !== undefined) lines.push(`  context: ${JSON.stringify(entry.context)}`);
      if (entry.error) lines.push(`  error: ${JSON.stringify(entry.error)}`);
    });

    return lines.join('\n');
  }

  static async downloadBugReport(): Promise<string> {
    const text = await this.exportReportText();
    const dayKey = dayKeyFromIso(nowIso());
    const filename = `veles_bug_report_${dayKey}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  }

  static installGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      void this.captureError(event.error || event.message, {
        source: 'window',
        event: 'window.error',
        context: {
          message: typeof event.message === 'string'
            ? (event.message.length > 300 ? `${event.message.slice(0, 300)}...[truncated]` : event.message)
            : '[no-message]',
          file: event.filename,
          line: event.lineno,
          column: event.colno
        }
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      void this.captureError(event.reason, {
        source: 'window',
        event: 'window.unhandledrejection'
      });
    });
  }
}
