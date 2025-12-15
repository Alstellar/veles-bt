import { 
  Paper, SimpleGrid, Select, TextInput, NumberInput, SegmentedControl, Text, 
  Group, Button, Switch, Divider 
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import dayjs from 'dayjs';
import '@mantine/dates/styles.css';

import type { StaticConfig } from '../types';

interface Props {
  config: StaticConfig;
  onChange: (newConfig: StaticConfig) => void;
}

export function StaticSettings({ config, onChange }: Props) {
  
  const update = (key: keyof StaticConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const setPresetDate = (months: number | 'all') => {
    const to = new Date();
    let from = new Date();

    if (months === 'all') {
      from = new Date('2020-01-01');
    } else {
      from = dayjs().subtract(months, 'month').toDate();
    }

    onChange({ ...config, dateTo: to, dateFrom: from });
  };

  return (
    <Paper withBorder p="md" radius="md" bg="gray.0">
      <Text size="sm" fw={700} mb="xs" c="dimmed" tt="uppercase">
        Базовые настройки
      </Text>

      {/* 1. Имя и Биржа */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <TextInput
          label="Имя теста (Префикс)"
          placeholder="MyStrategy"
          value={config.namePrefix}
          onChange={(e) => update('namePrefix', e.currentTarget.value)}
          rightSectionWidth={70}
          rightSection={
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              | 1/X
            </Text>
          }
        />
        
        <Select
          label="Биржа"
          data={[
            'BINANCE_FUTURES', 'BINANCE_SPOT',
            'BYBIT_FUTURES', 'BYBIT_SPOT',
            'OKX_FUTURES', 'OKX_SPOT'
          ]}
          value={config.exchange}
          onChange={(v) => update('exchange', v)}
          allowDeselect={false}
          searchable
        />
      </SimpleGrid>

      {/* 2. Монета, Алго, Депо, Плечо */}
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <TextInput
          label="Монета"
          placeholder="BTC"
          value={config.symbol}
          onChange={(e) => update('symbol', e.currentTarget.value.toUpperCase())}
          rightSection={<Text size="xs" c="dimmed" mr="xs">/USDT</Text>}
        />

        <div>
           <Text size="sm" fw={500} mt={2} mb={3}>Алгоритм</Text>
           <SegmentedControl
            fullWidth
            size="xs"
            color={config.algo === 'LONG' ? 'green' : 'red'}
            data={[
              { label: 'Long 📈', value: 'LONG' },
              { label: 'Short 📉', value: 'SHORT' }
            ]}
            value={config.algo}
            onChange={(v) => update('algo', v)}
          />
        </div>

        <NumberInput
          label="Депозит ($)"
          value={config.deposit}
          onChange={(v) => update('deposit', v)}
          min={10} allowNegative={false}
        />

        <NumberInput
          label="Плечо (x)"
          value={config.leverage}
          onChange={(v) => update('leverage', v)}
          min={1} max={125} allowNegative={false}
        />
      </SimpleGrid>

      <Divider my="sm" label="Даты и Период" labelPosition="center" />

      {/* 3. Даты */}
      <Group justify="center" gap={5} mb="xs">
        <Button variant="default" size="xs" onClick={() => setPresetDate(1)}>1 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(3)}>3 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(6)}>6 Мес</Button>
        <Button variant="default" size="xs" onClick={() => setPresetDate(12)}>1 Год</Button>
      </Group>

      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <DateInput
          value={config.dateFrom}
          onChange={(v) => update('dateFrom', v)}
          label="Дата начала (From)"
          valueFormat="DD.MM.YYYY"
        />
        <DateInput
          value={config.dateTo}
          onChange={(v) => update('dateTo', v)}
          label="Дата конца (To)"
          valueFormat="DD.MM.YYYY"
        />
      </SimpleGrid>

      <Divider my="sm" label="Дополнительно" labelPosition="center" />

      {/* 4. Комиссии (Теперь во всю ширину - 2 колонки) */}
      <SimpleGrid cols={2} spacing="xs">
        <TextInput
          label="Maker Fee (%)"
          value={config.makerFee}
          onChange={(e) => update('makerFee', e.currentTarget.value)}
        />
        <TextInput
          label="Taker Fee (%)"
          value={config.takerFee}
          onChange={(e) => update('takerFee', e.currentTarget.value)}
        />
      </SimpleGrid>
      
      {/* Portion мы удалили из UI, но в App.tsx он остался как 7 по умолчанию */}

      <Group mt="md" justify="space-between">
        <Switch 
          label="Публичный тест" 
          checked={config.isPublic}
          onChange={(e) => update('isPublic', e.currentTarget.checked)}
        />
        <Switch 
          label="Учитывать тени (Wicks)" 
          checked={config.useWicks}
          onChange={(e) => update('useWicks', e.currentTarget.checked)}
        />
      </Group>

    </Paper>
  );
}