import { useState } from 'react';
import { 
  Paper, Group, Text, Button, ActionIcon, Table, 
  NumberInput, Badge, Tooltip, ThemeIcon, SimpleGrid, Stack, Select 
} from '@mantine/core';
import { IconPlus, IconTrash, IconCalculator } from '@tabler/icons-react';

import { MultiInput } from '../MultiInput'; 
import type { ProfitMultipleConfig, ProfitCustomOrderLine, BreakevenType } from '../../types';

const randomId = () => Math.random().toString(36).substr(2, 9);

interface Props {
  config: ProfitMultipleConfig;
  onChange: (cfg: ProfitMultipleConfig) => void;
}

export function ProfitCustom({ config, onChange }: Props) {
  
  const [calcMartingale, setCalcMartingale] = useState<number>(5);

  const updateConfig = (updates: Partial<ProfitMultipleConfig>) => {
    onChange({ ...config, ...updates });
  };

  const updateOrder = (id: string, field: keyof ProfitCustomOrderLine, value: any) => {
    const newOrders = config.orders.map(order => {
      if (order.id === id) return { ...order, [field]: value };
      return order;
    });
    updateConfig({ orders: newOrders });
  };

  const addOrder = () => {
    const newOrder: ProfitCustomOrderLine = {
      id: randomId(),
      indent: [], 
      volume: 10
    };
    updateConfig({ orders: [...config.orders, newOrder] });
  };

  const removeOrder = (id: string) => {
    updateConfig({ orders: config.orders.filter(o => o.id !== id) });
  };

  // --- КАЛЬКУЛЯТОР ---
  const applyCalculator = () => {
    const totalOrdersCount = config.orders.length;
    if (totalOrdersCount === 0) return;

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
    
    const newOrders = config.orders.map((o, idx) => ({ ...o, volume: rounded[idx] }));
    updateConfig({ orders: newOrders });
  };

  const currentTotalVolume = Number(
    config.orders.reduce((acc, o) => acc + (o.volume || 0), 0).toFixed(2)
  );

  return (
    <Paper p="md" withBorder bg="white">
      
      {/* ВЕРХНЯЯ ПАНЕЛЬ: Калькулятор и Б/У */}
      <SimpleGrid cols={2} spacing="md" mb="md">
        
        {/* ЛЕВАЯ ЧАСТЬ: Калькулятор */}
        <Paper withBorder p="sm" bg="blue.0" radius="md" h="100%">
          <Stack gap="xs" h="100%" justify="space-between">
              <Group align="flex-end" wrap="nowrap">
                 <NumberInput 
                    label="Мартингейл (%)" 
                    size="sm" // Увеличили размер шрифта
                    w="100%"
                    value={calcMartingale} 
                    onChange={(v) => setCalcMartingale(Number(v))} 
                    min={0}
                />
                <Button 
                  size="sm" // Увеличили кнопку под инпут
                  variant="filled" 
                  color="blue" 
                  onClick={applyCalculator}
                  leftSection={<IconCalculator size={16} />}
                  style={{ flexShrink: 0 }}
                >
                  Рассчитать
                </Button>
             </Group>
             <Text size="xs" c="dimmed" ta="center">
                Авторасчет объемов тейков
             </Text>
          </Stack>
        </Paper>

        {/* ПРАВАЯ ЧАСТЬ: Стоп в Б/У */}
        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
            {/* Используем Stack justify=space-between, чтобы выровнять контент аналогично левому блоку */}
            <Stack gap="xs" h="100%" justify="flex-start"> 
                 <Select
                    size="sm" // Увеличили размер
                    label="Стоп в Б/У"
                    placeholder="Выключено"
                    data={[
                        { value: 'null', label: 'Выключено' },
                        { value: 'AVERAGE', label: 'От средней (Average)' },
                        { value: 'PROFIT', label: 'От ТП (Profit)' },
                    ]}
                    value={config.breakeven || 'null'}
                    onChange={(v) => updateConfig({ breakeven: v === 'null' ? null : v as BreakevenType })}
                    w="100%"
                    allowDeselect={false}
                />
                {/* Пустой блок или текст можно добавить сюда для симметрии по высоте, если нужно, 
                    но justify="flex-start" прижмет селект к верху, как и инпут слева */}
            </Stack>
        </Paper>
      </SimpleGrid>

      {/* ТАБЛИЦА ОРДЕРОВ */}
      <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
        <Table.Thead bg="gray.1">
          <Table.Tr>
            <Table.Th w={50} ta="center">№</Table.Th>
            <Table.Th ta="center">Отступ (%)</Table.Th>
            <Table.Th ta="center">Объем (%)</Table.Th>
            <Table.Th w={50} />
          </Table.Tr>
        </Table.Thead>
        
        <Table.Tbody>
          {config.orders.length === 0 && (
             <Table.Tr>
                <Table.Td colSpan={4} ta="center" c="dimmed" py="lg">
                    Нет ордеров тейк-профита. Добавьте хотя бы один.
                </Table.Td>
             </Table.Tr>
          )}

          {config.orders.map((order, index) => (
              <Table.Tr key={order.id}>
                <Table.Td ta="center">
                  <Text fw={500} size="sm">{index + 1}</Text>
                </Table.Td>
                <Table.Td>
                  <MultiInput
                    label=""
                    value={order.indent}
                    onChange={(v) => updateOrder(order.id, 'indent', v)}
                    placeholder="Напр: 1.0"
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="sm" variant="unstyled"
                    value={order.volume}
                    onChange={(v) => updateOrder(order.id, 'volume', Number(v))}
                    style={{ textAlign: 'center' }}
                    styles={{ input: { textAlign: 'center' } }}
                    min={0} max={100}
                    allowNegative={false}
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon color="red" variant="subtle" onClick={() => removeOrder(order.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      
      {/* НИЖНЯЯ ПАНЕЛЬ */}
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

    </Paper>
  );
}