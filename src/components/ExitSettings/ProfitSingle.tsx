import { Center, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { SweepNumericParamEditor } from '../SweepNumericParamEditor';
import type { ProfitSingleConfig, SweepNumericParam } from '../../types';
import { VELES_TAKE_PROFIT_PRESETS } from '../../config/velesSweepPresets';
import { createSweepNumericParam, expandSweepNumericParam } from '../../utils/sweepParams';

interface Props {
  config: ProfitSingleConfig;
  onChange: (cfg: ProfitSingleConfig) => void;
}

function getProfitSweep(config: ProfitSingleConfig): SweepNumericParam {
  return config.sweep ?? createSweepNumericParam(config.percents, '1');
}

export function ProfitSingle({ config, onChange }: Props) {
  const sweep = getProfitSweep(config);

  const handleSweepChange = (value: SweepNumericParam) => {
    const percents = expandSweepNumericParam(value, {
      allowedValues: VELES_TAKE_PROFIT_PRESETS
    });

    onChange({
      ...config,
      percents,
      sweep: value
    });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Выберите один или несколько вариантов процента профита для перебора.
      </Text>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <SweepNumericParamEditor
          label="Процент профита"
          placeholder="Например: 0.5, 1, 1.5"
          value={sweep}
          onChange={handleSweepChange}
          presetValues={VELES_TAKE_PROFIT_PRESETS}
        />

        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
          <Center h="100%" style={{ alignItems: 'flex-start' }}>
            <TextInput
              label="Валюта профита"
              value="USDT"
              disabled
              size="sm"
              w="100%"
              styles={{ input: { color: 'black', opacity: 0.7, fontWeight: 600 } }}
            />
          </Center>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
