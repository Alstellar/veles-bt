export const DEFAULT_TEST_QUEUE = 5;
export const MIN_TEST_QUEUE = 1;
export const MAX_V2_TEST_QUEUE = 5;
export const debug_mode = false;

export function clampV2TestQueue(queue: number): number {
  if (!Number.isFinite(queue)) return DEFAULT_TEST_QUEUE;
  return Math.max(MIN_TEST_QUEUE, Math.min(MAX_V2_TEST_QUEUE, Math.trunc(queue)));
}
