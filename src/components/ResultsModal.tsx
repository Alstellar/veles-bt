import { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Modal, Table, Badge, Group, Text, ScrollArea, Loader, Stack, 
  ActionIcon, Menu, Checkbox, UnstyledButton, Center, Progress, Button
} from '@mantine/core';
import { 
  IconSelector, IconChevronDown, IconChevronUp, IconColumns, IconPlayerStop, IconTerminal2
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

import { DatabaseService } from '../services/DatabaseService';
import type { BacktestResultItem } from '../types';

dayjs.extend(duration);
dayjs.extend(relativeTime);

// --- Интерфейс пропсов ---
interface Props {
  opened: boolean;
  onClose: () => void;
  title: string;
  targetIds: number[]; 
  
  // Пропсы для режима Live
  isLive?: boolean;
  status?: string;
  progress?: { current: number; total: number };
  onStop?: () => void;
  logs?: string[]; // <-- НОВЫЙ ПРОП: Массив логов
}

// --- Русские названия столбцов ---
const COLUMN_NAMES: Record<string, string> = {
  name: 'Название',
  period: 'Период',
  exchange: 'Биржа',
  pair: 'Пара',
  net: 'Net (USDT)',
  effDay: 'Эфф. в день',
  deals: 'Сделки',
  winRate: 'Win rate',
  mfeAbs: 'МПП (USDT)', 
  mfePct: 'МПП (%)',
  maeAbs: 'МПУ (USDT)',
  maePct: 'МПУ (%)',
  maxTime: 'Макс время',
  avgTime: 'Ср. время'
};

// --- Хелперы ---
const formatMoney = (val: number | null, currency = 'USDT') => {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(2)} ${currency}`;
};

const formatPercent = (val: number | null) => {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(2)}%`;
};

const formatDurationHuman = (seconds: number | null) => {
  if (!seconds) return '—';
  const d = dayjs.duration(seconds, 'seconds');
  if (d.asDays() >= 1) return `${Math.floor(d.asDays())} д ${d.hours()} ч`;
  if (d.asHours() >= 1) return `${Math.floor(d.asHours())} ч ${d.minutes()} мин`;
  return `${Math.floor(d.asMinutes())} мин`;
};

const formatDate = (iso: string) => dayjs(iso).format('DD.MM.YYYY');

// --- Типы сортировки ---
type SortKey = keyof BacktestResultItem | 'winRate' | 'netPerDay';
interface SortState { key: SortKey; reversed: boolean; }

export function ResultsModal({ 
  opened, onClose, title, targetIds, 
  isLive, status, progress, onStop, logs = [] // <-- Дефолтное значение
}: Props) {
  
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestResultItem[]>([]);
  
  // Сортировка по умолчанию: Net Profit убывание
  const [sort, setSort] = useState<SortState>({ key: 'netQuote', reversed: true });
  
  // Видимость колонок
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true, period: true, exchange: true, pair: true,
    net: true, effDay: true, deals: true, winRate: true,
    mfeAbs: true, mfePct: true, maeAbs: true, maePct: true,
    maxTime: true, avgTime: true
  });
  
  // Реф для автоскролла логов
  const viewport = useRef<HTMLDivElement>(null);
  
  // Эффект автоскролла
  useEffect(() => {
    if (opened && logs.length > 0 && viewport.current) {
        // Скроллим вниз при добавлении новых логов
        viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs, opened]);

  // Загрузка данных
  useEffect(() => {
    if (opened && targetIds.length > 0) {
      loadData();
    } else {
        if (!isLive) setData([]); 
    }
  }, [opened, targetIds, isLive]);

  const loadData = async () => {
    if (!isLive) setLoading(true);
    const items = await DatabaseService.getTestsByIds(targetIds);
    setData(items);
    if (!isLive) setLoading(false);
  };

  // --- Логика Сортировки ---
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let valA: any = a[sort.key as keyof BacktestResultItem];
      let valB: any = b[sort.key as keyof BacktestResultItem];

      if (sort.key === 'winRate') {
        valA = a.profits && (a.profits + (a.losses || 0)) > 0 
               ? (a.profits / (a.profits + (a.losses || 0))) * 100 : -1;
        valB = b.profits && (b.profits + (b.losses || 0)) > 0 
               ? (b.profits / (b.profits + (b.losses || 0))) * 100 : -1;
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      
      const cmp = valA > valB ? 1 : -1;
      return sort.reversed ? -cmp : cmp;
    });
  }, [data, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(prev => ({ key, reversed: prev.key === key ? !prev.reversed : true }));
  };

  // --- Компонент заголовка столбца ---
  const Th = ({ children, sortKey, id }: { children: React.ReactNode, sortKey?: SortKey, id: string }) => {
    if (!visibleColumns[id]) return null;
    return (
      <Table.Th style={{ whiteSpace: 'nowrap' }}>
        <UnstyledButton onClick={() => sortKey && toggleSort(sortKey)} style={{ fontWeight: 700, fontSize: 12 }}>
          <Group gap={4}>
            {children}
            {sortKey && sort.key === sortKey && (
               sort.reversed ? <IconChevronDown size={14}/> : <IconChevronUp size={14}/>
            )}
            {sortKey && sort.key !== sortKey && <IconSelector size={14} style={{ opacity: 0.3 }} />}
          </Group>
        </UnstyledButton>
      </Table.Th>
    );
  };

  // Условие отображения блока: если идет тест ИЛИ если есть логи (чтобы блок не пропадал после финиша)
  const showStatusBlock = (isLive || (logs && logs.length > 0)) && progress;

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title={
        <Group>
          <Text fw={700} size="lg">{title}</Text>
          {isLive && <Badge color="green" variant="light" size="sm">LIVE</Badge>}
        </Group>
      }
      size="100%" 
      padding="md"
      closeOnClickOutside={false}
    >
      <Stack gap="sm">
        
        {/* БЛОК LIVE: Прогресс + Логи */}
        {showStatusBlock && progress && (
           <Stack gap={0} bg="gray.0" style={{borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden'}}>
              
              {/* Верхняя часть: Статус и Прогресс */}
              <Stack gap={4} p="xs">
                  <Group justify="space-between">
                     <Text size="sm" fw={500}>{status}</Text>
                     <Group gap="xs">
                        <Badge size="lg" variant="light">{progress.current} / {progress.total}</Badge>
                        {isLive && onStop && progress.current < progress.total && (
                            <Button color="red" size="xs" variant="subtle" leftSection={<IconPlayerStop size={14}/>} onClick={onStop}>
                                Стоп
                            </Button>
                        )}
                     </Group>
                  </Group>
                  <Progress value={(progress.current / (progress.total || 1)) * 100} animated={isLive} size="sm" radius="xl" />
              </Stack>

              {/* Нижняя часть: Логи (Мини-консоль) */}
              <Stack gap={0} bg="gray.0" p="xs" pt={0} style={{ borderTop: '1px solid #dee2e6' }}>
                  <Group gap={6} mb={4} mt={6}>
                      <IconTerminal2 size={12} style={{ opacity: 0.5 }} />
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Лог выполнения</Text>
                  </Group>
                  <ScrollArea h={80} viewportRef={viewport} type="auto" scrollbarSize={6}>
                      {logs.length === 0 ? (
                          <Text size="xs" c="dimmed" fs="italic">Ожидание событий...</Text>
                      ) : (
                          // Текст темный (dark.3), фон светлый
                          logs.map((log, idx) => (
                              <Text key={idx} size="xs" c="dark.3" style={{ fontFamily: 'monospace', lineHeight: 1.3 }}>
                                 <span style={{ opacity: 0.5, marginRight: 8, userSelect: 'none' }}>{dayjs().format('HH:mm:ss')}</span> 
                                 {log}
                              </Text>
                          ))
                      )}
                      <div /> 
                  </ScrollArea>
              </Stack>
           </Stack>
        )}

        {/* Панель инструментов (Меню столбцов) */}
        <Group justify="flex-end">
          <Menu shadow="md" width={220} closeOnItemClick={false}>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" title="Настройка столбцов"><IconColumns size={20} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Столбцы таблицы</Menu.Label>
              {Object.keys(visibleColumns).map(col => (
                <Menu.Item key={col} 
                   leftSection={<Checkbox checked={visibleColumns[col]} readOnly size="xs" />}
                   onClick={() => setVisibleColumns(p => ({...p, [col]: !p[col]}))}
                >
                  {COLUMN_NAMES[col] || col}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>

        {loading ? (
            <Center h={200}><Loader type="dots" /></Center>
        ) : (
        <ScrollArea h={showStatusBlock ? "55vh" : "75vh"} type="auto" offsetScrollbars>
          <Table stickyHeader highlightOnHover verticalSpacing="xs" withTableBorder>
            <Table.Thead bg="gray.1">
              <Table.Tr>
                <Th id="name" sortKey="name">Название</Th>
                <Th id="period" sortKey="from">Период</Th>
                <Th id="exchange" sortKey="exchange">Биржа</Th>
                <Th id="pair" sortKey="symbol">Пара</Th>
                
                <Th id="net" sortKey="netQuote">Net (USDT)</Th>
                <Th id="effDay" sortKey="netQuotePerDay">Эфф. в день</Th>
                
                <Th id="deals" sortKey="totalDeals">Сделки</Th>
                <Th id="winRate" sortKey="winRate">Win rate</Th>
                
                <Th id="mfeAbs" sortKey="mfeAbsolute">МПП (USDT)</Th>
                <Th id="mfePct" sortKey="mfePercent">МПП (%)</Th>
                
                <Th id="maeAbs" sortKey="maeAbsolute">МПУ (USDT)</Th>
                <Th id="maePct" sortKey="maePercent">МПУ (%)</Th>
                
                <Th id="maxTime" sortKey="maxDuration">Макс время</Th>
                <Th id="avgTime" sortKey="avgDuration">Ср. время</Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedData.map((row) => {
                const winRate = row.profits && row.totalDeals 
                    ? ((row.profits / (row.profits + (row.losses||0))) * 100).toFixed(2) 
                    : '—';
                const isProfit = (row.netQuote || 0) >= 0;

                return (
                <Table.Tr key={row.id}>
                  {visibleColumns.name && (
                      <Table.Td>
                        <Stack gap={2}>
                            <Text fw={600} size="sm" lineClamp={1} title={row.name} style={{maxWidth: 200}}>{row.name}</Text>
                            <Text size="xs" c="dimmed">ID: {row.id}</Text>
                        </Stack>
                      </Table.Td>
                  )}
                  {visibleColumns.period && (
                      <Table.Td>
                        <Stack gap={0}>
                            <Text size="xs">{formatDate(row.from)}</Text>
                            <Text size="xs" c="dimmed">до {formatDate(row.to)}</Text>
                        </Stack>
                      </Table.Td>
                  )}
                  {visibleColumns.exchange && <Table.Td><Text size="xs">{row.exchange}</Text></Table.Td>}
                  {visibleColumns.pair && (
                      <Table.Td>
                        <Stack gap={2}>
                            <Text fw={600} size="sm">{row.symbol}</Text>
                            <Badge size="xs" variant="light" color={row.algorithm === 'LONG' ? 'green' : 'red'}>{row.algorithm}</Badge>
                        </Stack>
                      </Table.Td>
                  )}
                  {visibleColumns.net && (
                      <Table.Td>
                        <Text fw={700} size="sm" c={isProfit ? 'teal' : 'red'}>{formatMoney(row.netQuote)}</Text>
                      </Table.Td>
                  )}
                  {visibleColumns.effDay && (
                      <Table.Td>
                         <Text size="sm" c={(row.netQuotePerDay||0)>=0 ? 'teal' : 'red'}>{formatMoney(row.netQuotePerDay)}</Text>
                      </Table.Td>
                  )}
                  {visibleColumns.deals && (
                      <Table.Td>
                        <Stack gap={0}>
                            <Text fw={600}>{row.totalDeals}</Text>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                P/L/B: <span style={{color:'var(--mantine-color-teal-6)'}}>{row.profits}</span>
                                / <span style={{color:'var(--mantine-color-red-6)'}}>{row.losses}</span>
                                / {row.breakevens}
                            </Text>
                        </Stack>
                      </Table.Td>
                  )}
                  {visibleColumns.winRate && (
                      <Table.Td>
                        <Stack gap={0}><Text fw={600}>{winRate !== '—' ? `${winRate}%` : '—'}</Text></Stack>
                      </Table.Td>
                  )}
                  {visibleColumns.mfeAbs && <Table.Td><Text size="sm" c="teal">{formatMoney(row.mfeAbsolute)}</Text></Table.Td>}
                  {visibleColumns.mfePct && <Table.Td><Text size="sm" c="teal">{formatPercent(row.mfePercent)}</Text></Table.Td>}
                  {visibleColumns.maeAbs && <Table.Td><Text size="sm" c="red">{formatMoney(row.maeAbsolute)}</Text></Table.Td>}
                  {visibleColumns.maePct && <Table.Td><Text size="sm" c="red">{formatPercent(row.maePercent)}</Text></Table.Td>}
                  {visibleColumns.maxTime && <Table.Td><Text size="sm">{formatDurationHuman(row.maxDuration)}</Text></Table.Td>}
                  {visibleColumns.avgTime && <Table.Td><Text size="sm">{formatDurationHuman(row.avgDuration)}</Text></Table.Td>}
                </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        )}
      </Stack>
    </Modal>
  );
}