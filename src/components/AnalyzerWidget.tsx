// src/components/AnalyzerWidget.tsx
import { useEffect, useState } from 'react';
import { Paper, Title, Group, Badge, Table, Text, Loader, Center, Button, Alert } from '@mantine/core';
import { IconArrowUp, IconArrowDown, IconMinus, IconRefresh, IconAlertCircle } from '@tabler/icons-react';
// 👇 Импортируем нашу логику анализа
import { performFullAnalysis, type AnalysisResult, type FullAnalysis } from '../services/AnalysisService';

interface Props {
  symbol: string;
  exchange: string;
  algo: 'LONG' | 'SHORT';
  onBack: () => void;
}

export function AnalyzerWidget({ symbol, exchange, algo, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Используем реальные типы данных
  const [data, setData] = useState<FullAnalysis | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      // 🚀 РЕАЛЬНЫЙ ЗАПРОС И РАСЧЕТ
      const results = await performFullAnalysis(symbol, exchange);
      setData(results);
    } catch (e: any) {
      console.error('Analysis failed:', e);
      setError('Ошибка загрузки данных. Проверьте пару или интернет.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    analyze();
  }, []);

  const getTrendIcon = (trend: string) => {
    if (trend === 'UP') return <IconArrowUp size={16} color="green" />;
    if (trend === 'DOWN') return <IconArrowDown size={16} color="red" />;
    return <IconMinus size={16} color="gray" />;
  };

  const getRsiColor = (val: number) => {
    if (val > 70) return 'red';
    if (val < 30) return 'green';
    return 'dimmed';
  };

  return (
    // Ограничиваем ширину виджета (maxW + mx="auto")
    <Paper p="md" w="100%" maw={500} mx="auto" withBorder shadow="sm">
      <Group justify="space-between" mb="md">
        <Button variant="subtle" size="xs" onClick={onBack} px={0}>
          ← Назад
        </Button>
        <Badge variant="light" color={algo === 'LONG' ? 'green' : 'red'} size="lg">
          {algo}
        </Badge>
      </Group>

      <Title order={4} ta="center" mb={5}>{symbol}</Title>
      <Text size="xs" c="dimmed" ta="center" mb="xl">
        {exchange.replace('_', ' ')}
      </Text>

      {loading ? (
        <Center h={150}>
            <Loader size="sm" type="dots" />
        </Center>
      ) : error ? (
        <Alert variant="light" color="red" title="Ошибка" icon={<IconAlertCircle />}>
          {error}
          <Button size="xs" variant="outline" color="red" mt="sm" onClick={analyze}>
            Повторить
          </Button>
        </Alert>
      ) : (
        <>
          <Table withTableBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="center">TF</Table.Th>
                <Table.Th ta="center">RSI</Table.Th>
                <Table.Th ta="center">Trend</Table.Th>
                <Table.Th ta="center">ADX</Table.Th>
                <Table.Th ta="center" c="dimmed">ATR</Table.Th>
                {/* Заменили Step на TP */}
                <Table.Th ta="center" fw={900} c="blue">TP</Table.Th>
                <Table.Th ta="center" fw={900} c="blue">Grid</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data && Object.entries(data).map(([tf, ind]) => {
                  const result = ind as AnalysisResult;
                  
                  // Расчеты настроек бота
                  const step = (result.atr_percent * 0.5).toFixed(2);
                  const grid = (result.atr_percent * 10).toFixed(2);

                  return (
                    <Table.Tr key={tf}>
                      <Table.Td ta="center" fw={700}>{tf}</Table.Td>
                      
                      <Table.Td ta="center">
                        <Text c={getRsiColor(result.rsi)} fw={500} span>
                            {result.rsi}
                        </Text>
                      </Table.Td>

                      <Table.Td ta="center">{getTrendIcon(result.trend)}</Table.Td>
                      <Table.Td ta="center">{result.adx}</Table.Td>
                      
                      <Table.Td ta="center" c="dimmed" fz="xs">
                        {result.atr_percent}%
                      </Table.Td>
                      
                      <Table.Td ta="center" fw={700} fz="sm">
                        {step}%
                      </Table.Td>
                      <Table.Td ta="center" fw={700} fz="sm">
                        {grid}%
                      </Table.Td>
                    </Table.Tr>
                  );
              })}
            </Table.Tbody>
          </Table>

          <Button 
            fullWidth mt="lg" variant="light" 
            leftSection={<IconRefresh size={16}/>}
            onClick={analyze}
          >
            Обновить анализ
          </Button>
        </>
      )}
    </Paper>
  );
}