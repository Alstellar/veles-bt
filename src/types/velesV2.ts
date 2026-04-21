/**
 * Veles API V2 Types
 * Types for the new backtest engine API (/api/backtests/v2/)
 */

import type { VelesConfigPayload, VelesCondition, BacktestStats } from './veles';

/**
 * V2 API Configuration Payload
 * Used for POST /api/backtests/v2/
 */
export interface VelesConfigPayloadV2 extends VelesConfigPayload {
  id: number | null;
  apiKey: number;
}

export type VelesConditionV2 = VelesCondition;

/**
 * V2 API Status Response
 * GET /api/backtests/{id}
 */
export interface VelesStatusResponseV2 {
  id: number;
  status: 'CREATED' | 'PENDING' | 'STARTED' | 'FINISHED' | 'ERROR' | 'FAILED';
  error?: string;
  progress?: number;
}

/**
 * V2 API Stats Response
 * GET /api/backtests/{id}/stats
 */
export type VelesStatsResponseV2 = BacktestStats;

/**
 * API Version enum for tracking which API was used
 */
export type ApiVersion = 'v1' | 'v2';

/**
 * Batch runtime API version flag
 * Stored in BatchRuntime to determine which service to use for resume
 */
export interface BatchRuntimeApiVersion {
  apiVersion: ApiVersion;
  v2IntervalSeconds?: number;
}
