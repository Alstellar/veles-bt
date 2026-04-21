import { useEffect, useState } from 'react';
import { Container, Title, Text, Card, Stack, Button, Badge, Switch, Paper, NumberInput } from '@mantine/core';
import { IconBug, IconDownload } from '@tabler/icons-react';
import { LogService } from '../../services/LogService';
import { StorageService } from '../../services/StorageService';
import { setMinTestInterval } from '../../services/QueueRetryPolicy';
import styles from './SettingsView.module.css';
import { ConnectionAlert } from '../ConnectionAlert';

interface Props {
  appVersion: string;
  connectionError?: string | null;
}

export function SettingsView({ appVersion, connectionError }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [isVerboseLogging, setIsVerboseLogging] = useState(true);
  const [isLoggingModeLoading, setIsLoggingModeLoading] = useState(true);
  const [v2Interval, setV2Interval] = useState<number>(5);
  const [v2IntervalLoading, setV2IntervalLoading] = useState(true);

  useEffect(() => {
    const loadLoggingMode = async () => {
      try {
        const enabled = await LogService.isVerboseLogging();
        setIsVerboseLogging(enabled);
      } finally {
        setIsLoggingModeLoading(false);
      }
    };
    void loadLoggingMode();
  }, []);

  useEffect(() => {
    const loadV2Interval = async () => {
      try {
        const interval = await StorageService.getV2IntervalSeconds();
        setV2Interval(interval);
        setMinTestInterval(interval * 1000);
      } finally {
        setV2IntervalLoading(false);
      }
    };
    void loadV2Interval();
  }, []);

  const handleExportBugReport = async () => {
    setIsExporting(true);
    try {
      const filename = await LogService.downloadBugReport();
      setLastExport(filename);
      await LogService.info('settings', 'bug_report.exported', { filename });
    } catch (error) {
      await LogService.error('settings', 'bug_report.export_failed', error);
      alert('Не удалось выгрузить bug-report. Попробуйте снова.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleVerboseLogging = async (enabled: boolean) => {
    setIsVerboseLogging(enabled);
    await LogService.setVerboseLogging(enabled);
  };

  const handleV2IntervalChange = async (value: number | string) => {
    const seconds = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(seconds) || seconds < 1) return;
    setV2Interval(seconds);
    setMinTestInterval(seconds * 1000);
    await StorageService.setV2IntervalSeconds(seconds);
  };

  return (
    <Container size="md" py="xl" className={`ui-surface ${styles.viewRoot}`}>
      <Stack gap="lg">
        <div className={`ui-topbar ${styles.topbar}`}>
          <div className={styles.titleCenter}>
            <Title order={2}>Настройки</Title>
            <Badge variant="light">v{appVersion}</Badge>
          </div>
        </div>

        {connectionError && (
          <Paper withBorder p="sm" radius="md" className="ui-card">
            <ConnectionAlert visible />
          </Paper>
        )}

        <div className={styles.sectionStack}>
          <Card withBorder radius="md" p="lg" className={`ui-card ui-hover-lift ${styles.sectionCard}`}>
            <div className={styles.cardTitle}>
              <IconBug size={14} />
              <span>Логирование и диагностика</span>
            </div>
            <Stack gap="md">
              <div className={styles.row}>
                <div>
                  <Text fw={600}>Подробный режим логирования</Text>
                  <Text size="xs" c="dimmed">
                    Включен: логируются действия и служебные события. Выключен: остаются только ключевые события и ошибки.
                  </Text>
                </div>
                <Switch
                  checked={isVerboseLogging}
                  disabled={isLoggingModeLoading}
                  onChange={(e) => void handleToggleVerboseLogging(e.currentTarget.checked)}
                  label={isVerboseLogging ? 'Подробный' : 'Обычный'}
                />
              </div>

              <Text size="sm" c="dimmed">
                Выгружает журнал действий и ошибок за последние 2 дня в текстовый файл для диагностики.
              </Text>

              <Button
                leftSection={<IconDownload size={18} />}
                onClick={handleExportBugReport}
                loading={isExporting}
              >
                Скачать bug-report
              </Button>

              {lastExport && (
                <div className={styles.lastExport}>
                  Последний файл: {lastExport}
                </div>
              )}
            </Stack>
          </Card>

          <Card withBorder radius="md" p="lg" className={`ui-card ui-hover-lift ${styles.sectionCard}`}>
            <div className={styles.cardTitle}>
              <span>Конфигуратор 2.0</span>
            </div>
            <Stack gap="md">
              <div className={styles.row}>
                <div>
                  <Text fw={600}>Интервал между тестами (V2)</Text>
                  <Text size="xs" c="dimmed">
                    Пауза между запуском тестов в Конфигураторе 2.0 (в секундах). Минимум 1 сек.
                  </Text>
                </div>
                <NumberInput
                  value={v2Interval}
                  min={1}
                  max={120}
                  step={1}
                  disabled={v2IntervalLoading}
                  onChange={handleV2IntervalChange}
                  style={{ width: 80 }}
                />
              </div>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}
