import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Group,
  Badge,
  Button,
  SimpleGrid,
  Stack,
  Loader,
  ActionIcon,
  Tooltip,
  Paper
} from '@mantine/core';
import {
  IconTrash,
  IconCalendar,
  IconDatabase,
  IconRefresh,
  IconTable,
  IconPlayerPlay,
  IconPlayerStop
} from '@tabler/icons-react';

import { StorageService } from '../../services/StorageService';
import { SyncService } from '../../services/SyncService';
import { ConnectionService } from '../../services/ConnectionService';
import { DatabaseService } from '../../services/DatabaseService';
import { ResultsModal } from '../ResultsModal';
import { QueueLockService } from '../../services/QueueLockService';
import type { BatchInfo, BatchRunStatus } from '../../types';
import styles from './HistoryView.module.css';
import { ConnectionAlert } from '../ConnectionAlert';

interface HistoryViewProps {
  onResumeBatch?: (batch: BatchInfo) => void | Promise<void>;
  onStopBatch?: (batch: BatchInfo) => Promise<void>;
  connectionError?: string | null;
}

function statusColor(status: BatchRunStatus): string {
  if (status === 'RUN') return 'yellow';
  if (status === 'STOP') return 'red';
  return 'green';
}

export function HistoryView({ onResumeBatch, onStopBatch, connectionError }: HistoryViewProps) {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState<{ title: string; batchId: string; legacyIds: number[] } | null>(null);

  useEffect(() => {
    void loadHistory();
    void loadDbStats();
  }, []);

  const loadHistory = async () => {
    setLoading(true);

    const lock = await QueueLockService.getLock();
    if (!lock) {
      const existing = await StorageService.getBatches();
      const staleRunning = existing.filter((batch) => batch.runStatus === 'RUN');
      for (const batch of staleRunning) {
        await StorageService.updateBatchRunState(batch.id, 'STOP', {
          completedTests: batch.completedTests ?? batch.velesIds.length,
          stopReason: 'runtime_error',
          lastError: 'Запуск прерван (окно/браузер было закрыто)'
        });
      }
    }

    const data = await StorageService.getBatches();
    setBatches(data);
    setLoading(false);
  };

  const loadDbStats = async () => {
    const count = await DatabaseService.getCount();
    setTotalSaved(count);
  };

  const handleClearHistory = async () => {
    if (!confirm('Очистить историю запусков и локальную базу результатов?')) return;

    await StorageService.clearHistory();
    await DatabaseService.clearAll();
    await loadHistory();
    await loadDbStats();
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Удалить этот запуск, связанные с ним конфигурации и результаты?')) return;

    await StorageService.removeBatch(batchId);
    await DatabaseService.deleteBatchTests(batchId);
    setBatches((prev) => prev.filter((batch) => batch.id !== batchId));
    await loadDbStats();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncCount(0);

    try {
      const conn = await ConnectionService.getConnection({ force: true });
      if (!conn.success) {
        alert(ConnectionService.reasonToMessage(conn.reason));
        return;
      }

      await SyncService.sync(conn.connection.tabId, (count) => {
        setSyncCount(count);
      });

      await loadDbStats();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Ошибка синхронизации: ${message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleResumeBatch = async (batch: BatchInfo) => {
    const runtime = await StorageService.getBatchRuntime(batch.id);
    const hasConfiguratorSource = Boolean(batch.resumeSource);
    const hasBacktestsSource = Boolean(batch.backtestsSource);
    if (!runtime || (!hasConfiguratorSource && !hasBacktestsSource)) {
      alert('Этот запуск нельзя продолжить: не найдены данные для восстановления. Запустите задачу заново.');
      return;
    }

    onResumeBatch?.(batch);
  };

  const handleStopBatch = async (batchId: string) => {
    const batch = batches.find((item) => item.id === batchId);
    if (!batch) return;

    if (onStopBatch) {
      await onStopBatch(batch);
    } else {
      await QueueLockService.requestStop(batchId);
    }

    await StorageService.updateBatchRunState(batch.id, 'STOP', {
      stopReason: 'manual_stop'
    });

    setBatches((prev) => prev.map((item) => (
      item.id === batch.id
        ? {
          ...item,
          runStatus: 'STOP',
          stopReason: 'manual_stop',
          lastError: undefined,
          updatedAt: Date.now()
        }
        : batch
    )));
  };

  if (loading) {
    return (
      <Container p="xl" className={`ui-surface ${styles.viewRoot}`}>
        <Text c="dimmed" ta="center">Загрузка истории...</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl" className={`ui-surface ${styles.viewRoot}`}>
      <div className={`ui-topbar ${styles.topbar}`}>
        <Title order={2}>История запусков</Title>
        <div className={styles.topbarBody}>
          <Text size="sm" c="dimmed">Локально сохранено тестов: {totalSaved}</Text>
          <Group className={styles.metaActions}>
            <Button
              variant={syncing ? 'light' : 'filled'}
              color="blue"
              leftSection={syncing ? <Loader size={16} color="blue" /> : <IconRefresh size={16} />}
              onClick={handleSync}
              disabled={syncing}
              className={styles.actionButton}
            >
              {syncing ? `Синхронизация (${syncCount})...` : 'Синхронизировать'}
            </Button>

            {batches.length > 0 && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleClearHistory}
                disabled={syncing}
                className={styles.actionButton}
              >
                Очистить всё
              </Button>
            )}
          </Group>
        </div>
      </div>

      {connectionError && (
        <Paper withBorder p="sm" radius="md" className="ui-card">
          <ConnectionAlert visible />
        </Paper>
      )}

      {batches.length === 0 ? (
        <Stack align="center" gap="md" className={styles.emptyState}>
          <IconDatabase size={48} color="#adb5bd" />
          <Text c="dimmed">История пуста. Запустите бэктест, чтобы записи появились здесь.</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {batches.map((batch) => {
            const status: BatchRunStatus = batch.runStatus ?? 'STOP';
            const completed = batch.completedTests ?? (status === 'DONE' ? batch.totalTests : batch.velesIds.length);
            const progressLabel = `${Math.min(completed, batch.totalTests)} / ${batch.totalTests}`;

            return (
              <Card key={batch.id} withBorder className={`ui-card ui-hover-lift ${styles.historyCard}`} padding="lg" radius="md">
                <Group justify="space-between" className={styles.cardHeader}>
                  <Group gap="xs">
                    <Badge size="lg" variant="filled" color="blue">
                      {batch.id}
                    </Badge>
                    <Group gap={4} className={styles.badgeMeta}>
                      <IconCalendar size={14} style={{ opacity: 0.5 }} />
                      <Text size="xs" c="dimmed">
                        {new Date(batch.timestamp).toLocaleString('ru-RU')}
                      </Text>
                    </Group>
                  </Group>

                  <Tooltip label="Удалить запуск">
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void handleDeleteBatch(batch.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Text fw={700} size="lg" mt="xs">{batch.namePrefix}</Text>

                <Group mt={4} mb="sm">
                  <Badge variant="dot" color={batch.exchange.includes('FUTURES') ? 'orange' : 'green'}>
                    {batch.exchange}
                  </Badge>
                  <Text fw={500}>{batch.symbol}</Text>
                </Group>

                <Group mb="md" justify="space-between">
                  <Badge color={statusColor(status)} variant="light">{status}</Badge>
                  <Text size="sm" fw={600}>{progressLabel}</Text>
                </Group>

                <Card.Section inheritPadding py="xs" className={styles.sectionFooter}>
                  <Group justify="space-between" align="center">
                    <Stack gap={0}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Всего тестов</Text>
                      <Text fw={500}>{batch.totalTests}</Text>
                    </Stack>

                    <Group gap="xs">
                      {status === 'STOP' && onResumeBatch && (
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          leftSection={<IconPlayerPlay size={14} />}
                          onClick={() => void handleResumeBatch(batch)}
                          disabled={syncing}
                        >
                          Продолжить
                        </Button>
                      )}

                      {status === 'RUN' && (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<IconPlayerStop size={14} />}
                          onClick={() => void handleStopBatch(batch.id)}
                          disabled={syncing}
                        >
                          Остановить
                        </Button>
                      )}

                      <Button
                        size="xs"
                        variant="white"
                        color="blue"
                        leftSection={<IconTable size={16} />}
                        onClick={() => setSelectedBatch({ title: `${batch.namePrefix} (${batch.id})`, batchId: batch.id, legacyIds: batch.velesIds })}
                      >
                        Результаты
                      </Button>
                    </Group>
                  </Group>
                </Card.Section>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <ResultsModal
        opened={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title={selectedBatch?.title || ''}
        batchId={selectedBatch?.batchId || null}
        targetIds={selectedBatch?.legacyIds || []}
      />
    </Container>
  );
}
