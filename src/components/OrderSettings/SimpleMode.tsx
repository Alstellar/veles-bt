import { SimpleGrid, Switch, Paper, Group, Text } from '@mantine/core';
import { MultiInput } from '../MultiInput';
import type { OrderSimpleConfig } from '../../types';

interface Props {
  config: OrderSimpleConfig;
  onChange: (cfg: OrderSimpleConfig) => void;
}

export function SimpleMode({ config, onChange }: Props) {
  const update = (key: keyof OrderSimpleConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <Paper p="md" withBorder bg="white">
      <SimpleGrid cols={2} spacing="md">
        <MultiInput
          label="Сетка ордеров"
          placeholder="Например: 20"
          value={config.orders}
          onChange={(v) => update('orders', v)}
        />

        <MultiInput
          label="% Мартингейла"
          placeholder="Например: 5"
          value={config.martingale}
          onChange={(v) => update('martingale', v)}
        />

        <MultiInput
          label="Отступ (%)"
          placeholder="Например: 0.5"
          value={config.indent}
          onChange={(v) => update('indent', v)}
        />

        <MultiInput
          label="Перекрытие (%)"
          placeholder="Например: 20"
          value={config.overlap}
          onChange={(v) => update('overlap', v)}
        />
      </SimpleGrid>

      <Paper mt="md" p="xs" bg="gray.0" radius="sm">
        <SimpleGrid cols={2} spacing="md">
          <Group justify="space-between" align="center" style={{ height: '100%' }}>
            <Text size="sm" fw={500}>Логарифмическое распределение</Text>
            <Switch
              checked={config.logarithmicEnabled}
              onChange={(e) => update('logarithmicEnabled', e.currentTarget.checked)}
              size="md"
            />
          </Group>

          {config.logarithmicEnabled ? (
            <MultiInput
              placeholder="Коэффициенты, например: 1.5"
              value={config.logarithmicFactor}
              onChange={(v) => update('logarithmicFactor', v)}
            />
          ) : (
            <div />
          )}
        </SimpleGrid>
      </Paper>
    </Paper>
  );
}
