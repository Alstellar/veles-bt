export const OpErrorCode = {
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE',
  NOT_ENABLED: 'NOT_ENABLED',
  NO_VELES_TAB: 'NO_VELES_TAB',
  NO_TOKEN: 'NO_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  UNKNOWN_METHOD: 'UNKNOWN_METHOD',
  INTERNAL: 'INTERNAL',
  TIMEOUT: 'TIMEOUT'
} as const;

export type OpErrorCodeName = (typeof OpErrorCode)[keyof typeof OpErrorCode];

export interface OpErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class OpError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'OpError';
    this.code = code;
    this.details = details;
  }

  toPayload(): OpErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

export function toOpErrorPayload(error: unknown): OpErrorPayload {
  if (error instanceof OpError) {
    return error.toPayload();
  }
  if (error instanceof Error) {
    return {
      code: OpErrorCode.INTERNAL,
      message: error.message || 'Internal error'
    };
  }
  return {
    code: OpErrorCode.INTERNAL,
    message: String(error)
  };
}
