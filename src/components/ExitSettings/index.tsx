import { Paper, Group, Text, ThemeIcon, Stack, Divider, Tabs } from '@mantine/core';
import { IconCash } from '@tabler/icons-react';
import { ProfitSingle } from './ProfitSingle';
import { ProfitCustom } from './ProfitCustom';
import { ProfitSignal } from './ProfitSignal';
import { StopLoss } from './StopLoss';
import type { ExitConfig, ProfitMode, Condition } from '../../types';
import type { SignalProbeRequestType, SignalProbeViewState } from '../../services/SignalProbeService';

interface Props {
  config: ExitConfig;
  onChange: (cfg: ExitConfig) => void;
  resolveSignalProbeState?: (
    scope: string,
    variant: Condition,
    requestType: SignalProbeRequestType
  ) => SignalProbeViewState;
  onSignalProbeRequest?: (
    scope: string,
    variant: Condition,
    requestType: SignalProbeRequestType
  ) => void;
  onSignalProbeDirty?: (scope: string, variantId: string) => void;
  hiddenProfitModes?: ProfitMode[];
  stopLossHideSignalMode?: boolean;
}

export function ExitSettings({
  config,
  onChange,
  resolveSignalProbeState,
  onSignalProbeRequest,
  onSignalProbeDirty,
  hiddenProfitModes = [],
  stopLossHideSignalMode = false
}: Props) {
  const allProfitModes: { value: ProfitMode; label: string }[] = [
    { value: 'SINGLE', label: 'Простой' },
    { value: 'MULTIPLE', label: 'Свой' },
    { value: 'SIGNAL', label: 'Сигнал' },
  ];

  const availableProfitModes = allProfitModes.filter(m => !hiddenProfitModes.includes(m.value));

  const handleModeChange = (val: string | null) => {
    if (!val) return;
    const mode = val as ProfitMode;
    if (availableProfitModes.some(m => m.value === mode)) {
      onChange({ ...config, profitMode: mode });
    }
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
                {availableProfitModes.map(m => (
                  <Tabs.Tab key={m.value} value={m.value}>{m.label}</Tabs.Tab>
                ))}
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

              {config.profitMode === 'MULTIPLE' && availableProfitModes.some(m => m.value === 'MULTIPLE') && (
                <ProfitCustom
                  config={config.profitMultiple}
                  onChange={(multiple) => onChange({ ...config, profitMultiple: multiple })}
                />
              )}

              {config.profitMode === 'SIGNAL' && availableProfitModes.some(m => m.value === 'SIGNAL') && (
                <ProfitSignal
                  config={config.profitSignal}
                  onChange={(signal) => onChange({ ...config, profitSignal: signal })}
                  probeScope="profit_signal"
                  resolveSignalProbeState={resolveSignalProbeState}
                  onSignalProbeRequest={onSignalProbeRequest}
                  onSignalProbeDirty={onSignalProbeDirty}
                />
              )}
            </div>
          </Stack>

            <StopLoss
              config={config.stopLoss}
              onChange={(sl) => onChange({ ...config, stopLoss: sl })}
              probeScope="stop_loss"
              resolveSignalProbeState={resolveSignalProbeState}
              onSignalProbeRequest={onSignalProbeRequest}
              onSignalProbeDirty={onSignalProbeDirty}
              hideSignalMode={stopLossHideSignalMode}
            />
        </Stack>
      </Paper>
    </Paper>
  );
}
