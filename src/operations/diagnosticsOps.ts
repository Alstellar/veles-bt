import { LogService } from '../services/LogService';

const HARD_MAX = 200;
const DEFAULT_LIMIT = 100;

export async function getLogs(params?: { limit?: unknown; days?: unknown }) {
  const rawLimit = typeof params?.limit === 'number' ? params.limit : Number(params?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(HARD_MAX, Math.floor(rawLimit))
    : DEFAULT_LIMIT;

  const rawDays = typeof params?.days === 'number' ? params.days : Number(params?.days);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(14, Math.floor(rawDays)) : 2;

  const logs = await LogService.getLogs(days);
  const sliced = logs.slice(-limit);

  return {
    totalAvailable: logs.length,
    limit,
    days,
    truncated: logs.length > sliced.length,
    entries: sliced.map((entry) => ({
      id: entry.id,
      seq: entry.seq,
      ts: entry.ts,
      level: entry.level,
      source: entry.source,
      event: entry.event,
      batchId: entry.batchId ?? null,
      message: entry.message ?? null,
      context: entry.context ?? null
    }))
  };
}
