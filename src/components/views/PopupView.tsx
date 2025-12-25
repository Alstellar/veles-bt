import { Paper, Center, ThemeIcon, Title, Text, Button } from '@mantine/core';
import { IconRocket, IconExternalLink } from '@tabler/icons-react';

export function PopupView() {
  const openFullTab = () => {
    if (chrome.tabs) {
      chrome.tabs.create({ url: 'index.html?mode=fullscreen' });
    } else {
      window.open('?mode=fullscreen', '_blank');
    }
  };

  return (
    <Center h={600} bg="gray.1" p="md">
      <Paper shadow="md" p="xl" radius="md" w="100%" withBorder ta="center">
        <ThemeIcon size={60} radius="xl" color="blue" variant="light" mb="md">
          <IconRocket size={34} />
        </ThemeIcon>
        <Title order={3} mb="sm">Veles Helper</Title>
        <Text size="sm" c="dimmed" mb="xl">
          Конфигуратор параметров для поиска эффективных стратегий.
        </Text>
        <Button 
          fullWidth size="md" 
          rightSection={<IconExternalLink size={20} />}
          onClick={openFullTab}
        >
          Открыть панель управления
        </Button>
      </Paper>
    </Center>
  );
}