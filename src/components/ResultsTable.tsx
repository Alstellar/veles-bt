import { Table, Badge, Text, ScrollArea, Anchor, ThemeIcon } from '@mantine/core';
import { IconExternalLink, IconCheck, IconX, IconClock, IconPlayerPause } from '@tabler/icons-react';
import type { TestResult } from '../types';

interface Props {
  results: TestResult[];
}

export function ResultsTable({ results }: Props) {
  
  const rows = results.map((row) => {
    const isSuccess = row.status === 'FINISHED';
    const isError = row.status === 'ERROR' || row.status === 'TIMEOUT';
    const isRunning = row.status === 'RUNNING';
    
    // Цвет профита (Зеленый / Красный)
    const netProfit = row.stats?.netQuote || 0;
    const profitColor = netProfit > 0 ? 'green' : (netProfit < 0 ? 'red' : 'gray');

    // Форматирование ID для компактности
    const displayId = row.backtestId ? `#${row.backtestId}` : '...';

    return (
      <Table.Tr key={row.id} bg={isRunning ? 'blue.0' : undefined}>
        
        {/* Статус (Иконка) */}
        <Table.Td w={40} ta="center">
            {isRunning && <ThemeIcon color="blue" variant="light" size="sm"><IconClock size={14}/></ThemeIcon>}
            {isSuccess && <ThemeIcon color="green" variant="light" size="sm"><IconCheck size={14}/></ThemeIcon>}
            {isError && <ThemeIcon color="red" variant="light" size="sm"><IconX size={14}/></ThemeIcon>}
            {row.status === 'PENDING' && <ThemeIcon color="gray" variant="light" size="sm"><IconPlayerPause size={14}/></ThemeIcon>}
        </Table.Td>

        {/* Ссылка на тест */}
        <Table.Td>
            {row.shareToken ? (
                <Anchor href={`https://veles.finance/share/${row.shareToken}`} target="_blank" size="sm" fw={600} underline="hover">
                    {displayId} <IconExternalLink size={10} style={{ verticalAlign: 'top' }}/>
                </Anchor>
            ) : (
                <Text size="sm" c="dimmed">{displayId}</Text>
            )}
            {row.duration && <Text size="xs" c="dimmed">{row.duration}</Text>}
        </Table.Td>

        {/* Профит (Net Quote) */}
        <Table.Td>
            {isSuccess ? (
                <Text size="sm" fw={700} c={profitColor}>
                    {netProfit.toFixed(2)}$
                </Text>
            ) : '-'}
        </Table.Td>

        {/* Сделки */}
        <Table.Td>
             {isSuccess ? (
                <Text size="sm">{row.stats?.totalDeals}</Text>
            ) : '-'}
        </Table.Td>

        {/* Просадка (MAE) */}
        <Table.Td>
             {isSuccess ? (
                <Badge size="sm" color="red" variant="dot">
                    {row.stats?.maePercent?.toFixed(2)}%
                </Badge>
            ) : '-'}
        </Table.Td>

        {/* Ошибка (если есть) */}
        <Table.Td>
            {isError && (
                <Text size="xs" c="red" style={{ maxWidth: 150, lineHeight: 1.2 }}>
                    {row.error}
                </Text>
            )}
        </Table.Td>

      </Table.Tr>
    );
  });

  return (
    <ScrollArea h={400} offsetScrollbars type="auto">
        <Table stickyHeader striped highlightOnHover verticalSpacing="xs" withTableBorder>
            <Table.Thead bg="gray.1">
                <Table.Tr>
                <Table.Th w={40}></Table.Th>
                <Table.Th>ID</Table.Th>
                <Table.Th>Net Profit</Table.Th>
                <Table.Th>Deals</Table.Th>
                <Table.Th>Drawdown</Table.Th>
                <Table.Th>Info</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
        </Table>
        
        {results.length === 0 && (
            <Text c="dimmed" ta="center" py="xl" fs="italic">
                Результатов пока нет. Запустите очередь.
            </Text>
        )}
    </ScrollArea>
  );
}