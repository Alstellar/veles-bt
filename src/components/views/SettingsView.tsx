import { useEffect, useState } from 'react';
import { Container, Title, Text, Card, Stack, Button, Group, Badge, Switch } from '@mantine/core';
import { IconBug, IconDownload } from '@tabler/icons-react';
import { LogService } from '../../services/LogService';

interface Props {
  appVersion: string;
}

export function SettingsView({ appVersion }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [isVerboseLogging, setIsVerboseLogging] = useState(true);
  const [isLoggingModeLoading, setIsLoggingModeLoading] = useState(true);

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

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Настройки</Title>
          <Badge variant="light">v{appVersion}</Badge>
        </Group>

        <Card withBorder radius="md" p="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text fw={600}>Подробное логирование</Text>
                <Text size="xs" c="dimmed">
                  Включено: логируются все действия в конфигураторе. Выключено: только ключевые события и ошибки.
                </Text>
              </div>
              <Switch
                checked={isVerboseLogging}
                disabled={isLoggingModeLoading}
                onChange={(e) => void handleToggleVerboseLogging(e.currentTarget.checked)}
                label={isVerboseLogging ? 'Подробный' : 'Обычный'}
              />
            </Group>

            <Group>
              <IconBug size={20} />
              <Text fw={600}>Bug-report</Text>
            </Group>

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
              <Text size="xs" c="dimmed">
                Последний файл: {lastExport}
              </Text>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
