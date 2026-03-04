// src/components/ResultsModal.tsx
import { Modal, Group, Text, Badge, Button, Switch, Menu, ActionIcon, Checkbox } from '@mantine/core';
import { IconDownload, IconColumns } from '@tabler/icons-react';

// Импортируем наши модули
import { ResultsStatusBlock } from './results/ResultsStatusBlock';
import { ResultsTable } from './results/ResultsTable';
import { useResultsData } from '../hooks/useResultsData';
import { downloadAsCsv } from '../utils/exportUtils';

// Обновленные названия колонок
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
  mfeAbs: 'МПП (USDT)', mfePct: 'МПП (%)', 
  maeAbs: 'МПУ (USDT)', maePct: 'МПУ (%)',
  avgTime: 'Ср. время', 
  maxTime: 'Макс время'
};

interface Props {
  opened: boolean;
  onClose: () => void;
  title: string;
  targetIds: number[]; 
  
  isLive?: boolean;
  status?: string;
  progress?: { current: number; total: number };
  onStop?: () => void;
  logs?: string[]; 

  notificationsEnabled?: boolean;
  onToggleNotifications?: (val: boolean) => void;
}

export function ResultsModal({ 
  opened, onClose, title, targetIds, 
  isLive, status, progress, onStop, logs = [],
  notificationsEnabled, onToggleNotifications
}: Props) {
  
  const { 
    data, rawData, loading, 
    sort, toggleSort, 
    visibleColumns, setVisibleColumns 
  } = useResultsData(targetIds, opened, isLive);

  const handleExport = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `veles_results_${dateStr}.csv`;
    downloadAsCsv(rawData, filename);
  };

  const showNotificationsToggle = Boolean(isLive && onToggleNotifications);

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      fullScreen // 1. Делаем модалку полноэкранной
      title={
        <Group justify="space-between" align="center" wrap="nowrap" style={{ width: '100%' }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={700} size="lg">{title}</Text>
            {isLive && <Badge color="green" variant="light" size="sm">LIVE</Badge>}
          </Group>

          {showNotificationsToggle && (
            <Group gap="sm" align="center" wrap="nowrap" style={{ marginRight: 30 }}>
              <Text size="sm" fw={600}>Уведомлять о завершении</Text>
              <Switch
                checked={Boolean(notificationsEnabled)}
                onChange={(e) => onToggleNotifications?.(e.currentTarget.checked)}
              />
            </Group>
          )}
        </Group>
      }
      closeOnClickOutside={false}
      // 2. Настраиваем Flex-лейаут для модалки, чтобы она занимала 100% высоты без скролла тела
      styles={{
        header: { alignItems: 'center' },
        title: { width: '100%' },
        content: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh' },
        body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 0 }
      }}
    >
      {/* Обертка для верхней части (чтобы она не сжималась) */}
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
                leftSection={<IconDownload size={16}/>}
                onClick={handleExport}
                disabled={data.length === 0 || loading}
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
        </Group>
      </div>

      {/* 3. Контейнер для таблицы: занимает всё оставшееся место */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ResultsTable 
            data={data} 
            loading={loading}
            // 4. Передаем 100%, чтобы таблица заполнила этот контейнер
            height="100%"
            
            sort={sort}
            onToggleSort={toggleSort}
            visibleColumns={visibleColumns}
        />
      </div>

    </Modal>
  );
}

