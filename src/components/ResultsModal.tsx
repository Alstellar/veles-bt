import { Modal, Group, Text, Badge, Button, Switch, Menu, ActionIcon, Checkbox } from '@mantine/core';
import { IconDownload, IconColumns } from '@tabler/icons-react';

import { ResultsStatusBlock } from './results/ResultsStatusBlock';
import { ResultsTable } from './results/ResultsTable';
import { useResultsData } from '../hooks/useResultsData';
import { downloadAsCsv, downloadBatchAsCsv } from '../utils/exportUtils';
import type { SortKey } from '../hooks/useResultsData';
import type { BatchTestSortKey } from '../services/DatabaseService';

const COLUMN_NAMES: Record<string, string> = {
  name: 'Название',
  exchange: 'Биржа',
  pair: 'Пара',
  sourceTemplate: 'Шаблон',
  period: 'Период',
  days: 'История (дни)',
  net: 'Net (USDT)',
  recovery: 'Net / МПУ',
  effDay: 'Эфф. в день',
  deals: 'Сделки',
  dealsPerDay: 'Сделок/день',
  mfeAbs: 'МПП (USDT)',
  mfePct: 'МПП (%)',
  maeAbs: 'МПУ (USDT)',
  maePct: 'МПУ (%)',
  avgTime: 'Ср. время',
  maxTime: 'Макс время'
};

interface Props {
  opened: boolean;
  onClose: () => void;
  title: string;
  batchId?: string | null;
  targetIds?: number[];
  isLive?: boolean;
  status?: string;
  progress?: { current: number; total: number };
  onStop?: () => void;
  logs?: string[];
  notificationsEnabled?: boolean;
  onToggleNotifications?: (val: boolean) => void;
}

const SORT_KEY_TO_DB: Partial<Record<SortKey, BatchTestSortKey>> = {
  date: 'date',
  name: 'name',
  exchange: 'exchange',
  symbol: 'symbol',
  sourceTemplateUrl: 'sourceTemplateUrl',
  from: 'from',
  netQuote: 'netQuote',
  recoveryFactor: 'recoveryFactor',
  netQuotePerDay: 'netQuotePerDay',
  totalDeals: 'totalDeals',
  dealsPerDay: 'dealsPerDay',
  mfeAbsolute: 'mfeAbsolute',
  mfePercent: 'mfePercent',
  maeAbsolute: 'maeAbsolute',
  maePercent: 'maePercent',
  avgDuration: 'avgDuration',
  maxDuration: 'maxDuration',
  days: 'days'
};

export function ResultsModal({
  opened,
  onClose,
  title,
  batchId,
  targetIds = [],
  isLive,
  status,
  progress,
  onStop,
  logs = [],
  notificationsEnabled,
  onToggleNotifications
}: Props) {
  const {
    data,
    loading,
    sort,
    toggleSort,
    visibleColumns,
    setVisibleColumns,
    page,
    setPage,
    pageSize,
    setPageSize,
    total
  } = useResultsData(batchId, targetIds, opened, isLive);

  const handleExport = async () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `veles_results_${dateStr}.csv`;

    if (batchId) {
      await downloadBatchAsCsv({
        batchId,
        filename,
        sortKey: SORT_KEY_TO_DB[sort.key] ?? 'date',
        reversed: sort.reversed,
        chunkSize: 1000
      });
      return;
    }

    downloadAsCsv(data, filename);
  };

  const showNotificationsToggle = Boolean(isLive && onToggleNotifications);
  const showToggleGroup = showNotificationsToggle;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={(
        <Group justify="space-between" align="center" wrap="nowrap" style={{ width: '100%' }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={700} size="lg">{title}</Text>
            {isLive && <Badge color="green" variant="light" size="sm">LIVE</Badge>}
          </Group>

          {showToggleGroup && (
            <Group gap={14} align="center" wrap="nowrap" style={{ marginRight: 30 }}>
              {showNotificationsToggle && (
                <Group gap="sm" align="center" wrap="nowrap">
                  <Text size="sm" fw={600}>Уведомлять о завершении</Text>
                  <Switch
                    checked={Boolean(notificationsEnabled)}
                    onChange={(e) => onToggleNotifications?.(e.currentTarget.checked)}
                  />
                </Group>
              )}
            </Group>
          )}
        </Group>
      )}
      closeOnClickOutside={false}
      styles={{
        header: { alignItems: 'center' },
        title: { width: '100%' },
        content: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh' },
        body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 0 }
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <ResultsStatusBlock
          status={status}
          progress={progress}
          isLive={isLive}
          onStop={onStop}
          logs={logs}
        />

        <Group justify="flex-end" mt="md" mb="xs" align="center">
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconDownload size={16} />}
              onClick={() => void handleExport()}
              disabled={total === 0 || loading}
            >
              Скачать CSV
            </Button>

            <Menu shadow="md" width={220} closeOnItemClick={false} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default" size={30} title="Настройка столбцов">
                  <IconColumns size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Столбцы таблицы</Menu.Label>
                {Object.keys(visibleColumns).map((col) => (
                  <Menu.Item
                    key={col}
                    leftSection={<Checkbox checked={visibleColumns[col]} readOnly size="xs" />}
                    onClick={() => setVisibleColumns((p) => ({ ...p, [col]: !p[col] }))}
                  >
                    {COLUMN_NAMES[col] || col}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ResultsTable
          data={data}
          loading={loading}
          height="100%"
          sort={sort}
          onToggleSort={toggleSort}
          visibleColumns={visibleColumns}
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
        />
      </div>
    </Modal>
  );
}
