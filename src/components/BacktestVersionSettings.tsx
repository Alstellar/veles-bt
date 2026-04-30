import { Paper, Group, ThemeIcon, Text, Select, NumberInput, SimpleGrid, Stack, Title } from '@mantine/core';
import { IconVersions } from '@tabler/icons-react';
import type { BacktestVersion } from '../types';
import { DEFAULT_TEST_QUEUE, MAX_V2_TEST_QUEUE, MIN_TEST_QUEUE, clampV2TestQueue } from '../config/backtestQueue';

interface Props {
  backtestVersion: BacktestVersion;
  onBacktestVersionChange: (version: BacktestVersion) => void;
  testQueue: number;
  onTestQueueChange: (queue: number) => void;
  testIntervalSeconds: number;
  onTestIntervalChange: (seconds: number) => void;
  headerVariant?: 'default' | 'section';
  titleClassName?: string;
}

export function BacktestVersionSettings({
  backtestVersion,
  onBacktestVersionChange,
  testQueue,
  onTestQueueChange,
  testIntervalSeconds,
  onTestIntervalChange,
  headerVariant = 'default',
  titleClassName
}: Props) {
  const isV2 = backtestVersion === 'v2';

  const controls = (
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
              onTestQueueChange(DEFAULT_TEST_QUEUE);
            }
          }}
          allowDeselect={false}
        />

        <NumberInput
          label="Очередь тестов"
          value={isV2 ? clampV2TestQueue(testQueue) : DEFAULT_TEST_QUEUE}
          min={MIN_TEST_QUEUE}
          max={MAX_V2_TEST_QUEUE}
          step={1}
          disabled={!isV2}
          onChange={(value) => {
            if (!isV2) return;
            const next = typeof value === 'string' ? parseInt(value, 10) : value;
            if (!Number.isFinite(next)) return;
            onTestQueueChange(clampV2TestQueue(next));
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
  );

  if (headerVariant === 'section') {
    return (
      <Paper p={0} bg="transparent">
        <Stack gap="md">
          <Title order={3} className={titleClassName}>Режим бектестов</Title>
          {controls}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="grape"><IconVersions size={20} /></ThemeIcon>
        <Text fw={700} size="lg">Режим бектестов</Text>
      </Group>

      {controls}
    </Paper>
  );
}
