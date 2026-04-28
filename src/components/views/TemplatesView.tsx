import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Group,
  Button,
  SimpleGrid,
  Stack,
  ActionIcon,
  Badge,
  Paper
} from '@mantine/core';
import { IconTrash, IconCalendar, IconArrowRight, IconDatabase } from '@tabler/icons-react';
import { StorageService } from '../../services/StorageService';
import type { Template } from '../../types';
import styles from './TemplatesView.module.css';
import { ConnectionAlert } from '../ConnectionAlert';

interface Props {
  onLoadTemplate: (template: Template) => void;
  onNavigate: (view: string) => void;
  connectionError?: string | null;
}

export function TemplatesView({ onLoadTemplate, onNavigate, connectionError }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await StorageService.getTemplates();
    setTemplates(data);
    setLoading(false);
  };

  const handleDelete = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить этот шаблон?')) {
      await StorageService.deleteTemplate(id);
      await loadData();
    }
  };

  const handleLoad = (template: Template) => {
    onLoadTemplate(template);
  };

  const resolveTemplateVersion = (template: Template): 'v1' | 'v2' => {
    if (template.backtestVersion) return template.backtestVersion;
    return template.apiVersion === 'v2' ? 'v2' : 'v1';
  };

  if (loading) {
    return (
      <Container p="xl" className={`ui-surface ${styles.viewRoot}`}>
        <Text c="dimmed" ta="center">Загрузка шаблонов...</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl" className={`ui-surface ${styles.viewRoot}`}>
      <div className={`ui-topbar ${styles.topbar}`}>
        <Title order={2}>Сохраненные шаблоны</Title>
      </div>

      {connectionError && (
        <Paper withBorder p="sm" radius="md" className="ui-card">
          <ConnectionAlert visible />
        </Paper>
      )}

      {templates.length === 0 ? (
        <Stack align="center" gap="md" className={styles.emptyState}>
          <IconDatabase size={48} color="#adb5bd" />
          <Text c="dimmed">Нет сохраненных шаблонов.</Text>
          <Button variant="outline" onClick={() => onNavigate('backtester')}>
            Создать в конфигураторе
          </Button>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {templates.map((tpl) => (
            <Card key={tpl.id} withBorder padding="lg" radius="md" className={`ui-card ui-hover-lift ${styles.templateCard}`}>
              <Group justify="space-between" className={styles.cardHeader}>
                <Text fw={700} size="lg" truncate>{tpl.name}</Text>
                <ActionIcon color="red" variant="subtle" onClick={(e) => void handleDelete(tpl.id, e)}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>

              <Group gap={6} mb="md" className={styles.metaRow}>
                <IconCalendar size={14} style={{ opacity: 0.5 }} />
                <Text size="xs" c="dimmed">
                  {new Date(tpl.timestamp).toLocaleString('ru-RU')}
                </Text>
              </Group>

	              <Group mb="sm">
	                <Badge variant="dot" color="blue">{tpl.config.staticConfig.exchange}</Badge>
	                <Text fw={500} size="sm">{tpl.config.staticConfig.symbol}</Text>
	                <Badge variant="light" color={resolveTemplateVersion(tpl) === 'v2' ? 'violet' : 'gray'}>
	                  {resolveTemplateVersion(tpl)}
	                </Badge>
	              </Group>

              <Card.Section inheritPadding py="xs" className={styles.footerSection}>
                <Group justify="space-between" align="center">
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" fw={700}>Монета</Text>
                    <Text fw={500} size="sm">{tpl.config.staticConfig.symbol}</Text>
                  </Stack>

                  <Button
                    size="xs"
                    variant="white"
                    color="blue"
                    rightSection={<IconArrowRight size={14} />}
                    onClick={() => handleLoad(tpl)}
                  >
                    Загрузить
                  </Button>
                </Group>
              </Card.Section>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
}
