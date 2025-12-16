import { useState } from 'react';
import { 
  Paper, Group, Text, Button, ActionIcon, Table, SegmentedControl, Center, 
  NumberInput, Badge, Tooltip, ThemeIcon, SimpleGrid, Stack 
} from '@mantine/core';
import { IconPlus, IconTrash, IconFilter, IconCalculator } from '@tabler/icons-react';
import { SmartMultiSelect } from '../SmartMultiSelect';
import { FiltersModal } from './FiltersModal';
import type { OrderSignalConfig, SignalOrderLine, FilterSlot } from '../../types';

const randomId = () => Math.random().toString(36).substr(2, 9);

interface Props {
  config: OrderSignalConfig;
  onChange: (cfg: OrderSignalConfig) => void;
}

const PRESETS = {
  indent: ['0.2', '0.5', '1.0', '1.5', '2.0', '5.0']
};

export function SignalMode({ config, onChange }: Props) {
  
  const [calcMartingale, setCalcMartingale] = useState<number>(5);
  
  // STATE ДЛЯ МОДАЛКИ
  const [modalOpened, setModalOpened] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [currentSlots, setCurrentSlots] = useState<FilterSlot[]>([]);

  const update = (key: keyof OrderSignalConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const updateBaseOrder = (field: 'indent' | 'volume', value: any) => {
    update('baseOrder', { ...config.baseOrder, [field]: value });
  };

  const updateGridOrder = (id: string, field: keyof SignalOrderLine, value: any) => {
    const newOrders = config.orders.map(order => {
      if (order.id === id) return { ...order, [field]: value };
      return order;
    });
    update('orders', newOrders);
  };

  const addOrder = () => {
    const newOrder: SignalOrderLine = {
      id: randomId(),
      indent: [], 
      volume: 10,
      filterSlots: [] // Инициализируем пустым списком слотов
    };
    update('orders', [...config.orders, newOrder]);
  };

  const removeOrder = (id: string) => {
    update('orders', config.orders.filter(o => o.id !== id));
  };

  // --- ЛОГИКА ОТКРЫТИЯ МОДАЛКИ ---
  const openFiltersModal = (orderId: string, slots: FilterSlot[] | undefined) => {
    setActiveOrderId(orderId);
    // Защита от undefined (если старые данные)
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

  return (
    <Paper p="md" withBorder bg="white">
      
      <SimpleGrid cols={2} spacing="md" mb="md">
        <Paper withBorder p="sm" bg="blue.0" radius="md" h="100%">
          <Stack gap="xs" justify="center" h="100%">
             <Group align="flex-end" wrap="nowrap">
                <NumberInput 
                    label="Мартингейл (%)" 
                    size="xs" 
                    description="Прирост лота"
                    w="100%"
                    value={calcMartingale} 
                    onChange={(v) => setCalcMartingale(Number(v))} 
                />
                <Button 
                  size="xs" 
                  variant="filled" 
                  color="blue" 
                  onClick={applyCalculator}
                  leftSection={<IconCalculator size={14} />}
                  style={{ flexShrink: 0 }}
                >
                  Рассчитать
                </Button>
             </Group>
             <Text size="xs" c="dimmed" ta="center">
               Авторасчет стартового лота для суммы 100%
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

      <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
        <Table.Thead bg="gray.1">
          <Table.Tr>
            <Table.Th w={50} ta="center">№</Table.Th>
            <Table.Th ta="center">Отступ (%)</Table.Th>
            <Table.Th ta="center">Объем (%)</Table.Th>
            <Table.Th ta="center">Фильтры</Table.Th>
            <Table.Th w={50} />
          </Table.Tr>
        </Table.Thead>
        
        <Table.Tbody>
          <Table.Tr bg="blue.0">
            <Table.Td ta="center">
               <Text fw={700} size="sm">1</Text>
               <Text size="8px" c="dimmed" style={{ lineHeight: 1 }}>BASE</Text>
            </Table.Td>
            <Table.Td>
              <SmartMultiSelect
                label="" placeholder="0"
                data={PRESETS.indent}
                value={config.baseOrder.indent}
                onChange={(v) => updateBaseOrder('indent', v)}
              />
            </Table.Td>
            <Table.Td>
               <NumberInput
                size="sm" variant="unstyled"
                value={config.baseOrder.volume}
                onChange={(v) => updateBaseOrder('volume', Number(v))}
                style={{ textAlign: 'center', fontWeight: 700 }}
                styles={{ input: { textAlign: 'center' } }}
              />
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
            // Подсчет комбинаций: 1 * (кол-во вариантов в слоте 1) * (кол-во вариантов в слоте 2) ...
            const combinations = order.filterSlots?.reduce((acc, slot) => acc * (slot.variants.length || 1), 1) || 1;

            return (
              <Table.Tr key={order.id}>
                <Table.Td ta="center">
                  <Text fw={500} size="sm">{index + 2}</Text>
                </Table.Td>
                <Table.Td>
                  <SmartMultiSelect
                    label="" placeholder="Отступ"
                    data={PRESETS.indent}
                    value={order.indent}
                    onChange={(v) => updateGridOrder(order.id, 'indent', v)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="sm" variant="unstyled"
                    value={order.volume}
                    onChange={(v) => updateGridOrder(order.id, 'volume', Number(v))}
                    style={{ textAlign: 'center' }}
                    styles={{ input: { textAlign: 'center' } }}
                  />
                </Table.Td>
                <Table.Td>
                  <Button 
                    variant={slotsCount > 0 ? "light" : "default"}
                    size="xs" fullWidth
                    color={slotsCount > 0 ? 'blue' : 'gray'}
                    leftSection={<IconFilter size={14} />}
                    rightSection={slotsCount > 0 && <Badge size="xs" circle>{combinations}</Badge>}
                    onClick={() => openFiltersModal(order.id, order.filterSlots)}
                  >
                    {slotsCount > 0 
                      ? `Групп: ${slotsCount}` 
                      : 'Настроить'}
                  </Button>
                </Table.Td>
                <Table.Td>
                  <ActionIcon color="red" variant="subtle" onClick={() => removeOrder(order.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
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
        <Group gap="xs">
          <Text size="sm">Итого:</Text>
          <Badge 
            size="lg" color={Math.abs(currentTotalVolume - 100) < 0.1 ? 'green' : 'red'}
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
      </Group>

      {/* ПОДКЛЮЧЕНИЕ МОДАЛКИ */}
      <FiltersModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Настройка фильтров"
        initialSlots={currentSlots}
        onSave={saveFilters}
      />

    </Paper>
  );
}