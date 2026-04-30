import { MultiSelect, Paper, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import type { SweepNumericParam } from '../types';
import { getSweepNumericParamError, parseSweepList } from '../utils/sweepParams';

const MODE_OPTIONS = [
  { value: 'LIST', label: 'Список значений' },
  { value: 'RANGE', label: 'Диапазон' }
];

interface Props {
  label: string;
  description?: string;
  placeholder?: string;
  value: SweepNumericParam;
  onChange: (value: SweepNumericParam) => void;
  disabled?: boolean;
  integer?: boolean;
  presetValues?: readonly string[];
  allowNull?: boolean;
  nullLabel?: string;
  rangeFallbackFrom?: string;
  rangeFallbackTo?: string;
  rangeFallbackStep?: string;
}

export function SweepNumericParamEditor({
  label,
  description,
  placeholder,
  value,
  onChange,
  disabled = false,
  integer = false,
  presetValues,
  allowNull = false,
  nullLabel = 'Отключено',
  rangeFallbackFrom,
  rangeFallbackTo,
  rangeFallbackStep
}: Props) {
  const selectedListValues = parseSweepList(value.listValues, integer, allowNull);
  const numericListData = (presetValues ?? selectedListValues.filter((item) => item !== 'null')).map((preset) => ({
    value: preset,
    label: preset
  }));
  const listData = allowNull
    ? [{ value: 'null', label: nullLabel }, ...numericListData]
    : numericListData;
  const paramError = getSweepNumericParamError(value, {
    integer,
    allowedValues: presetValues,
    allowNull
  });
  const listError = value.mode === 'LIST' ? paramError ?? undefined : undefined;
  const rangeError = value.mode === 'RANGE' ? paramError ?? undefined : undefined;

  return (
    <Paper withBorder p="sm" radius="md" bg={disabled ? 'gray.0' : 'white'}>
      <Stack gap="xs">
        <Select
          label={label}
          description={description}
          data={MODE_OPTIONS}
          value={value.mode}
          onChange={(mode) => {
            if (!mode) return;
            const nextMode = mode as SweepNumericParam['mode'];
            if (nextMode === 'RANGE') {
              onChange({
                ...value,
                mode: nextMode,
                rangeFrom: value.rangeFrom.toLowerCase() === 'null' ? rangeFallbackFrom ?? '' : value.rangeFrom,
                rangeTo: value.rangeTo.toLowerCase() === 'null' ? rangeFallbackTo ?? '' : value.rangeTo,
                rangeStep: value.rangeStep.toLowerCase() === 'null' ? rangeFallbackStep ?? '1' : value.rangeStep
              });
              return;
            }
            onChange({ ...value, mode: nextMode });
          }}
          disabled={disabled}
          allowDeselect={false}
        />

        {value.mode === 'LIST' ? (
          <MultiSelect
            label="Значения"
            placeholder={placeholder ?? 'Выберите значения'}
            data={listData}
            value={selectedListValues}
            onChange={(values) => onChange({ ...value, listValues: values.join(', ') })}
            disabled={disabled}
            searchable
            clearable
            hidePickedOptions
            error={listError}
          />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            <TextInput
              label="От"
              value={value.rangeFrom}
              onChange={(event) => onChange({ ...value, rangeFrom: event.currentTarget.value })}
              disabled={disabled}
              error={rangeError}
            />
            <TextInput
              label="До"
              value={value.rangeTo}
              onChange={(event) => onChange({ ...value, rangeTo: event.currentTarget.value })}
              disabled={disabled}
              error={rangeError ? ' ' : undefined}
            />
            <TextInput
              label="Шаг"
              value={value.rangeStep}
              onChange={(event) => onChange({ ...value, rangeStep: event.currentTarget.value })}
              disabled={disabled}
              error={rangeError ? ' ' : undefined}
            />
          </SimpleGrid>
        )}
      </Stack>
    </Paper>
  );
}
