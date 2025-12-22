import { Paper, Group, Text, ThemeIcon, SegmentedControl, Stack, Divider, Center } from '@mantine/core';
import { IconCash, IconAbacus, IconAdjustments, IconAntenna } from '@tabler/icons-react';
import { ProfitSingle } from './ProfitSingle';
import { ProfitCustom } from './ProfitCustom';
import type { ExitConfig, ProfitMode } from '../../types';

interface Props {
  config: ExitConfig;
  onChange: (cfg: ExitConfig) => void;
}

export function ExitSettings({ config, onChange }: Props) {

  const handleModeChange = (val: string) => {
    onChange({ ...config, profitMode: val as ProfitMode });
  };

  return (
    <Paper p={0} bg="transparent">
      
      {/* Общий заголовок Блока */}
      <Group mb="xs">
        <ThemeIcon variant="light" color="teal"><IconCash size={20}/></ThemeIcon>
        <Text fw={700} size="lg">Выход из сделки</Text>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Stack gap="md">
            
            {/* Блок Тейк-профит */}
            <Stack gap="xs">
                <Text fw={700} size="md">Тейк-профит</Text>

                <SegmentedControl
                    value={config.profitMode}
                    onChange={handleModeChange}
                    data={[
                        { 
                            label: (
                                <Center style={{ gap: 8 }}>
                                    {/* ИСПРАВЛЕНО: IconAbacus вместо IconFence */}
                                    <IconAbacus size={16} />
                                    <span>Простой</span>
                                </Center>
                            ), 
                            value: 'SINGLE' 
                        },
                        { 
                            label: (
                                <Center style={{ gap: 8 }}>
                                    <IconAdjustments size={16} />
                                    <span>Свой</span>
                                </Center>
                            ), 
                            value: 'MULTIPLE' 
                        },
                        { 
                            label: (
                                <Center style={{ gap: 8 }}>
                                    <IconAntenna size={16} />
                                    <span>Сигнал</span>
                                </Center>
                            ), 
                            value: 'SIGNAL', 
                            disabled: true 
                        },
                    ]}
                    size="sm"
                    w="fit-content"
                />
            </Stack>
            
            <Divider color="gray.2" />

            {/* Контент */}
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
            </div>

        </Stack>
      </Paper>
    </Paper>
  );
}