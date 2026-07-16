import { useEffect, useRef, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Button,
  Badge,
  SegmentedControl,
  Paper,
  Switch,
  TextInput,
  NumberInput,
  Group
} from '@mantine/core';
import { IconBug, IconDownload, IconPlugConnected, IconRefresh } from '@tabler/icons-react';
import { LogService } from '../../services/LogService';
import { warmupReferenceDictionaries } from '../../services/apiService';
import {
  DEFAULT_MCP_SETTINGS,
  getMcpSettings,
  getMcpStatus,
  setMcpSettings,
  type McpRuntimeStatus,
  type McpSettings
} from '../../bridge/mcpSettings';
import { DEFAULT_MCP_PORT } from '../../bridge/protocol';
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
  const [mcpSettings, setMcpSettingsState] = useState<McpSettings>(DEFAULT_MCP_SETTINGS);
  const [mcpStatus, setMcpStatusState] = useState<McpRuntimeStatus | null>(null);
  const [mcpSaving, setMcpSaving] = useState(false);
  const mcpSettingsRef = useRef(mcpSettings);
  mcpSettingsRef.current = mcpSettings;

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
    let cancelled = false;

    const loadMcp = async () => {
      const [settings, status] = await Promise.all([getMcpSettings(), getMcpStatus()]);
      if (cancelled) return;
      setMcpSettingsState(settings);
      setMcpStatusState(status);
    };

    void loadMcp();
    const timer = window.setInterval(() => {
      void getMcpStatus().then((status) => {
        if (!cancelled) setMcpStatusState(status);
      });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const persistMcpSettings = async (next: McpSettings) => {
    setMcpSaving(true);
    try {
      const normalized: McpSettings = {
        enabled: next.enabled,
        port: next.port > 0 && next.port <= 65535 ? next.port : DEFAULT_MCP_PORT,
        token: next.token
      };
      setMcpSettingsState(normalized);
      await setMcpSettings(normalized);
      await LogService.info('settings', 'mcp.settings_saved', {
        enabled: normalized.enabled,
        port: normalized.port,
        hasToken: Boolean(normalized.token.trim())
      });
    } catch (error) {
      await LogService.error('settings', 'mcp.settings_save_failed', error);
      alert('Не удалось сохранить настройки MCP.');
    } finally {
      setMcpSaving(false);
    }
  };

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

  const handleLoggingModeChange = (value: string) => {
    void handleToggleVerboseLogging(value === 'verbose');
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
                    Обычный: остаются только ключевые события и ошибки. Подробный: логируются действия и служебные события.
                  </Text>
                </div>
              </div>

              <Text size="sm" c="dimmed">
                Выгружает журнал действий и ошибок за последние 2 дня в текстовый файл для диагностики.
              </Text>

              <SegmentedControl
                fullWidth
                w="100%"
                size="md"
                disabled={isLoggingModeLoading}
                value={isVerboseLogging ? 'verbose' : 'normal'}
                onChange={handleLoggingModeChange}
                data={[
                  { label: 'Обычный', value: 'normal' },
                  { label: 'Подробный', value: 'verbose' }
                ]}
                styles={{
                  root: {
                    width: '100%',
                    maxWidth: '100%',
                    display: 'flex',
                    minHeight: 36,
                    padding: 3,
                    borderRadius: 12,
                    border: isVerboseLogging ? '1px solid #b7d3f4' : '1px solid #d2dae5',
                    background: isVerboseLogging ? '#e8f1fb' : '#f1f4f8',
                    overflow: 'hidden'
                  },
                  control: {
                    flex: 1,
                    minHeight: 30
                  },
                  indicator: {
                    borderRadius: 9,
                    border: isVerboseLogging ? '1px solid rgba(34, 139, 230, 0.38)' : '1px solid rgba(108, 117, 125, 0.3)',
                    background: isVerboseLogging ? '#9dccfb' : '#d7dde5',
                    boxShadow: isVerboseLogging
                      ? '0 0 0 1px rgba(34, 139, 230, 0.18), 0 0 12px rgba(34, 139, 230, 0.2)'
                      : '0 0 0 1px rgba(108, 117, 125, 0.14), 0 0 10px rgba(108, 117, 125, 0.12)',
                    transition: 'transform 300ms cubic-bezier(0.22, 0.8, 0.26, 1), background 260ms ease, box-shadow 260ms ease, border-color 260ms ease'
                  },
                  label: {
                    color: '#607b98',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    transition: 'color 260ms ease, transform 260ms ease'
                  }
                }}
              />

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

          <Card withBorder radius="md" p="lg" className={`ui-card ui-hover-lift ${styles.sectionCard}`}>
            <div className={styles.cardTitle}>
              <IconPlugConnected size={14} />
              <span>MCP bridge (Phase A)</span>
            </div>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Read-only мост для AI-агентов. Companion: HTTP на
                {' '}
                <code>127.0.0.1:port</code>
                {' '}
                (long-poll, без WebSocket — Firefox-safe). Popup можно закрыть.
              </Text>

              <Group justify="space-between" align="center">
                <div>
                  <Text fw={600}>Включить MCP</Text>
                  <Text size="xs" c="dimmed">По умолчанию выключено</Text>
                </div>
                <Switch
                  checked={mcpSettings.enabled}
                  disabled={mcpSaving}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    const next = { ...mcpSettingsRef.current, enabled };
                    setMcpSettingsState(next);
                    void persistMcpSettings(next);
                  }}
                />
              </Group>

              <NumberInput
                label="Port"
                description={`По умолчанию ${DEFAULT_MCP_PORT}`}
                value={mcpSettings.port}
                min={1}
                max={65535}
                disabled={mcpSaving}
                onChange={(value) => {
                  const port = typeof value === 'number' ? value : DEFAULT_MCP_PORT;
                  setMcpSettingsState((prev) => ({ ...prev, port }));
                }}
              />

              <TextInput
                label="Session token"
                description="Должен совпадать с --token companion / Grok config"
                value={mcpSettings.token}
                disabled={mcpSaving}
                onChange={(event) => {
                  const token = event.currentTarget.value.trim();
                  setMcpSettingsState((prev) => ({ ...prev, token }));
                }}
              />

              <Button
                loading={mcpSaving}
                onClick={() => {
                  void persistMcpSettings(mcpSettingsRef.current);
                }}
              >
                Сохранить и подключить
              </Button>

              <Group gap="sm">
                <Badge color={mcpStatus?.connected ? 'green' : 'gray'} variant="light">
                  {mcpStatus?.connected ? 'Connected' : 'Disconnected'}
                </Badge>
                {mcpSettings.enabled && !mcpSettings.token.trim() && (
                  <Badge color="yellow" variant="light">Token required</Badge>
                )}
              </Group>

              {mcpStatus?.lastError && (
                <Text size="xs" c="red">
                  {mcpStatus.lastError}
                </Text>
              )}

              <Text size="xs" c="dimmed">
                Companion:
                {' '}
                <code>node mcp/dist/index.js --port 17321 --token …</code>
                {' '}
                · token должен совпадать · health:
                {' '}
                <code>http://127.0.0.1:17321/health</code>
              </Text>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}

