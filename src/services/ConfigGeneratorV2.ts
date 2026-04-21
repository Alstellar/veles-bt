// src/services/ConfigGeneratorV2.ts

import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from '../types';
import type { VelesConfigPayloadV2 } from '../types/velesV2';
import { ConfigGenerator } from './ConfigGenerator';

export class ConfigGeneratorV2 {
  static generate(
    staticCfg: StaticConfig,
    entryCfg: EntryConfig,
    orderState: OrderState,
    exitCfg: ExitConfig,
    existingBatchId?: string
  ): { configs: VelesConfigPayloadV2[]; batchId: string } {
    const generated = ConfigGenerator.generate(
      staticCfg,
      entryCfg,
      orderState,
      exitCfg,
      existingBatchId
    );

    return {
      batchId: generated.batchId,
      configs: generated.configs.map((config) => ({
        ...config,
        id: null,
        apiKey: 0
      }))
    };
  }
}
