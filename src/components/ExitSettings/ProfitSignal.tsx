import {
  Paper, Group, Select, ActionIcon, Text, Stack, TextInput, Collapse, Badge, Button, Tooltip, SimpleGrid
} from '@mantine/core';
import { IconTrash, IconPlus, IconPencil, IconArrowsRightLeft, IconCopy } from '@tabler/icons-react';
import { SignalProbeAction } from '../SignalProbeAction';
import { SweepNumericParamEditor } from '../SweepNumericParamEditor';

import { FILTERS_LIBRARY } from '../../filtersLibrary';
import { PNL_OPTIONS } from '../../utils/profitGen';
import type { IndicatorDef } from '../../filtersLibrary';
import type { Condition, FilterSlot, ProfitSignalConfig, IntervalType, OperationType, SweepNumericParam } from '../../types';
import { normalizeCondition } from '../../services/ConditionNormalizationService';
import { resolveIndicator, toApiIndicatorCode } from '../../utils/indicatorMapping';
import type { SignalProbeRequestType, SignalProbeViewState } from '../../services/SignalProbeService';
import { cloneConditionWithNewId, cloneFilterSlotWithNewIds } from '../../utils/filterClone';
import { createSweepNumericParam, expandSweepNumericParam } from '../../utils/sweepParams';

interface Props {
  config: ProfitSignalConfig;
  onChange: (cfg: ProfitSignalConfig) => void;
  probeScope?: string;
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

const randomId = () => Math.random().toString(36).substr(2, 9);

function getCheckPnlSweep(config: ProfitSignalConfig): SweepNumericParam {
  return config.checkPnlSweep ?? createSweepNumericParam(config.checkPnl, 'null');
}

export function ProfitSignal({
  config,
  onChange,
  probeScope = 'profit_signal',
  resolveSignalProbeState,
  onSignalProbeRequest,
  onSignalProbeDirty
}: Props) {
  const checkPnlSweep = getCheckPnlSweep(config);
  
  const updateConfig = (newSlots: FilterSlot[]) => {
    onChange({ ...config, filterSlots: newSlots });
  };

  const updateCheckPnlSweep = (value: SweepNumericParam) => {
    const checkPnl = expandSweepNumericParam(value, {
      allowedValues: PNL_OPTIONS,
      allowNull: true
    });

    onChange({
      ...config,
      checkPnl,
      checkPnlSweep: value
    });
  };

  const markVariantDirty = (variantId?: string) => {
    if (!variantId) return;
    onSignalProbeDirty?.(probeScope, variantId);
  };

  const addSlot = () => {
    const newSlot: FilterSlot = {
      id: randomId(),
      variants: []
    };
    updateConfig([...config.filterSlots, newSlot]);
  };

  const removeSlot = (slotId: string) => {
    const slot = config.filterSlots.find((s) => s.id === slotId);
    slot?.variants.forEach((variant) => markVariantDirty(variant.id));
    updateConfig(config.filterSlots.filter(s => s.id !== slotId));
  };

  const duplicateSlot = (slotId: string) => {
    const index = config.filterSlots.findIndex((s) => s.id === slotId);
    if (index === -1) return;

    const source = config.filterSlots[index];
    const newSlot = cloneFilterSlotWithNewIds(source);
    const newSlots = [...config.filterSlots];
    newSlots.splice(index + 1, 0, newSlot);
    updateConfig(newSlots);
  };

  const addVariant = (slotId: string) => {
    const newVariant: Condition = normalizeCondition({
      id: randomId(),
      type: 'INDICATOR',
      indicator: 'RSI',
      interval: 'FIVE_MINUTES',
      basic: true,
      closed: true,
      operation: 'GREATER',
      value: '30',
      reverse: false
    });

    const newSlots = config.filterSlots.map(slot => {
      if (slot.id === slotId) {
        return { ...slot, variants: [...slot.variants, newVariant] };
      }
      return slot;
    });
    updateConfig(newSlots);
  };

  const removeVariant = (slotId: string, variantId: string) => {
    markVariantDirty(variantId);
    const newSlots = config.filterSlots.map(slot => {
      if (slot.id === slotId) {
        return { ...slot, variants: slot.variants.filter(v => v.id !== variantId) };
      }
      return slot;
    });
    updateConfig(newSlots);
  };

  const duplicateVariant = (slotId: string, variantId: string) => {
    const newSlots = config.filterSlots.map((slot) => {
      if (slot.id !== slotId) return slot;
      const index = slot.variants.findIndex((v) => v.id === variantId);
      if (index === -1) return slot;

      const source = slot.variants[index];
      const duplicated = cloneConditionWithNewId(source);
      const newVariants = [...slot.variants];
      newVariants.splice(index + 1, 0, duplicated);
      return { ...slot, variants: newVariants };
    });
    updateConfig(newSlots);
  };

  const updateVariant = (slotId: string, variantId: string, field: keyof Condition, value: any) => {
    markVariantDirty(variantId);
    const newSlots = config.filterSlots.map(slot => {
      if (slot.id === slotId) {
        const newVariants = slot.variants.map(v => {
          if (v.id === variantId) return normalizeCondition({ ...v, [field]: value });
          return v;
        });
        return { ...slot, variants: newVariants };
      }
      return slot;
    });
    updateConfig(newSlots);
  };

  const handleValueChange = (slotId: string, variantId: string, text: string) => {
    const sanitized = text.replace(/,/g, '.');
    updateVariant(slotId, variantId, 'value', sanitized);
  };

  const safeLibrary = FILTERS_LIBRARY || {};

  const indicatorOptions = Object.values(safeLibrary).map((ind: IndicatorDef) => ({
    value: ind.code,
    label: ind.label,
  }));

  const intervalOptions: { value: IntervalType; label: string }[] = [
    { value: 'ONE_MINUTE', label: '1m' },
    { value: 'FIVE_MINUTES', label: '5m' },
    { value: 'FIFTEEN_MINUTES', label: '15m' },
    { value: 'THIRTY_MINUTES', label: '30m' },
    { value: 'ONE_HOUR', label: '1h' },
    { value: 'FOUR_HOUR', label: '4h' },
    { value: 'ONE_DAY', label: '1d' },
  ];

  const typeOptions = [
    { value: 'true', label: 'На закрытии' },
    { value: 'false', label: 'В моменте' },
  ];

  const NUMBER_WIDTH = 24; 
  const GAP_WIDTH = 10; 
  const LEFT_OFFSET = NUMBER_WIDTH + GAP_WIDTH;

  return (
    <Stack gap="md">
      
      {/* ПЕРЕБОР СЛОТОВ */}
      <Stack gap="md">
        
        {/* Если пусто */}
        {config.filterSlots.length === 0 && (
            <Paper p="lg" withBorder bg="white" ta="center">
                <Text c="dimmed" mb="sm">Индикаторы выхода не заданы.</Text>
                <Button 
                    variant="light" color="cyan" size="sm" 
                    leftSection={<IconPlus size={16}/>}
                    onClick={addSlot}
                >
                    Добавить фильтр
                </Button>
            </Paper>
        )}

        {config.filterSlots.map((slot, slotIndex) => (
            <Paper 
                key={slot.id} 
                withBorder 
                shadow="sm" 
                radius="md" 
                style={{ overflow: 'hidden' }}
            >
                {/* Шапка группы */}
                <Group justify="space-between" bg="cyan.0" px="md" py={8} style={{ borderBottom: '1px solid #e9ecef' }}>
                    <Group gap="xs">
                        <Badge size="sm" radius="sm" variant="filled" color="cyan">ФИЛЬТР {slotIndex + 1}</Badge>
                        <Text size="xs" c="dimmed" lh={1.2}>
                          Перебор вариантов для этого слота
                        </Text>
                    </Group>
                    <Group gap={4}>
                        <ActionIcon color="blue" variant="subtle" size="sm" onClick={() => duplicateSlot(slot.id)}>
                            <IconCopy size={16} />
                        </ActionIcon>
                        <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeSlot(slot.id)}>
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Group>
                </Group>

                <Stack gap="sm" p="sm" bg="gray.0">
                    
                    {slot.variants.length === 0 && (
                        <Text size="xs" c="dimmed" fs="italic" ta="center" py="xs">
                            Нет индикаторов в группе.
                        </Text>
                    )}

                    {slot.variants.map((variant, vIndex) => {
                          const resolvedIndicator = resolveIndicator(variant.indicator);
                          const settings = resolvedIndicator.settings || { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false };
                          const periodOptions = resolvedIndicator.periods.map((period) => ({
                            value: String(period),
                            label: String(period)
                          }));
                          const showPeriodSelector = periodOptions.length > 0;
                          const selectedPeriodValue = resolvedIndicator.period ? String(resolvedIndicator.period) : null;
                          
                          const showTimeframe = settings.hasTimeframe;
                          const showBasicToggle = settings.allowBasic && (settings.hasValue || settings.hasOperation);
                          const showReverse = settings.hasReverse;
                          const showInputs = (!variant.basic || !settings.allowBasic) && (settings.hasValue || settings.hasOperation);
                          
                          const stringValue = typeof variant.value === 'string' ? variant.value : '';
                          const probeState = resolveSignalProbeState
                            ? resolveSignalProbeState(probeScope, variant, 'CLOSE')
                            : { status: 'idle' as const };

                          return (
                            <Paper key={variant.id} withBorder p="xs" radius="sm" bg="white">
                                <Group align="center" wrap="nowrap" gap="xs">
                                    <Text fw={700} c="dimmed" size="xs" w={NUMBER_WIDTH} ta="center" style={{ lineHeight: 1 }}>
                                        {vIndex + 1}
                                    </Text>
                                    
                                    <Select
                                        placeholder="Индикатор"
                                        data={indicatorOptions}
                                        value={resolvedIndicator.baseCode}
                                        onChange={(v) => updateVariant(slot.id, variant.id!, 'indicator', toApiIndicatorCode(v || undefined))}
                                        searchable allowDeselect={false} style={{ flex: 1 }} size="xs"
                                    />

                                    {showTimeframe && (
                                        <Select
                                            placeholder="ТФ"
                                            data={intervalOptions}
                                            value={variant.interval}
                                            onChange={(v) => updateVariant(slot.id, variant.id!, 'interval', v)}
                                            allowDeselect={false} w={80} size="xs"
                                        />
                                    )}

                                    {showPeriodSelector && (
                                        <Select
                                            placeholder="Период"
                                            data={periodOptions}
                                            value={selectedPeriodValue}
                                            onChange={(v) => updateVariant(slot.id, variant.id!, 'indicator', toApiIndicatorCode(resolvedIndicator.baseCode, v ? Number(v) : null))}
                                            allowDeselect={false}
                                            w={88}
                                            size="xs"
                                        />
                                    )}

                                    <Group gap={4}>
                                            {showReverse && (
                                                <Tooltip label="Реверс">
                                                    <ActionIcon 
                                                        variant={variant.reverse ? "filled" : "light"} 
                                                        color={variant.reverse ? "orange" : "gray"} size="md"
                                                        onClick={() => updateVariant(slot.id, variant.id!, 'reverse', !variant.reverse)}
                                                    >
                                                        <IconArrowsRightLeft size={14} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}

                                            {showBasicToggle && (
                                                <Tooltip label="Настройка">
                                                    <ActionIcon 
                                                        variant={!variant.basic ? "filled" : "light"} 
                                                        color="blue" size="md"
                                                        onClick={() => updateVariant(slot.id, variant.id!, 'basic', !variant.basic)}
                                                    >
                                                        <IconPencil size={14} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}

                                            <SignalProbeAction
                                                state={probeState}
                                                onRequest={() => {
                                                  if (!variant.id) return;
                                                  onSignalProbeRequest?.(probeScope, variant, 'CLOSE');
                                                }}
                                                size="md"
                                            />

                                            <ActionIcon
                                                variant="light"
                                                color="blue"
                                                size="md"
                                                onClick={() => duplicateVariant(slot.id, variant.id!)}
                                            >
                                                <IconCopy size={14} />
                                            </ActionIcon>

                                            <ActionIcon 
                                                variant="light" color="red" size="md"
                                                onClick={() => removeVariant(slot.id, variant.id!)}
                                            >
                                                <IconTrash size={14} />
                                            </ActionIcon>
                                    </Group>
                                </Group>

                                <Collapse in={!!showInputs}>
                                    <Group mt="xs" align="flex-start" grow wrap="nowrap" pl={LEFT_OFFSET}> 
                                            <Select
                                                size="xs" label="Тип"
                                                data={typeOptions}
                                                value={variant.closed ? 'true' : 'false'}
                                                onChange={(v) => updateVariant(slot.id, variant.id!, 'closed', v === 'true')}
                                                allowDeselect={false} disabled
                                            />
                                            {settings.hasOperation && (
                                                <Select
                                                    size="xs" label="Условие"
                                                    data={[{ value: 'GREATER', label: 'Больше' }, { value: 'LESS', label: 'Меньше' }]}
                                                    value={variant.operation}
                                                    onChange={(v) => updateVariant(slot.id, variant.id!, 'operation', v as OperationType)}
                                                    allowDeselect={false} w={100}
                                                />
                                            )}
                                            {settings.hasValue && (
                                                <TextInput
                                                    size="xs" label="Значение" placeholder="0"
                                                    value={stringValue}
                                                    onChange={(e) => handleValueChange(slot.id, variant.id!, e.target.value)}
                                                />
                                            )}
                                    </Group>
                                </Collapse>
                            </Paper>
                          );
                    })}

                    <Button 
                        variant="subtle" size="xs" 
                        leftSection={<IconPlus size={14} />} 
                        onClick={() => addVariant(slot.id)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Добавить индикатор
                    </Button>
                </Stack>
            </Paper>
        ))}
        
        {config.filterSlots.length > 0 && (
             <Button 
                variant="outline" size="sm" 
                leftSection={<IconPlus size={16} />} 
                onClick={addSlot}
                fullWidth
                style={{ borderStyle: 'dashed' }}
                color="cyan"
            >
                Добавить фильтр
            </Button>
        )}
      </Stack>

      {/* НИЖНЯЯ ПАНЕЛЬ: P&L и Валюта */}
      <SimpleGrid cols={2} spacing="md" mt="xs">
         
         {/* Выбор P&L */}
         <Paper withBorder p="sm" bg="gray.0" radius="md">
             <SweepNumericParamEditor
                label="Минимальный P&L"
                description="Выберите варианты для перебора"
                placeholder="Выберите % или 'Отключено'"
                value={checkPnlSweep}
                onChange={updateCheckPnlSweep}
                presetValues={PNL_OPTIONS}
                allowNull
                nullLabel="Отключено"
                rangeFallbackFrom="0.1"
                rangeFallbackTo="10"
                rangeFallbackStep="0.1"
             />
         </Paper>

         {/* Валюта */}
         <Paper withBorder p="sm" bg="gray.0" radius="md">
             <Paper withBorder p="sm" radius="md" bg="white">
              <Group align="flex-start">
                 <TextInput 
                    label="Валюта профита"
                    value="USDT"
                    disabled
                    size="sm"
                    w="100%"
                    styles={{ input: { color: 'black', opacity: 0.7, fontWeight: 600 } }}
                />
              </Group>
             </Paper>
         </Paper>

      </SimpleGrid>

    </Stack>
  );
}
