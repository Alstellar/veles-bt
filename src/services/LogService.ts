type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  id: string;
  seq: number;
  ts: string;
  dayKey: string;
  level: LogLevel;
  source: string;
  event: string;
  sessionId: string;
  batchId?: string;
  runId?: string;
  testId?: string;
  stage?: string;
  code?: string;
  message?: string;
  context?: unknown;
  snapshotId?: string;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
}

interface LogSnapshot {
  id: string;
  ts: string;
  kind: string;
  sessionId: string;
  batchId?: string;
  runId?: string;
  testId?: string;
  data: unknown;
}

interface LogsMeta {
  schemaVersion: 2;
  seq: number;
  dayKeys: string[];
  snapshotKeys: string[];
}

const LOG_PREFIX = 'vh_logs_';
const SNAPSHOT_PREFIX = 'vh_snapshot_';
const META_KEY = 'vh_logs_meta_v2';
const SETTINGS_KEY = 'vh_logs_settings_v1';
const MAX_DAYS_TO_KEEP = 7;
const MAX_SNAPSHOTS_TO_KEEP = 300;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FIELD_LENGTH = 3000;
const MAX_ARRAY_ITEMS = 100;
const MAX_NESTING_DEPTH = 8;

function nowIso(): string {
  return new Date().toISOString();
}

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function generateId(prefix = 'log'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
        lowered.includes('password') ||
        lowered.includes('secret')
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

function serializeError(error: unknown): LogEntry['error'] {
  const normalizeMessage = (input: unknown): string => {
    const raw = String(input ?? '');
    const trimmed = raw.length > MAX_FIELD_LENGTH ? `${raw.slice(0, MAX_FIELD_LENGTH)}...[truncated]` : raw;
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

export class LogService {
  private static writeQueue: Promise<void> = Promise.resolve();
  private static sessionId = '';
  private static handlersInstalled = false;
  private static verboseCache: boolean | null = null;
  private static consolePatched = false;
  private static fetchPatched = false;

  static initialize(): void {
    if (!this.sessionId) {
      this.sessionId = generateId('session');
    }
    if (!this.handlersInstalled && typeof window !== 'undefined') {
      this.installGlobalErrorHandlers();
      this.patchConsole();
      this.patchFetch();
      this.handlersInstalled = true;
    }
    void this.info('app', 'app.initialized', {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      location: typeof window !== 'undefined' ? window.location.href : 'n/a'
    });
  }

  static getSessionId(): string {
    if (!this.sessionId) this.sessionId = generateId('session');
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
    const meta = await this.storageGet<Partial<LogsMeta> & { dayKeys?: string[] }>(META_KEY);
    if (!meta || !Array.isArray(meta.dayKeys)) {
      return { schemaVersion: 2, seq: 0, dayKeys: [], snapshotKeys: [] };
    }
    return {
      schemaVersion: 2,
      seq: typeof meta.seq === 'number' && Number.isFinite(meta.seq) ? Math.max(0, Math.floor(meta.seq)) : 0,
      dayKeys: [...meta.dayKeys].sort(),
      snapshotKeys: Array.isArray(meta.snapshotKeys) ? [...meta.snapshotKeys] : []
    };
  }

  private static async setMeta(meta: LogsMeta): Promise<void> {
    await this.storageSet(META_KEY, {
      schemaVersion: 2,
      seq: Math.max(0, Math.floor(meta.seq)),
      dayKeys: [...new Set(meta.dayKeys)].sort(),
      snapshotKeys: [...new Set(meta.snapshotKeys)]
    });
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
    if (sorted.length <= MAX_DAYS_TO_KEEP) return { ...meta, dayKeys: sorted };

    const toDelete = sorted.slice(0, sorted.length - MAX_DAYS_TO_KEEP);
    for (const dayKey of toDelete) {
      await this.dropDay(dayKey);
    }
    return { ...meta, dayKeys: sorted.slice(-MAX_DAYS_TO_KEEP) };
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

    return { ...meta, dayKeys: nextDays };
  }

  private static async pruneSnapshots(meta: LogsMeta): Promise<LogsMeta> {
    if (meta.snapshotKeys.length <= MAX_SNAPSHOTS_TO_KEEP) return meta;
    const toDelete = meta.snapshotKeys.slice(0, meta.snapshotKeys.length - MAX_SNAPSHOTS_TO_KEEP);
    for (const key of toDelete) {
      await this.storageRemove(key);
    }
    return { ...meta, snapshotKeys: meta.snapshotKeys.slice(-MAX_SNAPSHOTS_TO_KEEP) };
  }

  private static inferBatchId(input: { batchId?: string; context?: unknown }): string | undefined {
    if (input.batchId) return input.batchId;
    if (input.context && typeof input.context === 'object') {
      const batchId = (input.context as { batchId?: unknown }).batchId;
      if (typeof batchId === 'string' && batchId.trim()) return batchId;
    }
    return undefined;
  }

  private static inferRunId(input: { runId?: string; batchId?: string; context?: unknown }): string | undefined {
    if (input.runId) return input.runId;
    const batchId = this.inferBatchId(input);
    if (batchId) return batchId;
    if (input.context && typeof input.context === 'object') {
      const runId = (input.context as { runId?: unknown }).runId;
      if (typeof runId === 'string' && runId.trim()) return runId;
    }
    return undefined;
  }

  static async createSnapshot(
    kind: string,
    data: unknown,
    meta?: { batchId?: string; runId?: string; testId?: string }
  ): Promise<string> {
    const id = generateId('snapshot');
    const payload: LogSnapshot = {
      id,
      ts: nowIso(),
      kind,
      sessionId: this.getSessionId(),
      batchId: meta?.batchId,
      runId: meta?.runId,
      testId: meta?.testId,
      data: sanitizeValue(data)
    };

    await this.enqueueWrite(async () => {
      await this.storageSet(`${SNAPSHOT_PREFIX}${id}`, payload);
      const current = await this.getMeta();
      const next = await this.pruneSnapshots({
        ...current,
        snapshotKeys: [...current.snapshotKeys, `${SNAPSHOT_PREFIX}${id}`]
      });
      await this.setMeta(next);
    });

    return id;
  }

  private static async getSnapshotById(id: string): Promise<LogSnapshot | undefined> {
    return this.storageGet<LogSnapshot>(`${SNAPSHOT_PREFIX}${id}`);
  }

  static async log(input: {
    level: LogLevel;
    source: string;
    event: string;
    batchId?: string;
    runId?: string;
    testId?: string;
    stage?: string;
    code?: string;
    message?: string;
    context?: unknown;
    error?: unknown;
    snapshotId?: string;
  }): Promise<void> {
    if (!(await this.shouldPersist(input.level, input.event))) return;

    const ts = nowIso();
    const sanitizedContext = sanitizeValue(input.context);
    const batchId = this.inferBatchId({ batchId: input.batchId, context: sanitizedContext });
    const runId = this.inferRunId({ runId: input.runId, batchId, context: sanitizedContext });

    await this.enqueueWrite(async () => {
      const meta = await this.getMeta();
      const seq = meta.seq + 1;

      const entry: LogEntry = {
        id: generateId(),
        seq,
        ts,
        dayKey: dayKeyFromIso(ts),
        level: input.level,
        source: input.source,
        event: input.event,
        sessionId: this.getSessionId(),
        batchId,
        runId,
        testId: input.testId,
        stage: input.stage,
        code: input.code,
        message: input.message ? toStringSafe(input.message) : undefined,
        context: sanitizedContext,
        snapshotId: input.snapshotId,
        error: input.error ? serializeError(input.error) : undefined
      };

      const dayEntries = await this.getDayEntries(entry.dayKey);
      dayEntries.push(entry);
      await this.setDayEntries(entry.dayKey, dayEntries);

      const nextMeta: LogsMeta = {
        schemaVersion: 2,
        seq,
        dayKeys: [...new Set([...meta.dayKeys, entry.dayKey])].sort(),
        snapshotKeys: meta.snapshotKeys
      };

      const rotated = await this.rotateByDays(nextMeta);
      const sizeChecked = await this.enforceSizeLimit(rotated);
      const snapshotChecked = await this.pruneSnapshots(sizeChecked);
      await this.setMeta(snapshotChecked);
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
    return all.sort((a, b) => a.seq - b.seq);
  }

  private static buildSummary(logs: LogEntry[]): string[] {
    const lines: string[] = [];
    const byLevel = new Map<LogLevel, number>([
      ['debug', 0],
      ['info', 0],
      ['warn', 0],
      ['error', 0],
      ['critical', 0]
    ]);
    const bySource = new Map<string, number>();
    const byBatch = new Map<string, { total: number; errors: number; critical: number }>();

    for (const entry of logs) {
      byLevel.set(entry.level, (byLevel.get(entry.level) || 0) + 1);
      bySource.set(entry.source, (bySource.get(entry.source) || 0) + 1);
      if (entry.batchId) {
        const current = byBatch.get(entry.batchId) || { total: 0, errors: 0, critical: 0 };
        current.total += 1;
        if (entry.level === 'error') current.errors += 1;
        if (entry.level === 'critical') current.critical += 1;
        byBatch.set(entry.batchId, current);
      }
    }

    lines.push('Summary:');
    lines.push(`  debug=${byLevel.get('debug') ?? 0}`);
    lines.push(`  info=${byLevel.get('info') ?? 0}`);
    lines.push(`  warn=${byLevel.get('warn') ?? 0}`);
    lines.push(`  error=${byLevel.get('error') ?? 0}`);
    lines.push(`  critical=${byLevel.get('critical') ?? 0}`);

    const topSources = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    lines.push('TopSources:');
    if (topSources.length === 0) {
      lines.push('  none');
    } else {
      for (const [source, count] of topSources) {
        lines.push(`  ${source}: ${count}`);
      }
    }

    const troubledBatches = [...byBatch.entries()]
      .filter(([, stats]) => stats.errors > 0 || stats.critical > 0)
      .sort((a, b) => (b[1].critical + b[1].errors) - (a[1].critical + a[1].errors))
      .slice(0, 10);
    lines.push('TroubledBatches:');
    if (troubledBatches.length === 0) {
      lines.push('  none');
    } else {
      for (const [batchId, stats] of troubledBatches) {
        lines.push(`  ${batchId}: total=${stats.total}, error=${stats.errors}, critical=${stats.critical}`);
      }
    }

    return lines;
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
    lines.push(...this.buildSummary(logs));
    lines.push('');
    lines.push('RecentIncidents:');

    const incidents = logs
      .filter((entry) => entry.level === 'error' || entry.level === 'critical')
      .slice(-30);
    if (incidents.length === 0) {
      lines.push('  none');
    } else {
      for (const entry of incidents) {
        lines.push(
          `  [${entry.ts}] [${entry.level.toUpperCase()}] ${entry.source}.${entry.event}` +
          `${entry.batchId ? ` batch=${entry.batchId}` : ''}` +
          `${entry.runId ? ` run=${entry.runId}` : ''}` +
          `${entry.testId ? ` test=${entry.testId}` : ''}` +
          `${entry.code ? ` code=${entry.code}` : ''}` +
          `${entry.stage ? ` stage=${entry.stage}` : ''}`
        );
      }
    }
    lines.push('');
    lines.push('Timeline:');

    for (const entry of logs) {
      const base = `[${entry.ts}] [#${entry.seq}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.event}`;
      lines.push(base);
      if (entry.batchId) lines.push(`  batchId: ${entry.batchId}`);
      if (entry.runId) lines.push(`  runId: ${entry.runId}`);
      if (entry.testId) lines.push(`  testId: ${entry.testId}`);
      if (entry.stage) lines.push(`  stage: ${entry.stage}`);
      if (entry.code) lines.push(`  code: ${entry.code}`);
      if (entry.message) lines.push(`  message: ${entry.message}`);
      if (entry.context !== undefined) lines.push(`  context: ${JSON.stringify(entry.context)}`);
      if (entry.error) lines.push(`  error: ${JSON.stringify(entry.error)}`);
      if (entry.snapshotId) {
        lines.push(`  snapshotId: ${entry.snapshotId}`);
        const snapshot = await this.getSnapshotById(entry.snapshotId);
        if (snapshot) {
          lines.push(`  snapshot.kind: ${snapshot.kind}`);
          lines.push(`  snapshot.ts: ${snapshot.ts}`);
          lines.push(`  snapshot.data: ${JSON.stringify(snapshot.data)}`);
        } else {
          lines.push('  snapshot: [missing]');
        }
      }
    }

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

  private static patchConsole(): void {
    if (this.consolePatched || typeof window === 'undefined') return;
    this.consolePatched = true;

    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);

    console.error = (...args: unknown[]) => {
      void this.log({
        level: 'error',
        source: 'console',
        event: 'console.error',
        context: {
          args: sanitizeValue(args)
        }
      });
      originalError(...args);
    };

    console.warn = (...args: unknown[]) => {
      void this.log({
        level: 'warn',
        source: 'console',
        event: 'console.warn',
        context: {
          args: sanitizeValue(args)
        }
      });
      originalWarn(...args);
    };
  }

  private static patchFetch(): void {
    if (this.fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    this.fetchPatched = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (...args: Parameters<typeof fetch>) => {
      const startedAt = Date.now();
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      try {
        const response = await originalFetch(...args);
        if (!response.ok && url.includes('/api/')) {
          void this.warn('network', 'network.fetch_non_ok', {
            url,
            status: response.status,
            statusText: response.statusText,
            durationMs: Date.now() - startedAt
          });
        }
        return response;
      } catch (error) {
        void this.error('network', 'network.fetch_failed', error, {
          url,
          durationMs: Date.now() - startedAt
        });
        throw error;
      }
    }) as typeof fetch;
  }

  static installGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      void this.captureError(event.error || event.message, {
        source: 'window',
        event: 'window.error',
        context: {
          message: typeof event.message === 'string'
            ? (event.message.length > 400 ? `${event.message.slice(0, 400)}...[truncated]` : event.message)
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

