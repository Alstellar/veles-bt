import { useEffect, useState } from 'react';
import { 
  Container, Title, Text, Card, Group, Badge, Button, 
  SimpleGrid, Stack, ThemeIcon, ScrollArea, Loader, ActionIcon, Tooltip
} from '@mantine/core';
import { 
  IconTrash, IconHistory, IconCalendar, IconDatabase, IconRefresh, IconTable 
} from '@tabler/icons-react';

import { StorageService } from '../../services/StorageService';
import { SyncService } from '../../services/SyncService';
import { VelesService } from '../../services/VelesService';
import { DatabaseService } from '../../services/DatabaseService';
import { ResultsModal } from '../ResultsModal';
import type { BatchInfo } from '../../types';

export function HistoryView() {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Состояние синхронизации
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);

  // Состояние модалки
  const [selectedBatch, setSelectedBatch] = useState<{id: string, ids: number[]} | null>(null);

  // Загрузка данных при монтировании
  useEffect(() => {
    loadHistory();
    loadDbStats();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    let data = await StorageService.getBatches();
    
    // --- АВТОМАТИЧЕСКАЯ ОЧИСТКА ПУСТЫХ ---
    // Находим пустые группы (без ID тестов)
    const emptyBatches = data.filter(b => !b.velesIds || b.velesIds.length === 0);
    
    if (emptyBatches.length > 0) {
        // Удаляем их из хранилища
        for (const batch of emptyBatches) {
            await StorageService.removeBatch(batch.id);
        }
        // Перезапрашиваем "чистый" список
        data = await StorageService.getBatches();
    }

    setBatches(data);
    setLoading(false);
  };

  const loadDbStats = async () => {
    const count = await DatabaseService.getCount();
    setTotalSaved(count);
  };

  const handleClearHistory = async () => {
    if (confirm('Вы уверены, что хотите полностью очистить историю групп и локальную базу результатов?')) {
      await StorageService.clearHistory();
      await DatabaseService.clearAll(); // Чистим IndexedDB
      await loadHistory();
      await loadDbStats();
    }
  };

  // --- НОВАЯ ФУНКЦИЯ: УДАЛЕНИЕ ОДНОЙ ГРУППЫ ---
  const handleDeleteBatch = async (batchId: string) => {
      if (!confirm('Удалить эту группу тестов из истории?')) return;
      
      await StorageService.removeBatch(batchId);
      // Обновляем список локально, чтобы не делать лишний запрос
      setBatches(prev => prev.filter(b => b.id !== batchId));
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncCount(0);
    try {
      const tab = await VelesService.findTab();
      if (!tab || !tab.id) {
        alert("Пожалуйста, откройте вкладку Veles.finance");
        setSyncing(false);
        return;
      }

      // Запуск синхронизации
      await SyncService.sync(tab.id, (progress) => {
        setSyncCount(progress);
      });

      // Обновляем статистику после завершения
      await loadDbStats();
    } catch (e: any) {
      console.error(e);
      alert(`Ошибка синхронизации: ${e.message}`);
    } finally {
      setSyncing(false);
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
            <Stack gap={0}>
                <Title order={2}>История запусков</Title>
                <Text size="xs" c="dimmed">Локально сохранено: {totalSaved}</Text>
            </Stack>
        </Group>
        
        <Group>
             <Button 
                variant={syncing ? "light" : "filled"} 
                color="blue" 
                leftSection={syncing ? <Loader size={16} color="blue"/> : <IconRefresh size={16} />}
                onClick={handleSync}
                disabled={syncing}
             >
                {syncing ? `Синхронизация (${syncCount})...` : 'Синхронизировать'}
             </Button>

            {batches.length > 0 && (
              <Button 
                variant="subtle" color="red" leftSection={<IconTrash size={16} />}
                onClick={handleClearHistory}
                disabled={syncing}
              >
                Очистить все
              </Button>
            )}
        </Group>
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
              
              {/* HEADER: ID, Дата и Кнопка удаления */}
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
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
                
                {/* КНОПКА УДАЛЕНИЯ КОНКРЕТНОЙ ГРУППЫ */}
                <Tooltip label="Удалить группу">
                    <ActionIcon 
                        variant="subtle" 
                        color="red" 
                        size="sm" 
                        onClick={() => handleDeleteBatch(batch.id)}
                    >
                        <IconTrash size={16} />
                    </ActionIcon>
                </Tooltip>
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
                 <Group justify="space-between" align="center">
                    <Stack gap={0}>
                       <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Всего тестов</Text>
                       <Text fw={500}>{batch.totalTests}</Text>
                    </Stack>
                    
                    <Button 
                        size="xs" variant="white" color="blue" 
                        leftSection={<IconTable size={16}/>}
                        onClick={() => setSelectedBatch({ id: `${batch.namePrefix} (${batch.id})`, ids: batch.velesIds })}
                    >
                        Результаты
                    </Button>
                 </Group>
              </Card.Section>

              <ScrollArea h={40} mt="xs" type="auto" scrollbarSize={4}>
                 <Text size="xs" c="dimmed" style={{fontSize: 10}}>
                    IDs: {batch.velesIds.join(', ')}
                 </Text>
              </ScrollArea>

            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* МОДАЛКА С ТАБЛИЦЕЙ */}
      <ResultsModal 
         opened={!!selectedBatch} 
         onClose={() => setSelectedBatch(null)} 
         title={selectedBatch?.id || ''}
         targetIds={selectedBatch?.ids || []}
      />
    </Container>
  );
}