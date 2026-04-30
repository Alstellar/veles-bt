import { useState } from 'react';
import { 
  Paper, Group, Text, Button, ActionIcon, Table, 
  NumberInput, Badge, Tooltip, ThemeIcon, SimpleGrid, Stack, Select, SegmentedControl
} from '@mantine/core';
import { IconPlus, IconTrash, IconCalculator } from '@tabler/icons-react';

import { MultiInput } from '../MultiInput'; 
import type { ProfitMultipleConfig, ProfitCustomOrderLine, BreakevenType } from '../../types';
import {
  CUSTOM_VOLUME_STEP,
  generateCustomVolumeDistributions,
  getCustomOrderVolumeRange,
  getCustomOrderVolumeValues
} from '../../utils/customOrderVolumes';

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

  const withVolumeDefaults = (order: ProfitCustomOrderLine, isLast: boolean): ProfitCustomOrderLine => ({
    ...order,
    volumeRange: order.volumeRange ?? {
      from: String(order.volume || 0),
      to: String(order.volume || 0),
      step: String(CUSTOM_VOLUME_STEP)
    },
    volumeValues: order.volumeValues ?? (!isLast && order.volume > 0 ? [String(order.volume)] : [])
  });

  const changeVolumeMode = (value: ProfitMultipleConfig['volumeMode']) => {
    updateConfig({
      volumeMode: value,
      orders: config.orders.map((order, index) => withVolumeDefaults(order, index === config.orders.length - 1))
    });
  };

  const updateVolumeRange = (id: string, field: 'from' | 'to' | 'step', value: string | number) => {
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
    updateConfig({ orders: newOrders });
  };

  const updateVolumeValues = (id: string, values: string[]) => {
    updateOrder(id, 'volumeValues', values);
  };

  const addOrder = () => {
    const newOrder: ProfitCustomOrderLine = {
      id: randomId(),
      indent: [], 
      volume: 10,
      volumeRange: { from: '0', to: '0', step: String(CUSTOM_VOLUME_STEP) },
      volumeValues: []
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
  const volumeMode = config.volumeMode ?? 'FIXED';
  const volumeDistributionResult = volumeMode !== 'FIXED'
    ? generateCustomVolumeDistributions(config.orders, volumeMode)
    : null;

  const renderVolumeInput = (order: ProfitCustomOrderLine, index: number) => {
    const isLast = index === config.orders.length - 1;

    if (volumeMode === 'LIST' && !isLast) {
      return (
        <MultiInput
          label="Значения"
          placeholder="Объем"
          value={getCustomOrderVolumeValues(order)}
          onChange={(values) => updateVolumeValues(order.id, values)}
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
            onChange={(v) => updateVolumeRange(order.id, 'from', v || 0)}
          />
          <NumberInput
            label="До"
            size="xs"
            min={0.01}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).to)}
            onChange={(v) => updateVolumeRange(order.id, 'to', v || 0)}
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
            onChange={(v) => updateVolumeRange(order.id, 'from', v || 0)}
          />
          <NumberInput
            label="До"
            size="xs"
            min={CUSTOM_VOLUME_STEP}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).to)}
            onChange={(v) => updateVolumeRange(order.id, 'to', v || 0)}
          />
          <NumberInput
            label="Шаг"
            size="xs"
            min={CUSTOM_VOLUME_STEP}
            step={CUSTOM_VOLUME_STEP}
            value={Number(getCustomOrderVolumeRange(order).step)}
            onChange={(v) => updateVolumeRange(order.id, 'step', v || CUSTOM_VOLUME_STEP)}
          />
        </SimpleGrid>
      );
    }

    return (
      <NumberInput
        size="sm"
        variant="unstyled"
        value={order.volume}
        onChange={(v) => updateOrder(order.id, 'volume', Number(v))}
        style={{ textAlign: 'center' }}
        styles={{ input: { textAlign: 'center' } }}
        min={0}
        max={100}
        allowNegative={false}
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
          onChange={(value) => changeVolumeMode(value as ProfitMultipleConfig['volumeMode'])}
          data={[
            { value: 'FIXED', label: 'Мартингейл / фикс.' },
            { value: 'LIST', label: 'Списки' },
            { value: 'RANGE', label: 'Диапазоны' }
          ]}
        />
      </Group>
      
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
                    disabled={volumeMode !== 'FIXED'}
                />
                <Button 
                  size="sm" // Увеличили кнопку под инпут
                  variant="filled" 
                  color="blue" 
                  onClick={applyCalculator}
                  disabled={volumeMode !== 'FIXED'}
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
      <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: 50 }} />
          <col style={{ width: '50%' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: 70 }} />
        </colgroup>
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
                <Table.Td style={{ minWidth: 0 }}>
                  <MultiInput
                    label={volumeMode !== 'FIXED' ? 'Значения' : ''}
                    value={order.indent}
                    onChange={(v) => updateOrder(order.id, 'indent', v)}
                    placeholder="Напр: 1.0"
                  />
                </Table.Td>
                <Table.Td>
                  {renderVolumeInput(order, index)}
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

    </Paper>
  );
}
