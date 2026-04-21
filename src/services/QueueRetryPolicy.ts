/**
 * Queue retry policy and error classification
 * Управление retry-логикой для различных типов ошибок
 */

/**
 * Retry wait time when hitting rate limits
 */
export const RETRY_WAIT_MS = 60000;

/**
 * Maximum connection retry attempts before giving up
 */
export const RETRY_MAX_ATTEMPTS = 3;

/**
 * Minimum interval between test launches (rate limiting)
 * Default: 31000ms (31 seconds)
 */
export const MIN_TEST_INTERVAL_MS = 31000;
export let V2_MIN_TEST_INTERVAL_MS = 5000;

export function setMinTestInterval(ms: number) {
  V2_MIN_TEST_INTERVAL_MS = Math.max(1000, ms);
}

export function getMinTestInterval(): number {
  return V2_MIN_TEST_INTERVAL_MS;
}

/**
 * Cooldown period after receiving HTTP 429
 */
export const RETRY_429_COOLDOWN_MS = 35000;

/**
 * Wait time before retrying network failures
 */
export const NETWORK_RETRY_WAIT_MS = 60000;

/**
 * Maximum network retry attempts for status checks
 */
export const NETWORK_MAX_RETRY_ATTEMPTS = 10;

/**
 * Parsed API error structure with normalized fields
 */
export interface ParsedApiError {
  /** Raw error string from API */
  raw: string;
  /** Lowercase combined normalized message */
  normalized: string;
  /** HTTP status code if available */
  status: number | null;
  /** Error message from API */
  message: string;
  /** Error type from API */
  error: string;
  /** API endpoint path */
  path: string;
}

/**
 * Type of retry trigger
 */
export type LaunchRetryReason = 'RATE_LIMIT_429' | 'QUEUE_LIMIT_412' | 'NETWORK_FAILED_FETCH' | 'SERVER_5XX';

/**
 * State for managing launch retries
 */
export interface LaunchRetryState {
  /** Queue item index being retried */
  index: number;
  /** Reason for retry */
  reason: LaunchRetryReason;
  /** Current attempt number */
  attempts: number;
  /** Timestamp when next retry is allowed */
  nextRetryAt: number;
  /** Block launch until active runs fall below this number */
  waitForActiveBelow: number | null;
}

/**
 * Parses raw error message into structured ParsedApiError
 * Attempts JSON parsing first, then falls back to regex extraction
 * @param rawMessage - Raw error message string
 * @returns Structured error information
 */
export function parseApiError(rawMessage: string): ParsedApiError {
  const raw = String(rawMessage ?? '');
  let status: number | null = null;
  let message = '';
  let error = '';
  let path = '';

  try {
    const parsed = JSON.parse(raw) as {
      status?: unknown;
      message?: unknown;
      error?: unknown;
      path?: unknown;
    };
    const parsedStatus = Number(parsed.status);
    if (Number.isFinite(parsedStatus)) status = parsedStatus;
    if (typeof parsed.message === 'string') message = parsed.message;
    if (typeof parsed.error === 'string') error = parsed.error;
    if (typeof parsed.path === 'string') path = parsed.path;
  } catch {
    const jsonStatusMatch = raw.match(/"status"\s*:\s*(\d{3})/);
    const parenStatusMatch = raw.match(/\((\d{3})\)/);
    const numericStatusMatch = raw.match(/\b([45]\d{2})\b/);
    const statusCandidate = jsonStatusMatch?.[1] || parenStatusMatch?.[1] || numericStatusMatch?.[1];
    if (statusCandidate) {
      const parsedStatus = Number(statusCandidate);
      if (Number.isFinite(parsedStatus)) status = parsedStatus;
    }
  }

  const normalized = `${raw} ${error} ${message}`.toLowerCase();
  return { raw, normalized, status, message, error, path };
}

/**
 * Checks if parsed error is a rate limit (HTTP 429)
 * @param parsed - Parsed API error
 * @returns True if rate limited
 */
export function isRateLimit429(parsed: ParsedApiError): boolean {
  return parsed.status === 429 || parsed.normalized.includes('too many requests');
}

/**
 * Checks if parsed error is queue limit (HTTP 412)
 * Queue limit means too many tests running in Veles
 * @param parsed - Parsed API error
 * @returns True if queue is full
 */
export function isQueueLimit412(parsed: ParsedApiError): boolean {
  if (parsed.status !== 412) return false;

  return (
    parsed.normalized.includes('достигнут лимит') ||
    parsed.normalized.includes('пожалуйста, попробуйте позже') ||
    parsed.normalized.includes('queue is full') ||
    parsed.normalized.includes('queue limit') ||
    parsed.normalized.includes('limit reached')
  );
}

/**
 * Checks if parsed error is validation failure (HTTP 412 but not queue limit)
 * @param parsed - Parsed API error
 * @returns True if validation error
 */
export function isValidation412(parsed: ParsedApiError): boolean {
  return parsed.status === 412 && !isQueueLimit412(parsed);
}

/**
 * Checks if parsed error indicates server error (5XX range)
 * @param parsed - Parsed API error
 * @returns True if server error
 */
export function isServer5xx(parsed: ParsedApiError): boolean {
  return parsed.status !== null && parsed.status >= 500 && parsed.status < 600;
}

/**
 * Checks if error message indicates network failure
 * Common in browser when connection is lost
 * @param rawMessage - Raw error message
 * @returns True if network error
 */
export function isFailedToFetchError(rawMessage: string): boolean {
  const normalized = rawMessage.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed')
  );
}

/**
 * Determines retry reason from parsed error
 * @param parsed - Parsed API error
 * @returns LaunchRetryReason or null if not retryable
 */
export function getRetryReason(parsed: ParsedApiError): LaunchRetryReason | null {
  if (isRateLimit429(parsed)) return 'RATE_LIMIT_429';
  if (isQueueLimit412(parsed)) return 'QUEUE_LIMIT_412';
  if (isServer5xx(parsed)) return 'SERVER_5XX';
  return null;
}

/**
 * Checks if launch should be blocked based on retry state
 * @param now - Current timestamp
 * @param state - Current retry state
 * @returns True if launch is blocked
 */
export function isLaunchRetryBlocked(now: number, state: LaunchRetryState | null): boolean {
  if (!state) return false;
  return state.nextRetryAt > now;
}

/**
 * Gets wait time in milliseconds before next launch attempt
 * @param reason - Type of retry reason
 * @returns Wait time in ms
 */
export function getRetryWaitMs(reason: LaunchRetryReason): number {
  switch (reason) {
    case 'RATE_LIMIT_429':
      return RETRY_429_COOLDOWN_MS;
    case 'NETWORK_FAILED_FETCH':
      return NETWORK_RETRY_WAIT_MS;
    case 'SERVER_5XX':
    case 'QUEUE_LIMIT_412':
    default:
      return RETRY_WAIT_MS;
  }
}
