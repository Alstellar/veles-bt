import { Tabs, Text, ThemeIcon, Group, Paper, Select } from '@mantine/core';
import { IconAbacus } from '@tabler/icons-react';
import type { OrderState, GridMode } from '../../types';
import type { Condition } from '../../types';
import { SimpleMode } from './SimpleMode';
import { SignalMode } from './SignalMode';
import { CustomMode } from './CustomMode';
import type { SignalProbeRequestType, SignalProbeViewState } from '../../services/SignalProbeService';

interface Props {
  state: OrderState;
  onChange: (newState: OrderState) => void;
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
}

// Генератор пресетов
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
].map(val => ({ value: val, label: `${val}%` })); // <--- ИСПРАВЛЕНО: Value чистое, Label с %


export function OrderSettings({
  state,
  onChange,
  resolveSignalProbeState,
  onSignalProbeRequest,
  onSignalProbeDirty
}: Props) {
  
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

  // Валидация: Если поле пустое, считаем это ошибкой
  const pullUpError = !state.general.pullUp ? "Обязательное поле" : null;

  return (
    <Paper p={0} bg="transparent">
      <Group mb="xs">
        <ThemeIcon variant="light" color="violet"><IconAbacus size={20}/></ThemeIcon>
        <Text fw={700} size="lg">Ордера сделки</Text>
      </Group>

      {/* PULL UP: Одиночное значение */}
      <Paper mb="md" p="md" withBorder radius="md" bg="white">
         <Select
            label="Подтяжка сетки (%)"
            description="Смещение сетки за ценой"
            placeholder="Выберите значение (0.2%)"
            data={PULL_UP_PRESETS}
            searchable
            value={state.general.pullUp} 
            onChange={(val) => updateGeneral('pullUp', val || '')}
            allowDeselect={false}
            error={pullUpError} 
         />
      </Paper>

      <Tabs value={state.mode} onChange={handleTabChange} variant="outline" radius="md">
        <Tabs.List grow>
          <Tabs.Tab value="SIMPLE">
            Простой
          </Tabs.Tab>
          
          <Tabs.Tab value="CUSTOM">
            Свой
          </Tabs.Tab>
          
          <Tabs.Tab value="SIGNAL">
            Сигнал
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="SIMPLE" pt="xs">
          <SimpleMode 
            config={state.simple} 
            onChange={(newSimple) => onChange({ ...state, simple: newSimple })} 
          />
        </Tabs.Panel>

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
            resolveSignalProbeState={resolveSignalProbeState}
            onSignalProbeRequest={onSignalProbeRequest}
            onSignalProbeDirty={onSignalProbeDirty}
          />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
