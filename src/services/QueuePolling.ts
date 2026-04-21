/**
 * Queue polling service
 * Логика polling-а статусов активных тестов
 */

import type { QueueItem } from '../hooks/useBacktestQueue';
import { isUnauthorizedError, extractErrorMessage } from '../utils/QueueUtils';
import { isFailedToFetchError } from './QueueRetryPolicy';

/**
 * Interval for checking active test statuses (ms)
 */
export const STATUS_POLL_INTERVAL_MS = 5000;

/**
 * Maximum test duration in minutes before timeout
 */
export const MAX_TEST_DURATION_MINUTES = 60;

/**
 * Maximum test duration in milliseconds
 */
export const MAX_TEST_DURATION_MS = MAX_TEST_DURATION_MINUTES * 60 * 1000;

/**
 * Maximum concurrent tests running at once
 */
export const MAX_CONCURRENT_TESTS = 5;

/**
 * Wait chunk size for polling loops (ms)
 */
export const WAIT_CHUNK_MS = 250;

/**
 * Lock heartbeat interval in milliseconds
 * How often we refresh the lock to keep it alive
 */
export const LOCK_HEARTBEAT_MS = 2000;

/**
 * Warning threshold for detecting frozen execution (ms)
 * If a wait chunk takes longer than this, we warn about possible inactivity
 */
export const FREEZE_WARN_THRESHOLD_MS = 60000;

/**
 * Result of status check operation
 */
export interface StatusCheckResult {
  /** Whether status check succeeded */
  success: boolean;
  /** Status data if available */
  data?: {
    status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'FAILED';
    error?: string;
  };
  /** Error message if check failed */
  error?: string;
}

/**
 * Polling state for tracking active runs
 */
export interface PollingState {
  /** Active run states keyed by index */
  activeRuns: Map<number, {
    velesId: number;
    testName: string;
    launchedAt: number;
    launchAttemptStartedAt: number;
  }>;
  /** Status network retry attempts by index */
  statusNetworkRetryAttempts: Map<number, number>;
  /** Status network retry timestamps by index */
  statusNetworkRetryAt: Map<number, number>;
}

/**
 * Checks if a test has exceeded maximum duration
 * @param launchedAt - Timestamp when test was launched
 * @returns True if test should be marked as timeout
 */
export function isTestTimeout(launchedAt: number): boolean {
  return Date.now() - launchedAt > MAX_TEST_DURATION_MS;
}

/**
 * Gets timeout message for a test
 * @returns Formatted timeout message
 */
export function getTimeoutMessage(): string {
  return `TIMEOUT: тест не завершился за ${MAX_TEST_DURATION_MINUTES} минут`;
}

/**
 * Checks if status check should be retried
 * @param index - Queue item index
 * @param state - Polling state
 * @returns True if should skip this index due to retry wait
 */
export function shouldSkipStatusRetry(index: number, state: PollingState): boolean {
  const retryAt = state.statusNetworkRetryAt.get(index) ?? 0;
  return retryAt > 0 && Date.now() < retryAt;
}

/**
 * Handles network error during status check
 * @param index - Queue item index
 * @param error - Error that occurred
 * @param state - Polling state to update
 * @returns Object with stop reason and message if should stop, null otherwise
 */
export function handleStatusNetworkError(
  index: number,
  error: unknown,
  state: PollingState
): { forcedStopReason: string; forcedStopMessage: string } | null {
  const rawMsg = extractErrorMessage(error);

  if (isFailedToFetchError(rawMsg)) {
    const attempts = (state.statusNetworkRetryAttempts.get(index) ?? 0) + 1;
    state.statusNetworkRetryAttempts.set(index, attempts);

    if (attempts >= 10) { // NETWORK_MAX_RETRY_ATTEMPTS
      return {
        forcedStopReason: 'runtime_error',
        forcedStopMessage: 'Сеть не доступна более 10 мин.'
      };
    }

    state.statusNetworkRetryAt.set(index, Date.now() + 60000); // NETWORK_RETRY_WAIT_MS
    return null;
  }

  return null;
}

/**
 * Checks if unauthorized error occurred during status check
 * @param error - Error that occurred
 * @returns True if 401/unauthorized error
 */
export function isStatusUnauthorizedError(error: unknown): boolean {
  const rawMsg = extractErrorMessage(error);
  return isUnauthorizedError(rawMsg);
}

/**
 * Determines final status from Veles response
 * @param statusStr - Raw status string from Veles
 * @returns Normalized QueueItem status
 */
export function normalizeVelesStatus(statusStr: string | undefined): QueueItem['status'] {
  if (statusStr === 'FINISHED') return 'FINISHED';
  if (statusStr === 'ERROR' || statusStr === 'FAILED') return 'ERROR';
  return 'RUNNING';
}

/**
 * Clears retry state for a specific index
 * @param index - Queue item index
 * @param state - Polling state to update
 */
export function clearStatusNetworkRetry(index: number, state: PollingState): void {
  state.statusNetworkRetryAttempts.delete(index);
  state.statusNetworkRetryAt.delete(index);
}