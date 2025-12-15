import { SimpleGrid, Switch, Group, Text, Paper, Collapse } from '@mantine/core';
import { SmartMultiSelect } from '../SmartMultiSelect';
import type { OrderSimpleConfig } from '../../types';

interface Props {
  config: OrderSimpleConfig;
  onChange: (cfg: OrderSimpleConfig) => void;
}

// --- ГЕНЕРАТОР ---
const r = (start: number, end: number, step: number) => {
  const result = [];
  for (let i = start; i <= end + 0.00001; i += step) {
    result.push(parseFloat(i.toFixed(2)).toString());
  }
  return result;
};

// 1. Orders (Штуки) - БЕЗ процентов
const ORDERS_PRESETS = r(2, 60, 1);

// 2. Martingale (Проценты)
const MARTINGALE_PRESETS = r(1, 500, 1).map(x => `${x}%`);

// 3. Indent (Проценты)
const INDENT_PRESETS = [
  ...r(0, 0.1, 0.01),
  ...r(0.15, 1, 0.05),
  ...r(1.1, 5, 0.1),
  ...r(5.5, 10, 0.5)
].map(x => `${x}%`);

// 4. Overlap (Проценты)
const OVERLAP_PRESETS = [
  ...r(0.5, 1, 0.05),
  ...r(1.1, 3, 0.1),
  ...r(4, 99, 1)
].map(x => `${x}%`);

// 5. Log Factor (Коэффициент) - БЕЗ процентов
const LOG_PRESETS = r(0.1, 2.9, 0.1);


export function SimpleMode({ config, onChange }: Props) {
  
  const update = (key: keyof OrderSimpleConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <Paper p="md" withBorder bg="white">
      <SimpleGrid cols={2} spacing="md">
        
        <SmartMultiSelect
          label="Сетка ордеров (Orders)"
          placeholder="2-60"
          data={ORDERS_PRESETS}
          value={config.orders}
          onChange={(v) => update('orders', v)}
        />

        <SmartMultiSelect
          label="% Мартингейла"
          placeholder="1-500%"
          data={MARTINGALE_PRESETS}
          value={config.martingale}
          onChange={(v) => update('martingale', v)}
        />

        <SmartMultiSelect
          label="Отступ (%)"
          placeholder="Выберите отступ"
          data={INDENT_PRESETS}
          value={config.indent}
          onChange={(v) => update('indent', v)}
        />

        <SmartMultiSelect
          label="Перекрытие (%)"
          placeholder="Выберите перекрытие"
          data={OVERLAP_PRESETS}
          value={config.overlap}
          onChange={(v) => update('overlap', v)}
        />

      </SimpleGrid>

      {/* ЛОГАРИФМИЧЕСКОЕ РАСПРЕДЕЛЕНИЕ */}
      <Paper mt="md" p="xs" bg="gray.0" radius="sm">
        <Group justify="space-between" mb={config.logarithmicEnabled ? 'xs' : 0}>
          <div>
            <Text size="sm" fw={500}>Логарифмическое распределение</Text>
            <Text size="xs" c="dimmed">
              {config.logarithmicEnabled ? 'Strategy: LOGARITHMIC' : 'Strategy: LINEAR'}
            </Text>
          </div>
          <Switch 
            checked={config.logarithmicEnabled}
            onChange={(e) => update('logarithmicEnabled', e.currentTarget.checked)}
            labelPosition="left"
            label={config.logarithmicEnabled ? "ВКЛ" : "ВЫКЛ"}
          />
        </Group>

        <Collapse in={config.logarithmicEnabled}>
          <SmartMultiSelect
            label="Коэффициенты (Log Factor)"
            description="Значения от 0.1 до 2.9"
            placeholder="Выберите коэффициент"
            data={LOG_PRESETS}
            value={config.logarithmicFactor}
            onChange={(v) => update('logarithmicFactor', v)}
          />
        </Collapse>
      </Paper>
    </Paper>
  );
}