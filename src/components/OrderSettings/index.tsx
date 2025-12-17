import { Tabs, Text, ThemeIcon, Group, Paper, Select } from '@mantine/core';
import { IconAbacus, IconAdjustments, IconAntenna } from '@tabler/icons-react';
import type { OrderState, GridMode } from '../../types';
import { SimpleMode } from './SimpleMode';
import { SignalMode } from './SignalMode';
import { CustomMode } from './CustomMode';

interface Props {
  state: OrderState;
  onChange: (newState: OrderState) => void;
}

// Генератор пресетов (как и был)
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

  // Хелпер для изменения поля general
  const updateGeneral = (key: keyof typeof state.general, value: any) => {
    onChange({
        ...state,
        general: { ...state.general, [key]: value }
    });
  };

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="violet"><IconAbacus size={20}/></ThemeIcon>
        <Text fw={700} size="lg">Ордера сделки</Text>
      </Group>

      {/* PULL UP: Обычный Select */}
      <Paper mb="md" p="md" withBorder radius="md" bg="white">
         <Select
            label="Подтяжка сетки (%)"
            description="Смещение сетки за ценой"
            placeholder="Выберите значение"
            data={PULL_UP_PRESETS}
            searchable
            value={state.general.pullUp[0] || ''} 
            onChange={(val) => updateGeneral('pullUp', val ? [val] : [])}
            allowDeselect={false}
         />
      </Paper>

      <Tabs value={state.mode} onChange={handleTabChange} variant="outline" radius="md">
        <Tabs.List>
          <Tabs.Tab value="SIMPLE" leftSection={<IconAbacus size={16}/>}>
            Простой
          </Tabs.Tab>
          
          {/* РЕЖИМ СВОЙ ТЕПЕРЬ АКТИВЕН */}
          <Tabs.Tab value="CUSTOM" leftSection={<IconAdjustments size={16}/>}>
            Свой
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

        {/* ПАНЕЛЬ CUSTOM */}
        <Tabs.Panel value="CUSTOM" pt="xs">
           <CustomMode
             config={state.custom}
             onChange={(newCustom) => onChange({ ...state, custom: newCustom })}
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