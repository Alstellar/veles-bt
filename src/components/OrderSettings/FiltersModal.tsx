import { useState, useEffect } from 'react';
import { 
  Modal, Button, Group, Select, ActionIcon, Paper, Text, 
  Stack, TextInput, Collapse, Badge, Tooltip 
} from '@mantine/core';
import { IconTrash, IconPlus, IconPencil, IconCheck, IconArrowsRightLeft } from '@tabler/icons-react';

import { FILTERS_LIBRARY } from '../../filtersLibrary';
import type { IndicatorDef } from '../../filtersLibrary';

import type { Condition, FilterSlot, IntervalType, OperationType } from '../../types';

interface Props {
  opened: boolean;
  onClose: () => void;
  title: string;
  initialSlots: FilterSlot[]; 
  onSave: (slots: FilterSlot[]) => void;
}

const randomId = () => Math.random().toString(36).substr(2, 9);

export function FiltersModal({ opened, onClose, title, initialSlots, onSave }: Props) {
  
  const [slots, setSlots] = useState<FilterSlot[]>([]);

  // 1. Инициализация
  useEffect(() => {
    if (opened) {
      const safeSlots = Array.isArray(initialSlots) ? initialSlots : [];
      
      const cleanSlots = safeSlots.map(slot => ({
        id: slot.id || randomId(),
        variants: Array.isArray(slot.variants) ? slot.variants.map(v => ({
            ...v,
            id: v.id || randomId(),
            value: Array.isArray(v.value) ? (v.value[0] || '') : (v.value || ''),
            basic: v.basic !== undefined ? v.basic : true
        })) : []
      }));
      setSlots(cleanSlots);
    }
  }, [opened, initialSlots]);

  const handleSave = () => {
    onSave(slots);
    onClose();
  };

  // --- УПРАВЛЕНИЕ СЛОТАМИ ---

  const addSlot = () => {
    const newSlot: FilterSlot = {
      id: randomId(),
      variants: [] 
    };
    setSlots([...slots, newSlot]);
  };

  const removeSlot = (slotId: string) => {
    setSlots(slots.filter(s => s.id !== slotId));
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

    setSlots(slots.map(slot => {
        if (slot.id === slotId) {
            return { ...slot, variants: [...slot.variants, newVariant] };
        }
        return slot;
    }));
  };

  const removeVariant = (slotId: string, variantId: string) => {
    setSlots(slots.map(slot => {
        if (slot.id === slotId) {
            return { ...slot, variants: slot.variants.filter(v => v.id !== variantId) };
        }
        return slot;
    }));
  };

  const updateVariant = (slotId: string, variantId: string, field: keyof Condition, value: any) => {
    setSlots(slots.map(slot => {
        if (slot.id === slotId) {
            const newVariants = slot.variants.map(v => {
                if (v.id === variantId) return { ...v, [field]: value };
                return v;
            });
            return { ...slot, variants: newVariants };
        }
        return slot;
    }));
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
    { value: 'true', label: 'На закрытии бара' },
    { value: 'false', label: 'В моменте (Текущая)' },
  ];

  // Константы выравнивания (как в EntrySettings)
  const NUMBER_WIDTH = 24; 
  const GAP_WIDTH = 10; 
  const LEFT_OFFSET = NUMBER_WIDTH + GAP_WIDTH;

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title={<Text fw={700} size="lg">{title}</Text>} 
      size="xl"
      closeOnClickOutside={false}
    >
      <Stack gap="xl">
        
        {slots.length === 0 && (
            <Paper p="xl" withBorder bg="gray.0" ta="center">
                <Text c="dimmed" mb="md">Нет добавленных фильтров.</Text>
                <Text size="sm" c="dimmed">Добавьте группу фильтров (Слот), чтобы начать.</Text>
            </Paper>
        )}

        {/* ПЕРЕБОР СЛОТОВ (ГРУПП) */}
        {slots.map((slot, slotIndex) => (
            <Paper 
                key={slot.id} 
                withBorder 
                shadow="sm" 
                radius="md" 
                style={{ overflow: 'hidden' }}
            >
                {/* ЗАГОЛОВОК СЛОТА */}
                <Group justify="space-between" bg="blue.0" px="md" py="xs" style={{ borderBottom: '1px solid #e9ecef' }}>
                    <Group gap="xs">
                        <Badge size="lg" radius="sm" variant="filled">ГРУППА {slotIndex + 1}</Badge>
                        <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                          Внутри группы индикаторы работают как ИЛИ
                        </Text>
                    </Group>
                    <ActionIcon color="red" variant="subtle" onClick={() => removeSlot(slot.id)}>
                        <IconTrash size={18} />
                    </ActionIcon>
                </Group>

                <Stack gap="sm" p="md" bg="gray.0">
                    
                    {slot.variants.length === 0 && (
                        <Text size="sm" c="dimmed" fs="italic" ta="center" py="xs">
                            В этой группе нет вариантов. Добавьте индикатор.
                        </Text>
                    )}

                    {/* ПЕРЕБОР ВАРИАНТОВ ВНУТРИ СЛОТА */}
                    {slot.variants.map((variant, vIndex) => {
                          const libData = (variant.indicator && safeLibrary[variant.indicator]) ? safeLibrary[variant.indicator] : null;
                          const settings = libData?.settings; 
                          
                          // Логика отображения полей
                          const showTimeframe = settings?.hasTimeframe;
                          const showBasicToggle = settings?.allowBasic && (settings?.hasValue || settings?.hasOperation);
                          const showReverse = settings?.hasReverse;
                          
                          // ОСТАВЛЕНО КАК БЫЛО (Без хаков):
                          const showInputs = !variant.basic && (settings?.hasValue || settings?.hasOperation);
                          
                          const stringValue = typeof variant.value === 'string' ? variant.value : '';

                          return (
                            <Paper key={variant.id} withBorder p="xs" radius="sm" bg="white">
                                
                                {/* СТРОКА 1: Выравнивание номера (w=24, align=center) */}
                                <Group align="center" wrap="nowrap" gap="xs">
                                    <Text fw={700} c="dimmed" size="xs" w={NUMBER_WIDTH} ta="center" style={{ lineHeight: 1 }}>
                                        {vIndex + 1}
                                    </Text>
                                    
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

                                    {showTimeframe && (
                                        <Select
                                            placeholder="ТФ"
                                            data={intervalOptions}
                                            value={variant.interval}
                                            onChange={(v) => updateVariant(slot.id, variant.id!, 'interval', v)}
                                            allowDeselect={false}
                                            w={110}
                                            size="xs"
                                        />
                                    )}

                                    <Group gap={4}>
                                            {showReverse && (
                                                <Tooltip label="Реверс сигнала (Long <-> Short)">
                                                    <ActionIcon 
                                                        variant={variant.reverse ? "filled" : "light"} 
                                                        color={variant.reverse ? "orange" : "gray"} 
                                                        size="md"
                                                        onClick={() => updateVariant(slot.id, variant.id!, 'reverse', !variant.reverse)}
                                                    >
                                                        <IconArrowsRightLeft size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}

                                            {showBasicToggle && (
                                                <Tooltip label={variant.basic ? "Настройки по умолчанию" : "Ручная настройка значений"}>
                                                    <ActionIcon 
                                                        variant={!variant.basic ? "filled" : "light"} 
                                                        color="blue" 
                                                        size="md"
                                                        onClick={() => updateVariant(slot.id, variant.id!, 'basic', !variant.basic)}
                                                    >
                                                        <IconPencil size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}

                                            <ActionIcon 
                                                variant="light" 
                                                color="red" 
                                                size="md"
                                                onClick={() => removeVariant(slot.id, variant.id!)}
                                            >
                                                <IconTrash size={16} />
                                            </ActionIcon>
                                    </Group>
                                </Group>

                                {/* СТРОКА 2: Отступ слева (pl={34}) */}
                                <Collapse in={!!showInputs}>
                                    <Group mt="xs" align="flex-start" grow wrap="nowrap" pl={LEFT_OFFSET}> 
                                            
                                            <Select
                                                size="xs"
                                                label="Тип"
                                                data={typeOptions}
                                                value={variant.closed ? 'true' : 'false'}
                                                onChange={(v) => updateVariant(slot.id, variant.id!, 'closed', v === 'true')}
                                                allowDeselect={false}
                                                disabled
                                            />
                                            
                                            {settings?.hasOperation && (
                                                <Select
                                                    size="xs"
                                                    label="Условие"
                                                    data={[
                                                        { value: 'GREATER', label: 'Больше' },
                                                        { value: 'LESS', label: 'Меньше' },
                                                    ]}
                                                    value={variant.operation}
                                                    onChange={(v) => updateVariant(slot.id, variant.id!, 'operation', v as OperationType)}
                                                    allowDeselect={false}
                                                />
                                            )}

                                            {settings?.hasValue && (
                                                <TextInput
                                                    size="xs"
                                                    label="Значение"
                                                    placeholder="30"
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
                        variant="subtle" 
                        size="xs" 
                        leftSection={<IconPlus size={14} />} 
                        onClick={() => addVariant(slot.id)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Добавить вариант индикатора
                    </Button>
                </Stack>
            </Paper>
        ))}

        <Stack gap="md">
            <Button 
                variant="outline" 
                size="md" 
                leftSection={<IconPlus size={18} />} 
                onClick={addSlot}
                fullWidth
                style={{ borderStyle: 'dashed' }}
            >
                Добавить группу фильтров (Слот)
            </Button>

            <Group justify="flex-end">
                <Button variant="default" onClick={onClose}>Отмена</Button>
                <Button color="green" onClick={handleSave} leftSection={<IconCheck size={16}/>}>Сохранить настройки</Button>
            </Group>
        </Stack>

      </Stack>
    </Modal>
  );
}