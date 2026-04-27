import {
  Table,
  ScrollArea,
  Stack,
  Text,
  Anchor,
  Badge,
  Group,
  UnstyledButton,
  Center,
  Loader,
  Pagination,
  Select,
  Paper
} from '@mantine/core';
import { IconSelector, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import dayjs from 'dayjs';

import type { BacktestResultItem } from '../../types';
import type { SortKey, SortState } from '../../hooks/useResultsData';
import { formatMoney, formatPercent, formatDate, formatDurationHuman } from '../../utils/formatters';
import { getVelesCabinetBacktestUrl } from '../../config/velesDomains';

interface Props {
  data: BacktestResultItem[];
  loading: boolean;
  height?: string;
  sort: SortState;
  onToggleSort: (key: SortKey) => void;
  visibleColumns: Record<string, boolean>;
  page: number;
  onPageChange: (value: number) => void;
  pageSize: string;
  onPageSizeChange: (value: string) => void;
  total: number;
}

export function ResultsTable({
  data,
  loading,
  height = '65vh',
  sort,
  onToggleSort,
  visibleColumns,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total
}: Props) {
  const getTemplateCode = (url: string | undefined): string | null => {
    if (!url) return null;
    const match = url.match(/\/share\/([A-Za-z0-9_-]+)/i);
    return match?.[1] ?? null;
  };

  const limit = Math.max(1, Number.parseInt(pageSize, 10) || 20);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const Th = ({ children, sortKey, id, align = 'center' }: { children: React.ReactNode; sortKey?: SortKey; id: string; align?: 'left' | 'center' | 'right' }) => {
    if (!visibleColumns[id]) return null;
    return (
      <Table.Th style={{ whiteSpace: 'nowrap', textAlign: align }}>
        <UnstyledButton onClick={() => sortKey && onToggleSort(sortKey)} style={{ fontWeight: 700, fontSize: 12 }}>
          <Group gap={4} justify={align === 'center' ? 'center' : 'flex-start'}>
            {children}
            {sortKey && sort.key === sortKey && (sort.reversed ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />)}
            {sortKey && sort.key !== sortKey && <IconSelector size={14} style={{ opacity: 0.3 }} />}
          </Group>
        </UnstyledButton>
      </Table.Th>
    );
  };

  return (
    <Stack gap="sm" h={height}>
      <Paper
        withBorder
        radius="md"
        style={{
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}
      >
        {loading ? (
          <Center h="100%"><Loader type="dots" /></Center>
        ) : (
          <ScrollArea h="100%" type="auto" offsetScrollbars>
            <Table stickyHeader highlightOnHover verticalSpacing="xs">
              <Table.Thead bg="gray.1">
                <Table.Tr>
                  <Th id="name" sortKey="name" align="left">Название</Th>
                  <Th id="exchange" sortKey="exchange">Биржа</Th>
                  <Th id="pair" sortKey="symbol">Пара</Th>
                  <Th id="sourceTemplate" sortKey="sourceTemplateUrl" align="center">Шаблон</Th>
                  <Th id="period" sortKey="from">Период</Th>
                  <Th id="days" sortKey="days">История (дни)</Th>
                  <Th id="net" sortKey="netQuote">Net (USDT)</Th>
                  <Th id="recovery" sortKey="recoveryFactor">Net / МПУ</Th>
                  <Th id="effDay" sortKey="netQuotePerDay">Эфф. в день</Th>
                  <Th id="deals" sortKey="totalDeals">Сделки</Th>
                  <Th id="dealsPerDay" sortKey="dealsPerDay">Сделок/день</Th>
                  <Th id="mfeAbs" sortKey="mfeAbsolute">МПП (USDT)</Th>
                  <Th id="mfePct" sortKey="mfePercent">МПП (%)</Th>
                  <Th id="maeAbs" sortKey="maeAbsolute">МПУ (USDT)</Th>
                  <Th id="maePct" sortKey="maePercent">МПУ (%)</Th>
                  <Th id="avgTime" sortKey="avgDuration">Ср. время</Th>
                  <Th id="maxTime" sortKey="maxDuration">Макс время</Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((row) => {
                  const isProfit = (row.netQuote || 0) >= 0;
                  const daysCount = dayjs(row.to).diff(dayjs(row.from), 'day');

                  const maeAbs = Math.abs(row.maeAbsolute || 0);
                  const recovery = maeAbs > 0
                    ? ((row.netQuote || 0) / maeAbs).toFixed(2)
                    : '∞';

                  const dPerDay = ((row.totalDeals || 0) / Math.max(1, daysCount)).toFixed(1);

                  return (
                    <Table.Tr key={row.id}>
                      {visibleColumns.name && (
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={600} size="sm" title={row.name} truncate="end" style={{ maxWidth: '20vw' }}>
                              {row.name}
                            </Text>
                            <Anchor href={getVelesCabinetBacktestUrl(row.id)} target="_blank" size="xs" underline="hover">
                              ID: {row.id}
                            </Anchor>
                          </Stack>
                        </Table.Td>
                      )}
                      {visibleColumns.exchange && <Table.Td ta="center"><Text size="xs">{row.exchange}</Text></Table.Td>}
                      {visibleColumns.pair && (
                        <Table.Td ta="center">
                          <Stack gap={2} align="center">
                            <Text fw={600} size="sm">{row.symbol}</Text>
                            <Badge size="xs" variant="light" color={row.algorithm === 'LONG' ? 'green' : 'red'}>{row.algorithm}</Badge>
                          </Stack>
                        </Table.Td>
                      )}
                      {visibleColumns.sourceTemplate && (
                        <Table.Td ta="center">
                          {row.sourceTemplateUrl ? (
                            <Anchor href={row.sourceTemplateUrl} target="_blank" size="xs" underline="hover">
                              {getTemplateCode(row.sourceTemplateUrl) ?? row.sourceTemplateUrl}
                            </Anchor>
                          ) : (
                            <Text size="xs" c="dimmed">-</Text>
                          )}
                        </Table.Td>
                      )}
                      {visibleColumns.period && (
                        <Table.Td ta="center">
                          <Stack gap={0}>
                            <Text size="xs">{formatDate(row.from)}</Text>
                            <Text size="xs" c="dimmed">до {formatDate(row.to)}</Text>
                          </Stack>
                        </Table.Td>
                      )}
                      {visibleColumns.days && <Table.Td ta="center"><Text size="xs">{daysCount} дн.</Text></Table.Td>}
                      {visibleColumns.net && (
                        <Table.Td ta="center">
                          <Text fw={700} size="sm" c={isProfit ? 'teal' : 'red'}>{formatMoney(row.netQuote)}</Text>
                        </Table.Td>
                      )}
                      {visibleColumns.recovery && (
                        <Table.Td ta="center">
                          <Text size="sm" fw={500} c={Number(recovery) > 1.5 ? 'teal' : 'dark'}>{recovery}</Text>
                        </Table.Td>
                      )}
                      {visibleColumns.effDay && (
                        <Table.Td ta="center">
                          <Text size="sm" c={(row.netQuotePerDay || 0) >= 0 ? 'teal' : 'red'}>{formatMoney(row.netQuotePerDay)}</Text>
                        </Table.Td>
                      )}
                      {visibleColumns.deals && (
                        <Table.Td ta="center">
                          <Stack gap={0}>
                            <Text fw={600}>{row.totalDeals}</Text>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ color: 'var(--mantine-color-teal-6)' }}>{row.profits}</span>
                              {' / '}
                              <span style={{ color: 'var(--mantine-color-red-6)' }}>{row.losses}</span>
                              {' / '}
                              {row.breakevens}
                            </Text>
                          </Stack>
                        </Table.Td>
                      )}
                      {visibleColumns.dealsPerDay && <Table.Td ta="center"><Text size="sm">{dPerDay}</Text></Table.Td>}
                      {visibleColumns.mfeAbs && <Table.Td ta="center"><Text size="sm" c="teal">{formatMoney(row.mfeAbsolute)}</Text></Table.Td>}
                      {visibleColumns.mfePct && <Table.Td ta="center"><Text size="sm" c="teal">{formatPercent(row.mfePercent)}</Text></Table.Td>}
                      {visibleColumns.maeAbs && <Table.Td ta="center"><Text size="sm" c="red">{formatMoney(row.maeAbsolute)}</Text></Table.Td>}
                      {visibleColumns.maePct && <Table.Td ta="center"><Text size="sm" c="red">{formatPercent(row.maePercent)}</Text></Table.Td>}
                      {visibleColumns.avgTime && <Table.Td ta="center"><Text size="sm">{formatDurationHuman(row.avgDuration)}</Text></Table.Td>}
                      {visibleColumns.maxTime && <Table.Td ta="center"><Text size="sm">{formatDurationHuman(row.maxDuration)}</Text></Table.Td>}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>

      <Group justify="space-between" mt="xs" style={{ flexShrink: 0 }}>
        <Group gap="xs">
          <Text size="sm" c="dimmed">Показывать по:</Text>
          <Select
            size="xs"
            w={90}
            data={['20', '50', '100', '500', '1000']}
            value={pageSize}
            onChange={(v) => {
              if (v) {
                onPageSizeChange(v);
                onPageChange(1);
              }
            }}
            allowDeselect={false}
          />
          <Text size="sm" c="dimmed">Всего: {total}</Text>
        </Group>

        {totalPages > 1 && (
          <Pagination total={totalPages} value={Math.min(page, totalPages)} onChange={onPageChange} size="sm" />
        )}
      </Group>
    </Stack>
  );
}
