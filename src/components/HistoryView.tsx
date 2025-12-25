import { useEffect, useState } from 'react';
import { 
  Container, Title, Text, Card, Group, Badge, Button, 
  SimpleGrid, Stack, ThemeIcon, ScrollArea, Code 
} from '@mantine/core';
import { IconTrash, IconHistory, IconCalendar, IconDatabase } from '@tabler/icons-react';
import { StorageService } from '../services/StorageService';
import type { BatchInfo } from '../types';

export function HistoryView() {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Загрузка данных при монтировании
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await StorageService.getBatches();
    setBatches(data);
    setLoading(false);
  };

  const handleClearHistory = async () => {
    if (confirm('Вы уверены, что хотите полностью очистить историю запусков?')) {
      await StorageService.clearHistory();
      await loadHistory();
    }
  };

  if (loading) {
    return <Container p="xl"><Text c="dimmed" ta="center">Загрузка истории...</Text></Container>;
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Group>
            <ThemeIcon size="lg" variant="light" color="violet"><IconHistory size={20}/></ThemeIcon>
            <Title order={2}>История запусков</Title>
        </Group>
        
        {batches.length > 0 && (
          <Button 
            variant="subtle" color="red" leftSection={<IconTrash size={16} />}
            onClick={handleClearHistory}
          >
            Очистить историю
          </Button>
        )}
      </Group>

      {batches.length === 0 ? (
        <Stack align="center" gap="md" py={50} bg="gray.0" style={{ borderRadius: 8 }}>
           <IconDatabase size={48} color="#adb5bd" />
           <Text c="dimmed">История пуста. Запустите бектесты, чтобы увидеть их здесь.</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {batches.map((batch) => (
            <Card key={batch.id} shadow="sm" padding="lg" radius="md" withBorder>
              
              {/* HEADER: ID и Дата */}
              <Group justify="space-between" mb="xs">
                <Badge size="lg" variant="filled" color="blue">
                   {batch.id}
                </Badge>
                <Group gap={4}>
                   <IconCalendar size={14} style={{ opacity: 0.5 }} />
                   <Text size="xs" c="dimmed">
                      {new Date(batch.timestamp).toLocaleString('ru-RU')}
                   </Text>
                </Group>
              </Group>

              {/* BODY: Название и Символ */}
              <Text fw={700} size="lg" mt="xs">{batch.namePrefix}</Text>
              
              <Group mt={4} mb="md">
                 <Badge variant="dot" color={batch.exchange.includes('FUTURES') ? 'orange' : 'green'}>
                    {batch.exchange}
                 </Badge>
                 <Text fw={500}>{batch.symbol}</Text>
              </Group>

              {/* FOOTER: Статистика */}
              <Card.Section inheritPadding py="xs" bg="gray.0">
                 <Group justify="space-between">
                    <Stack gap={0}>
                       <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Всего тестов</Text>
                       <Text fw={500}>{batch.totalTests}</Text>
                    </Stack>
                    
                    <Stack gap={0} align="flex-end">
                       <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Успешных ID</Text>
                       <Group gap={4}>
                          <Text fw={500} c="blue">{batch.velesIds.length}</Text>
                          {/* Тултип или детализация IDшников */}
                       </Group>
                    </Stack>
                 </Group>
              </Card.Section>

              {/* Блок с IDs (можно скрывать, но пока покажем для наглядности) */}
              <ScrollArea h={60} mt="sm" type="auto" scrollbarSize={6}>
                 <Code block style={{ fontSize: 10, background: 'transparent' }}>
                    IDs: {batch.velesIds.join(', ') || 'Нет сохраненных ID'}
                 </Code>
              </ScrollArea>

            </Card>
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
}