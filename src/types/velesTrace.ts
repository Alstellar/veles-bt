export interface VelesHttpTrace {
  method: string;
  url: string;
  request: {
    headers?: Record<string, unknown>;
    body?: unknown;
  };
  response?: {
    status: number;
    ok: boolean;
    headers?: Record<string, string>;
    bodyText?: string;
    bodyJson?: unknown;
  };
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  durationMs: number;
}

export function maskTraceHeaders(headers?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!headers) return undefined;

  const masked: Record<string, unknown> = {};
  Object.entries(headers).forEach(([key, value]) => {
    const lowered = key.toLowerCase();
    masked[key] = lowered.includes('token') ||
      lowered.includes('authorization') ||
      lowered.includes('cookie') ||
      lowered.includes('csrf') ||
      lowered.includes('secret')
      ? '[masked]'
      : value;
  });

  return masked;
}
