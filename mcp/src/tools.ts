import type { BridgeServer } from './bridgeServer.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const PHASE_A_TOOLS: ToolDef[] = [
  {
    name: 'veles_ping',
    description: 'Round-trip health check to the Veles Helper extension bridge.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'veles_get_status',
    description: 'Extension version, protocol version, and MCP bridge status flags.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'veles_get_connection',
    description: 'Veles tab/session readiness (requires an open logged-in Veles tab).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'veles_list_tabs',
    description: 'List open browser tabs matching allowed Veles origins.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'veles_list_batches',
    description: 'List local backtest batch history summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max batches to return (default 100, max 200)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'veles_get_batch',
    description: 'Get one batch metadata by id.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string' }
      },
      required: ['batchId'],
      additionalProperties: false
    }
  },
  {
    name: 'veles_list_results',
    description: 'List paginated results for a batch from IndexedDB (default limit 50, max 200).',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' }
      },
      required: ['batchId'],
      additionalProperties: false
    }
  },
  {
    name: 'veles_list_templates',
    description: 'List local strategy templates (summaries).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'veles_get_template',
    description: 'Get a full local template by id.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: { type: 'string' }
      },
      required: ['templateId'],
      additionalProperties: false
    }
  },
  {
    name: 'veles_get_settings',
    description: 'Safe snapshot of extension runtime settings (no secrets).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'veles_get_logs',
    description: 'Recent diagnostic log entries (bounded, max 200).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        days: { type: 'number' }
      },
      additionalProperties: false
    }
  }
];

function toolErrorPayload(error: unknown): { code: string; message: string; details?: unknown } {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown; details?: unknown };
    return {
      code: typeof e.code === 'string' ? e.code : 'INTERNAL',
      message: typeof e.message === 'string' ? e.message : String(error),
      details: e.details
    };
  }
  return { code: 'INTERNAL', message: String(error) };
}

export async function callTool(
  bridge: BridgeServer,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  if (!PHASE_A_TOOLS.some((tool) => tool.name === name)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              code: 'UNKNOWN_METHOD',
              message: `Unknown or unsupported tool in Phase A: ${name}`
            },
            null,
            2
          )
        }
      ]
    };
  }

  try {
    const result = await bridge.call(name, args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    const payload = toolErrorPayload(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }
}
