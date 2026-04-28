import { useEffect, useState } from 'react';
import { Container, Title, Text, Card, Stack, Button, Badge, Switch, Paper } from '@mantine/core';
import { IconBug, IconDownload, IconRefresh } from '@tabler/icons-react';
import { LogService } from '../../services/LogService';
import { warmupReferenceDictionaries } from '../../services/apiService';
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
  const [isRefreshingExchanges, setIsRefreshingExchanges] = useState(false);

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

  const handleRefreshExchangeData = async () => {
    setIsRefreshingExchanges(true);
    try {
      await warmupReferenceDictionaries(true);
      await LogService.info('settings', 'reference_cache.refresh_forced');
    } catch (error) {
      await LogService.error('settings', 'reference_cache.refresh_failed', error);
      alert('Не удалось обновить данные бирж. Проверьте подключение и авторизацию.');
    } finally {
      setIsRefreshingExchanges(false);
    }
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
              <IconRefresh size={14} />
              <span>Данные бирж</span>
            </div>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Принудительно обновляет кэш активов, плеч и дат тестирования по всем биржам.
              </Text>
              <Button
                variant="light"
                leftSection={<IconRefresh size={18} />}
                onClick={() => void handleRefreshExchangeData()}
                loading={isRefreshingExchanges}
              >
                Обновить данные бирж
              </Button>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}

