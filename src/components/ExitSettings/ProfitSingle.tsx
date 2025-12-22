import { Stack, MultiSelect, Text, TextInput, SimpleGrid, Paper, Center } from '@mantine/core';
import { PROFIT_OPTIONS } from '../../utils/profitGen';
import type { ProfitSingleConfig } from '../../types';

interface Props {
  config: ProfitSingleConfig;
  onChange: (cfg: ProfitSingleConfig) => void;
}

export function ProfitSingle({ config, onChange }: Props) {
  
  const handleChange = (values: string[]) => {
    onChange({ ...config, percents: values });
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Выберите один или несколько вариантов процента профита для перебора.
      </Text>
      
      <SimpleGrid cols={2} spacing="md">
        
        {/* ЛЕВЫЙ БЛОК: Выбор процентов */}
        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
             <MultiSelect
                label="Процент профита"
                placeholder="Выберите проценты"
                data={PROFIT_OPTIONS}
                value={config.percents}
                onChange={handleChange}
                searchable
                clearable
                hidePickedOptions
                size="sm"
                w="100%"
            />
        </Paper>

        {/* ПРАВЫЙ БЛОК: Валюта (USDT) */}
        <Paper withBorder p="sm" bg="gray.0" radius="md" h="100%">
             <Center h="100%" style={{ alignItems: 'flex-start' }}> {/* Выравнивание инпута */}
                <TextInput 
                    label="Валюта профита"
                    value="USDT"
                    disabled
                    size="sm"
                    w="100%"
                    styles={{ input: { color: 'black', opacity: 0.7, fontWeight: 600 } }}
                />
             </Center>
        </Paper>

      </SimpleGrid>
    </Stack>
  );
}