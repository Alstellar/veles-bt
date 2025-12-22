import { 
  Paper, Group, Text, Switch, MultiSelect, Stack, Select, 
  Collapse, Button, ActionIcon, TextInput, Tooltip, SimpleGrid, Badge 
} from '@mantine/core';
import { 
  IconPlus, IconTrash, IconPencil, IconArrowsRightLeft 
} from '@tabler/icons-react';

import { FILTERS_LIBRARY } from '../../filtersLibrary';
import { STOP_LOSS_OPTIONS, CONDITIONAL_OPTIONS } from '../../utils/profitGen';
import type { IndicatorDef } from '../../filtersLibrary';
import type { StopLossConfig, FilterSlot, Condition, IntervalType, OperationType } from '../../types';

interface Props {
  config: StopLossConfig;
  onChange: (cfg: StopLossConfig) => void;
}

const randomId = () => Math.random().toString(36).substr(2, 9);

export function StopLoss({ config, onChange }: Props) {

  // --- ЛОГИКА СЛОТОВ (ГРУПП) ---
  const updateConfig = (newSlots: FilterSlot[]) => {
    onChange({ ...config, filterSlots: newSlots });
  };

  const addSlot = () => {
    const newSlot: FilterSlot = { id: randomId(), variants: [] };
    updateConfig([...config.filterSlots, newSlot]);
  };

  const removeSlot = (slotId: string) => {
    updateConfig(config.filterSlots.filter(s => s.id !== slotId));
  };

  // --- ЛОГИКА ВАРИАНТОВ ---
  const addVariant = (slotId: string) => {
    const newVariant: Condition = {
      id: randomId(), type: 'INDICATOR', indicator: 'RSI', interval: 'FIVE_MINUTES',
      basic: true, closed: true, operation: 'GREATER', value: '30', reverse: false
    };

    const newSlots = config.filterSlots.map(slot => {
        if (slot.id === slotId) {
            return { ...slot, variants: [...slot.variants, newVariant] };
        }
        return slot;
    });
    updateConfig(newSlots);
  };

  const removeVariant = (slotId: string, variantId: string) => {
    const newSlots = config.filterSlots.map(slot => {
        if (slot.id === slotId) {
            return { ...slot, variants: slot.variants.filter(v => v.id !== variantId) };
        }
        return slot;
    });
    updateConfig(newSlots);
  };

  const updateVariant = (slotId: string, variantId: string, field: keyof Condition, value: any) => {
    const newSlots = config.filterSlots.map(slot => {
        if (slot.id === slotId) {
            const newVariants = slot.variants.map(v => {
                if (v.id === variantId) return { ...v, [field]: value };
                return v;
            });
            return { ...slot, variants: newVariants };
        }
        return slot;
    });
    updateConfig(newSlots);
  };

  // --- UI CONSTANTS ---
  const safeLibrary = FILTERS_LIBRARY || {};
  const indicatorOptions = Object.values(safeLibrary).map((ind: IndicatorDef) => ({ value: ind.code, label: ind.label }));
  const intervalOptions: { value: IntervalType; label: string }[] = [
    { value: 'ONE_MINUTE', label: '1m' }, { value: 'FIVE_MINUTES', label: '5m' },
    { value: 'FIFTEEN_MINUTES', label: '15m' }, { value: 'THIRTY_MINUTES', label: '30m' },
    { value: 'ONE_HOUR', label: '1h' }, { value: 'FOUR_HOUR', label: '4h' }, { value: 'ONE_DAY', label: '1d' },
  ];
  const typeOptions = [{ value: 'true', label: 'На закрытии' }, { value: 'false', label: 'В моменте' }];
  const NUMBER_WIDTH = 24; const GAP_WIDTH = 10; const LEFT_OFFSET = NUMBER_WIDTH + GAP_WIDTH;

  // Данные для выпадающего списка "Мин. отступ"
  const conditionalIndentData = [
    { value: 'null', label: 'Отключено' },
    ...CONDITIONAL_OPTIONS.map(val => ({ value: val, label: `${val}%` }))
  ];

  return (
    <Stack gap="xl" mt="xs">
        
        {/* ========================================= */}
        {/* 1. ОБЫЧНЫЙ СТОП-ЛОСС */}
        {/* ========================================= */}
        <Stack gap="xs">
            <SimpleGrid cols={2} spacing="md" verticalSpacing="xs">
                
                {/* ЛЕВАЯ КОЛОНКА */}
                <Stack gap="xs">
                     {/* Заголовок + Свитч */}
                    <Group justify="space-between" align="center" h={28}>
                        <Text fw={700} size="md">Стоп-лосс</Text>
                        <Switch 
                            checked={config.enabledSimple}
                            onChange={(e) => onChange({ ...config, enabledSimple: e.currentTarget.checked })}
                            size="md"
                        />
                    </Group>

                    {/* Поле ввода (в сером блоке) */}
                    <Collapse in={config.enabledSimple}>
                         <Paper withBorder p="sm" bg="gray.0" radius="md">
                             <MultiSelect
                                label="Отступ (%)"
                                description="Выберите значения для перебора"
                                placeholder="Например: -0.5"
                                data={STOP_LOSS_OPTIONS}
                                value={config.indent}
                                onChange={(vals) => onChange({ ...config, indent: vals })}
                                searchable clearable hidePickedOptions size="sm"
                            />
                         </Paper>
                    </Collapse>
                </Stack>

                {/* ПРАВАЯ КОЛОНКА: Пусто */}
                <div></div>
            </SimpleGrid>
        </Stack>


        {/* ========================================= */}
        {/* 2. СТОП-ЛОСС ПО СИГНАЛУ */}
        {/* ========================================= */}
        <Stack gap="xs">
             <SimpleGrid cols={2} spacing="md" verticalSpacing="xs">
                
                {/* ЛЕВАЯ КОЛОНКА: Заголовок + Мин. отступ */}
                <Stack gap="xs">
                    <Group justify="space-between" align="center" h={28}>
                        <Text fw={700} size="md">Стоп-лосс по сигналу</Text>
                        <Switch 
                            checked={config.enabledSignal}
                            onChange={(e) => onChange({ ...config, enabledSignal: e.currentTarget.checked })}
                            size="md"
                        />
                    </Group>

                    <Collapse in={config.enabledSignal}>
                        {/* h="100%" заставляет Paper растягиваться на высоту соседа */}
                        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
                            <MultiSelect
                                label="Мин. отступ (%)"
                                description="Отрицательные или положительные"
                                placeholder="Выберите значения или 'Отключено'"
                                data={conditionalIndentData}
                                value={config.conditionalIndent}
                                onChange={(vals) => onChange({ ...config, conditionalIndent: vals })}
                                searchable clearable hidePickedOptions size="sm"
                            />
                        </Paper>
                    </Collapse>
                </Stack>

                {/* ПРАВАЯ КОЛОНКА: Тип отступа */}
                <Stack gap="xs">
                    {/* Спейсер */}
                    <div style={{ height: 28 }} />
                    
                    <Collapse in={config.enabledSignal}>
                        {/* h="100%" заставляет этот блок быть такой же высоты, как левый */}
                        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
                            <Select
                                label="Тип отступа"
                                description="База для расчета отступа"
                                data={[
                                    { value: 'AVERAGE', label: 'От средней цены' },
                                    { value: 'LAST_GRID', label: 'От последнего ордера' }
                                ]}
                                value={config.conditionalIndentType}
                                onChange={(v) => onChange({ ...config, conditionalIndentType: v as any })}
                                allowDeselect={false} size="sm"
                            />
                        </Paper>
                    </Collapse>
                </Stack>

            </SimpleGrid>
            
            {/* СЛОТЫ ФИЛЬТРОВ */}
            <Collapse in={config.enabledSignal}>
                <Stack gap="md" mt="xs">
                    
                    {config.filterSlots.length === 0 && (
                        <Paper p="lg" withBorder bg="white" ta="center">
                            <Text c="dimmed" mb="sm" size="sm">Индикаторы стоп-лосса не заданы.</Text>
                            <Button 
                                variant="light" color="cyan" size="xs" 
                                leftSection={<IconPlus size={14}/>}
                                onClick={addSlot}
                            >
                                Добавить фильтр (Группу)
                            </Button>
                        </Paper>
                    )}

                    {config.filterSlots.map((slot, slotIndex) => (
                        <Paper key={slot.id} withBorder shadow="sm" radius="md" style={{ overflow: 'hidden' }}>
                            <Group justify="space-between" bg="cyan.0" px="md" py={6} style={{ borderBottom: '1px solid #e9ecef' }}>
                                <Group gap="xs">
                                    <Badge size="sm" radius="sm" variant="filled" color="cyan">ФИЛЬТР {slotIndex + 1}</Badge>
                                    <Text size="xs" c="dimmed">Перебор вариантов</Text>
                                </Group>
                                <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeSlot(slot.id)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>

                            <Stack gap="sm" p="sm" bg="gray.0">
                                {slot.variants.length === 0 && (
                                    <Text size="xs" c="dimmed" fs="italic" ta="center">Нет вариантов.</Text>
                                )}

                                {slot.variants.map((variant, vIndex) => {
                                    const def = (variant.indicator && safeLibrary[variant.indicator]) ? safeLibrary[variant.indicator] : null;
                                    const settings = def?.settings || { hasTimeframe: true, hasValue: true, hasOperation: true, allowBasic: true, hasReverse: false };
                                    const showInputs = (!variant.basic || !settings.allowBasic) && (settings.hasValue || settings.hasOperation);

                                    return (
                                        <Paper key={variant.id} withBorder p="xs" radius="sm" bg="white">
                                            <Group align="center" wrap="nowrap" gap="xs">
                                                <Text fw={700} c="dimmed" size="xs" w={NUMBER_WIDTH} ta="center">{vIndex + 1}</Text>
                                                <Select placeholder="Индикатор" data={indicatorOptions} value={variant.indicator} onChange={(v) => updateVariant(slot.id, variant.id!, 'indicator', v)} searchable allowDeselect={false} style={{ flex: 1 }} size="xs" />
                                                {settings.hasTimeframe && <Select placeholder="ТФ" data={intervalOptions} value={variant.interval} onChange={(v) => updateVariant(slot.id, variant.id!, 'interval', v)} allowDeselect={false} w={80} size="xs" />}
                                                <Group gap={4}>
                                                    {settings.hasReverse && <Tooltip label="Реверс"><ActionIcon variant={variant.reverse ? "filled" : "light"} color={variant.reverse ? "orange" : "gray"} size="md" onClick={() => updateVariant(slot.id, variant.id!, 'reverse', !variant.reverse)}><IconArrowsRightLeft size={14}/></ActionIcon></Tooltip>}
                                                    {settings.allowBasic && (settings.hasValue || settings.hasOperation) && <Tooltip label="Настройка"><ActionIcon variant={!variant.basic ? "filled" : "light"} color="blue" size="md" onClick={() => updateVariant(slot.id, variant.id!, 'basic', !variant.basic)}><IconPencil size={14}/></ActionIcon></Tooltip>}
                                                    <ActionIcon variant="light" color="red" size="md" onClick={() => removeVariant(slot.id, variant.id!)}><IconTrash size={14}/></ActionIcon>
                                                </Group>
                                            </Group>
                                            <Collapse in={!!showInputs}>
                                                <Group mt="xs" align="flex-start" grow wrap="nowrap" pl={LEFT_OFFSET}> 
                                                    <Select size="xs" label="Тип" data={typeOptions} value={variant.closed ? 'true' : 'false'} onChange={(v) => updateVariant(slot.id, variant.id!, 'closed', v === 'true')} disabled />
                                                    {settings.hasOperation && <Select size="xs" label="Условие" data={[{ value: 'GREATER', label: 'Больше' }, { value: 'LESS', label: 'Меньше' }]} value={variant.operation} onChange={(v) => updateVariant(slot.id, variant.id!, 'operation', v as OperationType)} allowDeselect={false} w={100} />}
                                                    {settings.hasValue && <TextInput size="xs" label="Значение" placeholder="0" value={typeof variant.value === 'string' ? variant.value : ''} onChange={(e) => updateVariant(slot.id, variant.id!, 'value', e.target.value.replace(/,/g, '.'))} />}
                                                </Group>
                                            </Collapse>
                                        </Paper>
                                    );
                                })}
                                <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={() => addVariant(slot.id)} style={{ alignSelf: 'flex-start' }}>Добавить вариант</Button>
                            </Stack>
                        </Paper>
                    ))}

                    {config.filterSlots.length > 0 && (
                        <Button variant="outline" size="sm" leftSection={<IconPlus size={16} />} onClick={addSlot} fullWidth style={{ borderStyle: 'dashed' }} color="cyan">Добавить фильтр (AND)</Button>
                    )}
                </Stack>
            </Collapse>
        </Stack>

    </Stack>
  );
}