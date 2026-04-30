// src/components/OrderSettings/SignalMode.tsx
import { useState } from 'react';
import { 
  Paper, Group, Text, Button, ActionIcon, Table, SegmentedControl, Center, 
  NumberInput, Badge, Tooltip, ThemeIcon, SimpleGrid, Stack 
} from '@mantine/core';
import { IconPlus, IconTrash, IconSettings, IconCalculator, IconCopy } from '@tabler/icons-react';

// Используем MultiInput вместо SmartMultiSelect
import { MultiInput } from '../MultiInput';
import { FiltersModal } from './FiltersModal';
import type { OrderSignalConfig, SignalOrderLine, FilterSlot } from '../../types';
import type { Condition } from '../../types';
import type { SignalProbeRequestType, SignalProbeViewState } from '../../services/SignalProbeService';
import { cloneSignalOrderWithNewIds } from '../../utils/filterClone';
import {
  CUSTOM_VOLUME_STEP,
  generateCustomVolumeDistributions,
  getCustomOrderVolumeRange,
  getCustomOrderVolumeValues
} from '../../utils/customOrderVolumes';

const randomId = () => Math.random().toString(36).substr(2, 9);

interface Props {
  config: OrderSignalConfig;
  onChange: (cfg: OrderSignalConfig) => void;
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

export function SignalMode({
  config,
  onChange,
  resolveSignalProbeState,
  onSignalProbeRequest,
  onSignalProbeDirty
}: Props) {
  
  const [calcMartingale, setCalcMartingale] = useState<number>(5);
  
  // STATE ДЛЯ МОДАЛКИ
  const [modalOpened, setModalOpened] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [currentSlots, setCurrentSlots] = useState<FilterSlot[]>([]);

  const update = (key: keyof OrderSignalConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const updateBaseOrder = (field: keyof OrderSignalConfig['baseOrder'], value: any) => {
    update('baseOrder', { ...config.baseOrder, [field]: value });
  };

  const updateGridOrder = (id: string, field: keyof SignalOrderLine, value: any) => {
    const newOrders = config.orders.map(order => {
      if (order.id === id) return { ...order, [field]: value };
      return order;
    });
    update('orders', newOrders);
  };

  const withVolumeDefaults = <T extends { volume: number; volumeRange?: any; volumeValues?: string[] }>(
    order: T,
    isLast: boolean
  ): T => ({
    ...order,
    volumeRange: order.volumeRange ?? {
      from: String(order.volume || 0),
      to: String(order.volume || 0),
      step: String(CUSTOM_VOLUME_STEP)
    },
    volumeValues: order.volumeValues ?? (!isLast && order.volume > 0 ? [String(order.volume)] : [])
  });

  const changeVolumeMode = (value: OrderSignalConfig['volumeMode']) => {
    const totalOrders = 1 + config.orders.length;
    onChange({
      ...config,
      volumeMode: value,
      baseOrder: withVolumeDefaults(config.baseOrder, totalOrders === 1),
      orders: config.orders.map((order, index) => withVolumeDefaults(order, index === config.orders.length - 1))
    });
  };

  const updateBaseVolumeRange = (field: 'from' | 'to' | 'step', value: string | number) => {
    const currentRange = getCustomOrderVolumeRange(config.baseOrder);
    updateBaseOrder('volumeRange', {
      ...currentRange,
      [field]: String(value)
    });
  };

  const updateGridVolumeRange = (id: string, field: 'from' | 'to' | 'step', value: string | number) => {
    const newOrders = config.orders.map((order) => {
      if (order.id !== id) return order;
      const currentRange = getCustomOrderVolumeRange(order);
      return {
        ...order,
        volumeRange: {
          ...currentRange,
          [field]: String(value)
        }
      };
    });
    update('orders', newOrders);
  };

  const updateBaseVolumeValues = (values: string[]) => {
    updateBaseOrder('volumeValues', values);
  };

  const updateGridVolumeValues = (id: string, values: string[]) => {
    updateGridOrder(id, 'volumeValues', values);
  };

  const addOrder = () => {
    const newOrder: SignalOrderLine = {
      id: randomId(),
      indent: [], 
      volume: 10,
      volumeRange: { from: '0', to: '0', step: String(CUSTOM_VOLUME_STEP) },
      volumeValues: [],
      filterSlots: [] 
    };
    update('orders', [...config.orders, newOrder]);
  };

  // 👯‍♂️ НОВОЕ: Функция дублирования ордера
  const duplicateOrder = (id: string) => {
    const index = config.orders.findIndex(o => o.id === id);
    if (index === -1) return;

    const source = config.orders[index];
    
    // Делаем глубокую копию, чтобы отвязать ссылки на массивы (особенно фильтры)
    const newOrder = cloneSignalOrderWithNewIds(source);
    newOrder.id = randomId(); // Обязательно новый ID

    const newOrders = [...config.orders];
    // Вставляем копию сразу после оригинала (index + 1)
    newOrders.splice(index + 1, 0, newOrder);
    
    update('orders', newOrders);
  };

  const removeOrder = (id: string) => {
    update('orders', config.orders.filter(o => o.id !== id));
  };

  // --- ЛОГИКА ОТКРЫТИЯ МОДАЛКИ ---
  const openFiltersModal = (orderId: string, slots: FilterSlot[] | undefined) => {
    setActiveOrderId(orderId);
    setCurrentSlots(slots || []);
    setModalOpened(true);
  };

  // --- ЛОГИКА СОХРАНЕНИЯ ---
  const saveFilters = (newSlots: FilterSlot[]) => {
    if (!activeOrderId) return;

    const newOrders = config.orders.map(order => {
      if (order.id === activeOrderId) {
        return { ...order, filterSlots: newSlots };
      }
      return order;
    });
    update('orders', newOrders);
  };

  // --- КАЛЬКУЛЯТОР ОБЪЕМОВ ---
  const applyCalculator = () => {
    const totalOrdersCount = 1 + config.orders.length; 
    const q = 1 + (calcMartingale / 100); 
    let startVolume = 0;
    
    if (calcMartingale === 0) {
      startVolume = 100 / totalOrdersCount;
    } else {
      startVolume = (100 * (1 - q)) / (1 - Math.pow(q, totalOrdersCount));
    }

    let weights: number[] = [];
    let current = startVolume;

    for (let i = 0; i < totalOrdersCount; i++) {
      weights.push(current);
      current = current * q;
    }

    let rounded = weights.map(w => Math.round(w * 100) / 100);
    const currentSum = rounded.reduce((a, b) => a + b, 0);
    const diff = 100 - currentSum;
    
    if (Math.abs(diff) > 0.0001) {
       const lastIdx = rounded.length - 1;
       rounded[lastIdx] = Number((rounded[lastIdx] + diff).toFixed(2));
    }

    const baseVol = rounded[0];
    const gridVols = rounded.slice(1);
    const newOrders = config.orders.map((o, idx) => ({ ...o, volume: gridVols[idx] }));

    onChange({
      ...config,
      baseOrder: { ...config.baseOrder, volume: baseVol },
      orders: newOrders
    });
  };

  const currentTotalVolume = Number(
    (config.baseOrder.volume + config.orders.reduce((acc, o) => acc + o.volume, 0)).toFixed(2)
  );
  const volumeMode = config.volumeMode ?? 'FIXED';
  const volumeOrders = [config.baseOrder, ...config.orders];
  const volumeDistributionResult = volumeMode !== 'FIXED'
    ? generateCustomVolumeDistributions(volumeOrders, volumeMode)
    : null;

  const renderVolumeInput = (
    order: OrderSignalConfig['baseOrder'] | SignalOrderLine,
    index: number,
    target: 'base' | SignalOrderLine
  ) => {
    const isLast = index === volumeOrders.length - 1;
    const updateVolume = (value: number) => {
      if (target === 'base') {
        updateBaseOrder('volume', value);
      } else {
        updateGridOrder(target.id, 'volume', value);
      }
    };
    const updateRange = (field: 'from' | 'to' | 'step', value: string | number) => {
      if (target === 'base') {
        updateBaseVolumeRange(field, value);
      } else {
        updateGridVolumeRange(target.id, field, value);
      }
    };
    const updateValues = (values: string[]) => {
      if (target === 'base') {
        updateBaseVolumeValues(values);
      } else {
        updateGridVolumeValues(target.id, values);
      }
    };

    if (volumeMode === 'LIST' && !isLast) {
      return (
        <MultiInput
          label="Значения"
          placeholder="Объем"
          value={getCustomOrderVolumeValues(order)}
          onChange={updateValues}
        />
      );
    }

    if (volumeMode !== 'FIXED' && isLast) {
      return (
        <SimpleGrid cols={2} spacing={4}>
          <NumberInput
            label="От"
            size="xs"
            min={0.01}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).from)}
            onChange={(v) => updateRange('from', v || 0)}
          />
          <NumberInput
            label="До"
            size="xs"
            min={0.01}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).to)}
            onChange={(v) => updateRange('to', v || 0)}
          />
        </SimpleGrid>
      );
    }

    if (volumeMode === 'RANGE') {
      return (
        <SimpleGrid cols={3} spacing={4}>
          <NumberInput
            label="От"
            size="xs"
            min={CUSTOM_VOLUME_STEP}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).from)}
            onChange={(v) => updateRange('from', v || 0)}
          />
          <NumberInput
            label="До"
            size="xs"
            min={CUSTOM_VOLUME_STEP}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).to)}
            onChange={(v) => updateRange('to', v || 0)}
          />
          <NumberInput
            label="Шаг"
            size="xs"
            min={CUSTOM_VOLUME_STEP}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).step)}
            onChange={(v) => updateRange('step', v || CUSTOM_VOLUME_STEP)}
          />
        </SimpleGrid>
      );
    }

    return (
      <NumberInput
        size="sm"
        variant="unstyled"
        value={order.volume}
        onChange={(v) => updateVolume(Number(v))}
        style={{ textAlign: 'center', fontWeight: target === 'base' ? 700 : 400 }}
        styles={{ input: { textAlign: 'center' } }}
      />
    );
  };

  return (
    <Paper p="md" withBorder bg="white">
      <Group justify="space-between" align="center" mb="md">
        <Text size="sm" fw={600}>Распределение объемов</Text>
        <SegmentedControl
          size="xs"
          value={volumeMode}
          onChange={(value) => changeVolumeMode(value as OrderSignalConfig['volumeMode'])}
          data={[
            { value: 'FIXED', label: 'Мартингейл / фикс.' },
            { value: 'LIST', label: 'Списки' },
            { value: 'RANGE', label: 'Диапазоны' }
          ]}
        />
      </Group>
      
      <SimpleGrid cols={2} spacing="md" mb="md">
        <Paper withBorder p="sm" bg="blue.0" radius="md" h="100%">
          <Stack gap="xs" justify="center" h="100%">
              <Group align="flex-end" wrap="nowrap">
                <NumberInput 
                    label="Мартингейл (%)" 
                    size="xs" 
                    w="100%"
                    value={calcMartingale} 
                    onChange={(v) => setCalcMartingale(Number(v))} 
                    disabled={volumeMode !== 'FIXED'}
                />
                <Button 
                  size="xs" 
                  variant="filled" 
                  color="blue" 
                  onClick={applyCalculator}
                  disabled={volumeMode !== 'FIXED'}
                  leftSection={<IconCalculator size={14} />}
                  style={{ flexShrink: 0 }}
                >
                  Рассчитать
                </Button>
             </Group>
             <Text size="xs" c="dimmed" ta="center">
                Авторасчет объемов ордеров с заданным % Мартингейла
             </Text>
          </Stack>
        </Paper>

        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
            <Stack gap={4} justify="center" h="100%">
              <Text size="sm" fw={700} c="dimmed" ta="center">Режим расчета отступа</Text>
              <SegmentedControl
                fullWidth
                size="sm"
                data={[
                  { label: 'От входа', value: 'ENTRY' },
                  { label: 'От пред. ордера', value: 'ORDER' },
                ]}
                value={config.indentType}
                onChange={(v) => update('indentType', v)}
              />
            </Stack>
        </Paper>
      </SimpleGrid>

      <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: 50 }} />
          <col style={{ width: '38%' }} />
          <col style={{ width: '34%' }} />
          <col />
          <col style={{ width: 90 }} />
        </colgroup>
        <Table.Thead bg="gray.1">
          <Table.Tr>
            <Table.Th w={50} ta="center">№</Table.Th>
            <Table.Th ta="center">Отступ (%)</Table.Th>
            <Table.Th ta="center">Объем (%)</Table.Th>
            <Table.Th ta="center">Фильтры</Table.Th>
            <Table.Th w={90} /> {/* Чуть расширили колонку действий */}
          </Table.Tr>
        </Table.Thead>
        
        <Table.Tbody>
          <Table.Tr bg="blue.0">
            <Table.Td ta="center">
                <Text fw={700} size="sm">1</Text>
                <Text size="8px" c="dimmed" style={{ lineHeight: 1 }}>BASE</Text>
            </Table.Td>
            <Table.Td style={{ minWidth: 0 }}>
              <MultiInput
                label={volumeMode !== 'FIXED' ? 'Значения' : ''} placeholder="0"
                value={config.baseOrder.indent}
                onChange={(v) => updateBaseOrder('indent', v)}
              />
            </Table.Td>
            <Table.Td>
              {renderVolumeInput(config.baseOrder, 0, 'base')}
            </Table.Td>
            <Table.Td>
              <Center>
                <Text size="xs" c="dimmed" fs="italic">Фильтры не применяются</Text>
              </Center>
            </Table.Td>
            <Table.Td />
          </Table.Tr>

          {config.orders.map((order, index) => {
            const slotsCount = order.filterSlots?.length || 0;
            const combinations = order.filterSlots?.reduce((acc, slot) => acc * (slot.variants.length || 1), 1) || 1;

            return (
              <Table.Tr key={order.id}>
                <Table.Td ta="center">
                  <Text fw={500} size="sm">{index + 2}</Text>
                </Table.Td>
                <Table.Td style={{ minWidth: 0 }}>
                  <MultiInput
                    label={volumeMode !== 'FIXED' ? 'Значения' : ''} placeholder="Отступ"
                    value={order.indent}
                    onChange={(v) => updateGridOrder(order.id, 'indent', v)}
                  />
                </Table.Td>
                <Table.Td>
                  {renderVolumeInput(order, index + 1, order)}
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap" justify="center">
                    <Tooltip label={slotsCount > 0 ? `Фильтры: ${slotsCount}` : 'Настроить фильтры'}>
                      <ActionIcon
                        variant={slotsCount > 0 ? 'light' : 'default'}
                        size="lg"
                        color={slotsCount > 0 ? 'blue' : 'gray'}
                        onClick={() => openFiltersModal(order.id, order.filterSlots)}
                        aria-label="Настроить фильтры"
                      >
                        <IconSettings size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {slotsCount > 0 && <Badge size="xs" circle>{combinations}</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td>
                  {/* Группа кнопок: Копировать и Удалить */}
                  <Group gap={4} wrap="nowrap" justify="center">
                    <ActionIcon 
                        color="blue" 
                        variant="subtle" 
                        onClick={() => duplicateOrder(order.id)}
                        title="Дублировать ордер"
                    >
                        <IconCopy size={16} />
                    </ActionIcon>
                    <ActionIcon 
                        color="red" 
                        variant="subtle" 
                        onClick={() => removeOrder(order.id)}
                        title="Удалить ордер"
                    >
                        <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      
      <Group justify="space-between" mt="xs" align="center">
         <Button 
          variant="outline" size="xs"
          leftSection={<IconPlus size={16} />}
          onClick={addOrder}
          style={{ borderStyle: 'dashed' }}
        >
          Добавить ордер
        </Button>
        {volumeMode !== 'FIXED' && (
          <Group gap="xs">
            <Text size="sm">Валидных распределений:</Text>
            <Badge
              size="lg"
              color={volumeDistributionResult?.error || volumeDistributionResult?.tooMany ? 'red' : 'green'}
              variant="filled"
            >
              {volumeDistributionResult?.tooMany ? '10000+' : volumeDistributionResult?.distributions.length ?? 0}
            </Badge>
            {(volumeDistributionResult?.error || volumeDistributionResult?.tooMany) && (
              <Tooltip label={volumeDistributionResult.tooMany ? 'Слишком много распределений. Увеличьте шаг или сузьте диапазоны.' : volumeDistributionResult.error}>
                <ThemeIcon color="red" variant="light" size="sm">!</ThemeIcon>
              </Tooltip>
            )}
          </Group>
        )}
        {volumeMode === 'FIXED' && (
          <Group gap="xs">
            <Text size="sm">Итого:</Text>
            <Badge
              size="lg"
              color={Math.abs(currentTotalVolume - 100) < 0.1 ? 'green' : 'red'}
              variant="filled"
            >
              {currentTotalVolume}%
            </Badge>
            {Math.abs(currentTotalVolume - 100) >= 0.1 && (
              <Tooltip label="Сумма объемов должна быть равна 100%">
                <ThemeIcon color="red" variant="light" size="sm">!</ThemeIcon>
              </Tooltip>
            )}
          </Group>
        )}
      </Group>

      {/* ПОДКЛЮЧЕНИЕ МОДАЛКИ */}
      <FiltersModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Настройка фильтров"
        initialSlots={currentSlots}
        onSave={saveFilters}
        probeScope={`order_signal:${activeOrderId ?? 'none'}`}
        resolveSignalProbeState={resolveSignalProbeState}
        onSignalProbeRequest={onSignalProbeRequest}
        onSignalProbeDirty={onSignalProbeDirty}
      />

    </Paper>
  );
}
