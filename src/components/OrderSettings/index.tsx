import { Tabs, Text, ThemeIcon, Group, Paper } from '@mantine/core';
import { IconAbacus, IconAdjustments, IconAntenna } from '@tabler/icons-react';
import type { OrderState, GridMode } from '../../types';
import { SimpleMode } from './SimpleMode';
import { SignalMode } from './SignalMode'; // <-- Импорт
import { SmartMultiSelect } from '../SmartMultiSelect';

interface Props {
  state: OrderState;
  onChange: (newState: OrderState) => void;
}

// ... (функция r и PULL_UP_PRESETS остаются без изменений) ...
const r = (start: number, end: number, step: number) => {
    const result = [];
    for (let i = start; i <= end + 0.00001; i += step) {
      result.push(parseFloat(i.toFixed(2)).toString());
    }
    return result;
  };
  
const PULL_UP_PRESETS = [
    ...r(0.1, 1.5, 0.05),
    ...r(2, 50, 1),
    ...r(60, 200, 10)
].map(val => `${val}%`);


export function OrderSettings({ state, onChange }: Props) {
  
  const handleTabChange = (val: string | null) => {
    if (val) onChange({ ...state, mode: val as GridMode });
  };

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="violet"><IconAbacus size={20}/></ThemeIcon>
        <Text fw={700} size="lg">Ордера сделки</Text>
      </Group>

      {/* PULL UP */}
      <Paper mb="md" p="md" withBorder radius="md" bg="white">
         <SmartMultiSelect
            label="Подтяжка сетки (Pull Up %)"
            description="Смещение сетки за ценой"
            placeholder="Выберите или введите..."
            data={PULL_UP_PRESETS}
            value={state.general.pullUp}
            onChange={(v) => onChange({
              ...state,
              general: { ...state.general, pullUp: v }
            })}
          />
      </Paper>

      <Tabs value={state.mode} onChange={handleTabChange} variant="outline" radius="md">
        <Tabs.List>
          <Tabs.Tab value="SIMPLE" leftSection={<IconAbacus size={16}/>}>
            Простой
          </Tabs.Tab>
          <Tabs.Tab value="CUSTOM" leftSection={<IconAdjustments size={16}/>} disabled>
            Свой (Скоро)
          </Tabs.Tab>
          <Tabs.Tab value="SIGNAL" leftSection={<IconAntenna size={16}/>}>
            Сигнал
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="SIMPLE" pt="xs">
          <SimpleMode 
            config={state.simple} 
            onChange={(newSimple) => onChange({ ...state, simple: newSimple })} 
          />
        </Tabs.Panel>

        <Tabs.Panel value="SIGNAL" pt="xs">
          <SignalMode 
            config={state.signal} 
            onChange={(newSignal) => onChange({ ...state, signal: newSignal })} 
          />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}