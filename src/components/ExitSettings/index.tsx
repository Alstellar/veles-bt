import { Paper, Group, Text, ThemeIcon, Stack, Divider, Tabs } from '@mantine/core';
import { IconCash } from '@tabler/icons-react';
import { ProfitSingle } from './ProfitSingle';
import { ProfitCustom } from './ProfitCustom';
import { ProfitSignal } from './ProfitSignal';
import { StopLoss } from './StopLoss';
import type { ExitConfig, ProfitMode } from '../../types';

interface Props {
  config: ExitConfig;
  onChange: (cfg: ExitConfig) => void;
}

export function ExitSettings({ config, onChange }: Props) {
  const handleModeChange = (val: string | null) => {
    if (!val) return;
    onChange({ ...config, profitMode: val as ProfitMode });
  };

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="teal"><IconCash size={20} /></ThemeIcon>
        <Text fw={700} size="lg">Выход из сделки</Text>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Stack gap="xl">
          <Stack gap="xs">
            <Text fw={700} size="md">Тейк-профит</Text>

            <Tabs value={config.profitMode} onChange={handleModeChange} variant="outline" radius="md">
              <Tabs.List grow>
                <Tabs.Tab value="SINGLE">Простой</Tabs.Tab>
                <Tabs.Tab value="MULTIPLE">Свой</Tabs.Tab>
                <Tabs.Tab value="SIGNAL">Сигнал</Tabs.Tab>
              </Tabs.List>
            </Tabs>

            <Divider color="gray.2" />

            <div>
              {config.profitMode === 'SINGLE' && (
                <ProfitSingle
                  config={config.profitSingle}
                  onChange={(single) => onChange({ ...config, profitSingle: single })}
                />
              )}

              {config.profitMode === 'MULTIPLE' && (
                <ProfitCustom
                  config={config.profitMultiple}
                  onChange={(multiple) => onChange({ ...config, profitMultiple: multiple })}
                />
              )}

              {config.profitMode === 'SIGNAL' && (
                <ProfitSignal
                  config={config.profitSignal}
                  onChange={(signal) => onChange({ ...config, profitSignal: signal })}
                />
              )}
            </div>
          </Stack>

          <StopLoss
            config={config.stopLoss}
            onChange={(sl) => onChange({ ...config, stopLoss: sl })}
          />
        </Stack>
      </Paper>
    </Paper>
  );
}
