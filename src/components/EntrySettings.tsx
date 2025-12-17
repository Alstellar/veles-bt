import { 
  Paper, Group, Select, ActionIcon, Text, Stack, TextInput, Collapse, Badge, Button, ThemeIcon 
} from '@mantine/core';
import { IconTrash, IconPlus, IconPencil, IconAntenna } from '@tabler/icons-react';

import { FILTERS_LIBRARY } from '../filtersLibrary';
import type { IndicatorDef } from '../filtersLibrary';
import type { Condition, FilterSlot, EntryConfig, IntervalType, OperationType } from '../types';

interface Props {
  config: EntryConfig;
  onChange: (cfg: EntryConfig) => void;
}

const randomId = () => Math.random().toString(36).substr(2, 9);

export function EntrySettings({ config, onChange }: Props) {
  
  const updateConfig = (newSlots: FilterSlot[]) => {
    onChange({ ...config, filterSlots: newSlots });
  };

  // --- УПРАВЛЕНИЕ СЛОТАМИ ---

  const addSlot = () => {
    const newSlot: FilterSlot = {
      id: randomId(),
      variants: [] 
    };
    updateConfig([...config.filterSlots, newSlot]);
  };

  const removeSlot = (slotId: string) => {
    updateConfig(config.filterSlots.filter(s => s.id !== slotId));
  };

  // --- УПРАВЛЕНИЕ ВАРИАНТАМИ ---

  const addVariant = (slotId: string) => {
    const newVariant: Condition = {
      id: randomId(),
      type: 'INDICATOR',
      indicator: 'RSI', 
      interval: 'FIVE_MINUTES',
      basic: true, 
      closed: true, 
      operation: 'GREATER',
      value: '30',
      reverse: false
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

  const handleValueChange = (slotId: string, variantId: string, text: string) => {
    const sanitized = text.replace(/,/g, '.');
    updateVariant(slotId, variantId, 'value', sanitized);
  };

  // --- ДАННЫЕ ДЛЯ UI ---

  const safeLibrary = FILTERS_LIBRARY || {};
  
  const indicatorOptions = Object.values(safeLibrary).map((ind: IndicatorDef) => ({
    value: ind.code,
    label: ind.label,
  }));

  const intervalOptions: { value: IntervalType; label: string }[] = [
    { value: 'ONE_MINUTE', label: '1 минута' },
    { value: 'FIVE_MINUTES', label: '5 минут' },
    { value: 'FIFTEEN_MINUTES', label: '15 минут' },
    { value: 'THIRTY_MINUTES', label: '30 минут' },
    { value: 'ONE_HOUR', label: '1 час' },
    { value: 'FOUR_HOUR', label: '4 часа' },
    { value: 'ONE_DAY', label: '1 день' },
  ];

  const typeOptions = [
    { value: 'true', label: 'На закрытии' },
    { value: 'false', label: 'В моменте' },
  ];

  return (
    <Paper p={0} bg="transparent">
      
      {/* ЗАГОЛОВОК */}
      <Group mb="xs">
        <ThemeIcon variant="light" color="cyan"><IconAntenna size={20}/></ThemeIcon>
        <Text fw={700} size="lg">Условия открытия сделки</Text>
      </Group>

      {/* ОПИСАНИЕ И КНОПКА ДОБАВЛЕНИЯ ЕСЛИ ПУСТО */}
      {config.filterSlots.length === 0 && (
          <Paper p="lg" withBorder bg="white" ta="center">
              <Text c="dimmed" mb="sm">Условия входа не заданы. Сделка будет открываться сразу.</Text>
              <Button 
                  variant="light" color="cyan" size="sm" 
                  leftSection={<IconPlus size={16}/>}
                  onClick={addSlot}
              >
                  Добавить условие
              </Button>
          </Paper>
      )}

      <Stack gap="md">
        
        {/* ПЕРЕБОР СЛОТОВ (ГРУПП) */}
        {config.filterSlots.map((slot, slotIndex) => (
            <Paper 
                key={slot.id} 
                withBorder 
                shadow="sm" 
                radius="md" 
                style={{ overflow: 'hidden' }}
            >
                {/* ЗАГОЛОВОК СЛОТА */}
                <Group justify="space-between" bg="cyan.0" px="md" py={8} style={{ borderBottom: '1px solid #e9ecef' }}>
                    <Group gap="xs">
                        <Badge size="sm" radius="sm" variant="filled" color="cyan">ГРУППА {slotIndex + 1}</Badge>
                        <Text size="xs" c="dimmed" lh={1.2}>
                          Перебор вариантов (ИЛИ)
                        </Text>
                    </Group>
                    <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeSlot(slot.id)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>

                <Stack gap="sm" p="sm" bg="gray.0">
                    
                    {slot.variants.length === 0 && (
                        <Text size="xs" c="dimmed" fs="italic" ta="center" py="xs">
                            Нет индикаторов в группе.
                        </Text>
                    )}

                    {/* ПЕРЕБОР ВАРИАНТОВ */}
                    {slot.variants.map((variant, vIndex) => {
                          const libData = (variant.indicator && safeLibrary[variant.indicator]) ? safeLibrary[variant.indicator] : null;
                          const isExpanded = !variant.basic;
                          const stringValue = typeof variant.value === 'string' ? variant.value : '';

                          return (
                            <Paper key={variant.id} withBorder p="xs" radius="sm" bg="white">
                                
                                <Group align="flex-end" wrap="nowrap" gap="xs">
                                    <Text fw={700} c="dimmed" size="xs" w={15} ta="center">{vIndex + 1}</Text>
                                    
                                    <Select
                                        placeholder="Индикатор"
                                        data={indicatorOptions}
                                        value={variant.indicator}
                                        onChange={(v) => updateVariant(slot.id, variant.id!, 'indicator', v)}
                                        searchable
                                        allowDeselect={false}
                                        style={{ flex: 1 }}
                                        size="xs"
                                    />

                                    {libData?.hasTimeframe && (
                                        <Select
                                            placeholder="ТФ"
                                            data={intervalOptions}
                                            value={variant.interval}
                                            onChange={(v) => updateVariant(slot.id, variant.id!, 'interval', v)}
                                            allowDeselect={false}
                                            w={95}
                                            size="xs"
                                        />
                                    )}

                                    <Group gap={2}>
                                            {libData?.hasBasicMode && (
                                                <ActionIcon 
                                                    variant={isExpanded ? "filled" : "light"} 
                                                    color="blue" size="md"
                                                    onClick={() => updateVariant(slot.id, variant.id!, 'basic', !variant.basic)}
                                                >
                                                    <IconPencil size={14} />
                                                </ActionIcon>
                                            )}
                                            <ActionIcon 
                                                variant="light" color="red" size="md"
                                                onClick={() => removeVariant(slot.id, variant.id!)}
                                            >
                                                <IconTrash size={14} />
                                            </ActionIcon>
                                    </Group>
                                </Group>

                                {/* РАСШИРЕННЫЕ НАСТРОЙКИ (COLLAPSE) */}
                                <Collapse in={isExpanded}>
                                    <Group mt="xs" align="flex-start" grow wrap="nowrap" pl={23}> 
                                            <Select
                                                size="xs" label="Тип цены"
                                                data={typeOptions}
                                                value={variant.closed ? 'true' : 'false'}
                                                onChange={(v) => updateVariant(slot.id, variant.id!, 'closed', v === 'true')}
                                                allowDeselect={false}
                                                disabled 
                                            />
                                            
                                            <Select
                                                size="xs" label="Условие"
                                                data={[
                                                    { value: 'GREATER', label: 'Больше' },
                                                    { value: 'LESS', label: 'Меньше' },
                                                ]}
                                                value={variant.operation}
                                                onChange={(v) => updateVariant(slot.id, variant.id!, 'operation', v as OperationType)}
                                                allowDeselect={false}
                                            />

                                            <TextInput
                                                size="xs" label="Значение" placeholder="30"
                                                value={stringValue}
                                                onChange={(e) => handleValueChange(slot.id, variant.id!, e.target.value)}
                                            />
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
                        // compact удален
                    >
                        Добавить вариант
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
                Добавить группу (AND)
            </Button>
        )}

      </Stack>
    </Paper>
  );
}