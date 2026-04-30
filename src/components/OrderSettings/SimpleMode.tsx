import { SimpleGrid, Switch, Paper, Group, Text } from '@mantine/core';
import { SweepNumericParamEditor } from '../SweepNumericParamEditor';
import type { OrderSimpleConfig, OrderSimpleSweepConfig, SweepNumericParam } from '../../types';
import { createSweepNumericParam, expandSweepNumericParam } from '../../utils/sweepParams';
import { VELES_SIMPLE_SWEEP_PRESETS } from '../../config/velesSweepPresets';

interface Props {
  config: OrderSimpleConfig;
  onChange: (cfg: OrderSimpleConfig) => void;
}

type SweepKey = keyof OrderSimpleSweepConfig;

const SIMPLE_SWEEP_META: Record<SweepKey, { fallback: string; integer?: boolean }> = {
  orders: { fallback: '10', integer: true },
  martingale: { fallback: '5' },
  indent: { fallback: '0.2' },
  overlap: { fallback: '15' },
  logarithmicFactor: { fallback: '2.1' }
};

const SIMPLE_SWEEP_PRESETS: Record<SweepKey, readonly string[]> = VELES_SIMPLE_SWEEP_PRESETS;

function getSimpleSweep(config: OrderSimpleConfig): OrderSimpleSweepConfig {
  return {
    orders: config.sweep?.orders ?? createSweepNumericParam(config.orders, SIMPLE_SWEEP_META.orders.fallback),
    martingale: config.sweep?.martingale ?? createSweepNumericParam(config.martingale, SIMPLE_SWEEP_META.martingale.fallback),
    indent: config.sweep?.indent ?? createSweepNumericParam(config.indent, SIMPLE_SWEEP_META.indent.fallback),
    overlap: config.sweep?.overlap ?? createSweepNumericParam(config.overlap, SIMPLE_SWEEP_META.overlap.fallback),
    logarithmicFactor: config.sweep?.logarithmicFactor
      ?? createSweepNumericParam(config.logarithmicFactor, SIMPLE_SWEEP_META.logarithmicFactor.fallback)
  };
}

export function SimpleMode({ config, onChange }: Props) {
  const sweep = getSimpleSweep(config);

  const update = <K extends keyof OrderSimpleConfig>(key: K, value: OrderSimpleConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateSweep = (key: SweepKey, value: SweepNumericParam) => {
    const nextSweep = { ...sweep, [key]: value };
    const values = expandSweepNumericParam(value, {
      integer: SIMPLE_SWEEP_META[key].integer,
      allowedValues: SIMPLE_SWEEP_PRESETS[key]
    });

    onChange({
      ...config,
      [key]: values,
      sweep: nextSweep
    });
  };

  return (
    <Paper p="md" withBorder bg="white">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <SweepNumericParamEditor
          label="Сетка ордеров"
          placeholder="Например: 5, 10, 15"
          value={sweep.orders}
          onChange={(value) => updateSweep('orders', value)}
          integer
          presetValues={SIMPLE_SWEEP_PRESETS.orders}
        />

        <SweepNumericParamEditor
          label="% Мартингейла"
          placeholder="Например: 3, 5, 8"
          value={sweep.martingale}
          onChange={(value) => updateSweep('martingale', value)}
          presetValues={SIMPLE_SWEEP_PRESETS.martingale}
        />

        <SweepNumericParamEditor
          label="Отступ (%)"
          placeholder="Например: 0.2, 0.3, 0.5"
          value={sweep.indent}
          onChange={(value) => updateSweep('indent', value)}
          presetValues={SIMPLE_SWEEP_PRESETS.indent}
        />

        <SweepNumericParamEditor
          label="Перекрытие (%)"
          placeholder="Например: 10, 15, 20"
          value={sweep.overlap}
          onChange={(value) => updateSweep('overlap', value)}
          presetValues={SIMPLE_SWEEP_PRESETS.overlap}
        />
      </SimpleGrid>

      <Paper mt="md" p="xs" bg="gray.0" radius="sm">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Group justify="space-between" align="center" style={{ minHeight: 72 }}>
            <Text size="sm" fw={500}>Логарифмическое распределение</Text>
            <Switch
              checked={config.logarithmicEnabled}
              onChange={(event) => update('logarithmicEnabled', event.currentTarget.checked)}
              size="md"
            />
          </Group>

          {config.logarithmicEnabled ? (
            <SweepNumericParamEditor
              label="Коэффициент"
              placeholder="Например: 1.5, 2.1"
              value={sweep.logarithmicFactor}
              onChange={(value) => updateSweep('logarithmicFactor', value)}
              presetValues={SIMPLE_SWEEP_PRESETS.logarithmicFactor}
            />
          ) : (
            <div />
          )}
        </SimpleGrid>
      </Paper>
    </Paper>
  );
}
