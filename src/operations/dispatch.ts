import { OpError, OpErrorCode, toOpErrorPayload } from '../mcp-bridge/errors';
import { getConnection, listTabs } from './connectionOps';
import { getLogs } from './diagnosticsOps';
import { getBatch, listBatches, listResults } from './resultsOps';
import { getSettings, getStatus, ping } from './settingsOps';
import { getTemplate, listTemplates } from './templateOps';

type Handler = (params?: unknown) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  veles_ping: async () => ping(),
  veles_get_status: async () => getStatus(),
  veles_get_connection: async () => getConnection(),
  veles_list_tabs: async () => listTabs(),
  veles_list_batches: async (params) => listBatches(params as { limit?: unknown }),
  veles_get_batch: async (params) => getBatch(params as { batchId?: unknown }),
  veles_list_results: async (params) =>
    listResults(params as { batchId?: unknown; limit?: unknown; offset?: unknown }),
  veles_list_templates: async (params) => listTemplates(params as { limit?: unknown }),
  veles_get_template: async (params) =>
    getTemplate(params as { templateId?: unknown; id?: unknown }),
  veles_get_settings: async () => getSettings(),
  veles_get_logs: async (params) => getLogs(params as { limit?: unknown; days?: unknown })
};

export const PHASE_A_METHODS = Object.freeze(Object.keys(handlers));

export async function dispatch(method: string, params?: unknown): Promise<unknown> {
  const handler = handlers[method];
  if (!handler) {
    throw new OpError(
      OpErrorCode.UNKNOWN_METHOD,
      `Unknown or unsupported method in Phase A: ${method}`,
      { method }
    );
  }
  return handler(params);
}

export async function dispatchSafe(
  method: string,
  params?: unknown
): Promise<{ ok: true; result: unknown } | { ok: false; error: ReturnType<typeof toOpErrorPayload> }> {
  try {
    const result = await dispatch(method, params);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: toOpErrorPayload(error) };
  }
}
