import { useEffect, useState } from 'react';
import { 
  Container, Title, Text, Card, Group, Button, 
  SimpleGrid, Stack, ActionIcon, ThemeIcon 
} from '@mantine/core';
import { IconTrash, IconTemplate, IconCalendar, IconArrowRight, IconDatabase } from '@tabler/icons-react';
import { StorageService } from '../../services/StorageService';
import type { Template } from '../../types';

interface Props {
  onLoadTemplate: (template: Template) => void;
  onNavigate: (view: string) => void;
}

export function TemplatesView({ onLoadTemplate, onNavigate }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await StorageService.getTemplates();
    setTemplates(data);
    setLoading(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить этот шаблон?')) {
      await StorageService.deleteTemplate(id);
      await loadData();
    }
  };

  const handleLoad = (template: Template) => {
    onLoadTemplate(template);
    // Навигация происходит в родителе, но можно продублировать или оставить управление родителю
  };

  if (loading) {
    return <Container p="xl"><Text c="dimmed" ta="center">Загрузка шаблонов...</Text></Container>;
  }

  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <ThemeIcon size="lg" variant="light" color="orange"><IconTemplate size={20}/></ThemeIcon>
        <Title order={2}>Сохраненные шаблоны</Title>
      </Group>

      {templates.length === 0 ? (
        <Stack align="center" gap="md" py={50} bg="gray.0" style={{ borderRadius: 8 }}>
           <IconDatabase size={48} color="#adb5bd" />
           <Text c="dimmed">Нет сохраненных шаблонов.</Text>
           <Button variant="outline" onClick={() => onNavigate('backtester')}>
             Создать в конфигураторе
           </Button>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {templates.map((tpl) => (
            <Card key={tpl.id} shadow="sm" padding="lg" radius="md" withBorder>
              
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="lg" truncate>{tpl.name}</Text>
                <ActionIcon color="red" variant="subtle" onClick={(e) => handleDelete(tpl.id, e)}>
                    <IconTrash size={18} />
                </ActionIcon>
              </Group>

              <Group gap={6} mb="md">
                 <IconCalendar size={14} style={{ opacity: 0.5 }} />
                 <Text size="xs" c="dimmed">
                    {new Date(tpl.timestamp).toLocaleString('ru-RU')}
                 </Text>
              </Group>
              
              <Card.Section inheritPadding py="xs" bg="gray.0">
                  <Group justify="space-between" align="center">
                      <Stack gap={0}>
                          <Text size="xs" c="dimmed" fw={700}>Пара</Text>
                          <Text fw={500} size="sm">{tpl.config.staticConfig.symbol}</Text>
                      </Stack>
                      <Button 
                        size="xs" variant="white" color="blue" 
                        rightSection={<IconArrowRight size={14}/>}
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