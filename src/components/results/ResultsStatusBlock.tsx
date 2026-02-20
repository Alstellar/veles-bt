// src/components/results/ResultsStatusBlock.tsx
import { useEffect, useRef } from 'react';
import { Stack, Group, Text, Badge, Button, Progress, ScrollArea } from '@mantine/core';
import { IconPlayerStop, IconTerminal2 } from '@tabler/icons-react';

interface Props {
  status?: string;
  progress?: { current: number; total: number };
  isLive?: boolean;
  onStop?: () => void;
  logs: string[];
}

export function ResultsStatusBlock({ status, progress, isLive, onStop, logs }: Props) {
  const viewport = useRef<HTMLDivElement>(null);

  // Авто-скролл логов
  useEffect(() => {
    if (logs.length > 0 && viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs]);

  if (!progress) return null;

  return (
    <Stack gap={0} bg="gray.0" style={{ borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
      
      {/* Верхняя часть: Статус */}
      <Stack gap={4} p="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500}>{status}</Text>
          <Group gap="xs">
            <Badge size="lg" variant="light">{progress.current} / {progress.total}</Badge>
            {isLive && onStop && progress.current < progress.total && (
              <Button color="red" size="xs" variant="subtle" leftSection={<IconPlayerStop size={14} />} onClick={onStop}>
                Стоп
              </Button>
            )}
          </Group>
        </Group>
        <Progress value={(progress.current / (progress.total || 1)) * 100} animated={isLive} size="sm" radius="xl" />
      </Stack>

      {/* Нижняя часть: Логи */}
      <Stack gap={0} bg="gray.0" p="xs" pt={0} style={{ borderTop: '1px solid #dee2e6' }}>
        <Group gap={6} mb={4} mt={6}>
          <IconTerminal2 size={12} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Лог выполнения</Text>
        </Group>
        <ScrollArea h={80} viewportRef={viewport} type="auto" scrollbarSize={6}>
          {logs.length === 0 ? (
            <Text size="xs" c="dimmed" fs="italic">Ожидание событий...</Text>
          ) : (
            logs.map((log, idx) => (
              <Text key={idx} size="xs" c="dark.3" style={{ fontFamily: 'monospace', lineHeight: 1.3 }}>
                {log}
              </Text>
            ))
          )}
        </ScrollArea>
      </Stack>
    </Stack>
  );
}