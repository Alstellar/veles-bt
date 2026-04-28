import { Paper, Group, ThemeIcon, Text, Select, NumberInput, SimpleGrid } from '@mantine/core';
import { IconVersions } from '@tabler/icons-react';
import type { BacktestVersion } from '../types';

interface Props {
  backtestVersion: BacktestVersion;
  onBacktestVersionChange: (version: BacktestVersion) => void;
  testQueue: number;
  onTestQueueChange: (queue: number) => void;
  testIntervalSeconds: number;
  onTestIntervalChange: (seconds: number) => void;
}

export function BacktestVersionSettings({
  backtestVersion,
  onBacktestVersionChange,
  testQueue,
  onTestQueueChange,
  testIntervalSeconds,
  onTestIntervalChange
}: Props) {
  const isV2 = backtestVersion === 'v2';

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="grape"><IconVersions size={20} /></ThemeIcon>
        <Text fw={700} size="lg">Режим бектестов</Text>
      </Group>

      <Paper p="md" withBorder radius="md" bg="white">
        <SimpleGrid cols={3} spacing="xs">
          <Select
            label="Версия бектестов"
            data={[
              { value: 'v1', label: 'Бектесты 1.0' },
              { value: 'v2', label: 'Бектесты 2.0' }
            ]}
            value={backtestVersion}
            onChange={(value) => {
              const next = value === 'v2' ? 'v2' : 'v1';
              onBacktestVersionChange(next);
              if (next === 'v1') {
                onTestIntervalChange(31);
                onTestQueueChange(5);
              }
            }}
            allowDeselect={false}
          />

          <NumberInput
            label="Очередь тестов"
            value={isV2 ? Math.min(10, Math.max(1, testQueue)) : 5}
            min={1}
            max={10}
            step={1}
            disabled={!isV2}
            onChange={(value) => {
              if (!isV2) return;
              const next = typeof value === 'string' ? parseInt(value, 10) : value;
              if (!Number.isFinite(next)) return;
              const clamped = Math.max(1, Math.min(10, next));
              onTestQueueChange(clamped);
            }}
          />

          <NumberInput
            label="Интервал тестов (сек)"
            value={isV2 ? testIntervalSeconds : 31}
            min={1}
            max={120}
            step={1}
            disabled={!isV2}
            onChange={(value) => {
              const next = typeof value === 'string' ? parseInt(value, 10) : value;
              if (!Number.isFinite(next) || next < 1) return;
              onTestIntervalChange(next);
            }}
          />
        </SimpleGrid>
      </Paper>
    </Paper>
  );
}
