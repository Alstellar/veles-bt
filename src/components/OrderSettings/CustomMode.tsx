import { useState, useEffect } from 'react';
import {
  Paper,
  Group,
  Text,
  Button,
  ActionIcon,
  Table,
  Center,
  NumberInput,
  Badge,
  Tooltip,
  ThemeIcon,
  SimpleGrid,
  Stack
} from '@mantine/core';
import { IconPlus, IconTrash, IconCalculator, IconCopy } from '@tabler/icons-react';

import { MultiInput } from '../MultiInput';
import type { OrderCustomConfig, CustomOrderLine } from '../../types';
import { cloneCustomOrderWithNewId } from '../../utils/filterClone';

const randomId = () => Math.random().toString(36).substr(2, 9);

interface Props {
  config: OrderCustomConfig;
  onChange: (cfg: OrderCustomConfig) => void;
}

export function CustomMode({ config, onChange }: Props) {
  const [calcMartingale, setCalcMartingale] = useState<number>(5);

  useEffect(() => {
    if (config.orders.length === 0) {
      const initialOrder: CustomOrderLine = {
        id: randomId(),
        indent: ['0'],
        volume: 100
      };
      onChange({ ...config, orders: [initialOrder] });
    }
  }, []);

  const update = (newOrders: CustomOrderLine[]) => {
    onChange({ ...config, orders: newOrders });
  };

  const updateOrder = (id: string, field: keyof CustomOrderLine, value: any) => {
    const newOrders = config.orders.map((order) => {
      if (order.id === id) return { ...order, [field]: value };
      return order;
    });
    update(newOrders);
  };

  const addOrder = () => {
    const newOrder: CustomOrderLine = {
      id: randomId(),
      indent: [],
      volume: 0
    };
    update([...config.orders, newOrder]);
  };

  const duplicateOrder = (id: string) => {
    const index = config.orders.findIndex((o) => o.id === id);
    if (index === -1) return;

    const source = config.orders[index];
    const newOrder = cloneCustomOrderWithNewId(source);
    const newOrders = [...config.orders];
    newOrders.splice(index + 1, 0, newOrder);
    update(newOrders);
  };

  const removeOrder = (id: string) => {
    if (config.orders.length <= 1) return;
    update(config.orders.filter((o) => o.id !== id));
  };

  const applyCalculator = () => {
    const count = config.orders.length;
    if (count === 0) return;

    const q = 1 + (calcMartingale / 100);
    let startVolume = 0;

    if (calcMartingale === 0) {
      startVolume = 100 / count;
    } else {
      startVolume = (100 * (1 - q)) / (1 - Math.pow(q, count));
    }

    const weights: number[] = [];
    let current = startVolume;

    for (let i = 0; i < count; i++) {
      weights.push(current);
      current *= q;
    }

    const rounded = weights.map((w) => Math.round(w * 100) / 100);
    const currentSum = rounded.reduce((a, b) => a + b, 0);
    const diff = 100 - currentSum;

    if (Math.abs(diff) > 0.0001) {
      const lastIdx = rounded.length - 1;
      rounded[lastIdx] = Number((rounded[lastIdx] + diff).toFixed(2));
    }

    const newOrders = config.orders.map((o, idx) => ({ ...o, volume: rounded[idx] }));
    update(newOrders);
  };

  const currentTotalVolume = Number(config.orders.reduce((acc, o) => acc + o.volume, 0).toFixed(2));

  return (
    <Paper p="md" withBorder bg="white">
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
              Авторасчет объемов для всех {config.orders.length} ордеров
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
          <Center h="100%">
            <Text size="sm" c="dimmed" fs="italic" ta="center">
              В режиме Custom все ордера равнозначны.
              <br />
              Сумма объемов должна быть 100%.
            </Text>
          </Center>
        </Paper>
      </SimpleGrid>

      <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
        <Table.Thead bg="gray.1">
          <Table.Tr>
            <Table.Th w={50} ta="center">№</Table.Th>
            <Table.Th ta="center">Отступ (%)</Table.Th>
            <Table.Th ta="center">Объем (%)</Table.Th>
            <Table.Th w={70} />
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {config.orders.map((order, index) => (
            <Table.Tr key={order.id}>
              <Table.Td ta="center">
                <Text fw={700} size="sm">{index + 1}</Text>
                {index === 0 && (
                  <Text size="8px" c="dimmed" style={{ lineHeight: 1 }}>START</Text>
                )}
              </Table.Td>
              <Table.Td>
                <MultiInput
                  label=""
                  placeholder="Отступ"
                  value={order.indent}
                  onChange={(v) => updateOrder(order.id, 'indent', v)}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  size="sm"
                  variant="unstyled"
                  value={order.volume}
                  onChange={(v) => updateOrder(order.id, 'volume', Number(v))}
                  style={{ textAlign: 'center', fontWeight: 500 }}
                  styles={{ input: { textAlign: 'center' } }}
                />
              </Table.Td>
              <Table.Td>
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
                    disabled={config.orders.length <= 1}
                    onClick={() => removeOrder(order.id)}
                    title="Удалить ордер"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Group justify="space-between" mt="xs" align="center">
        <Button
          variant="outline"
          size="xs"
          leftSection={<IconPlus size={16} />}
          onClick={addOrder}
          style={{ borderStyle: 'dashed' }}
        >
          Добавить ордер
        </Button>
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
      </Group>
    </Paper>
  );
}
