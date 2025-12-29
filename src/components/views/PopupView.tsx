import { Paper, Center, Title, Text, Button, Image } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';

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
        
        <Image 
            src="/icons/icon-128.png" 
            w={80} 
            h={80} 
            mx="auto" 
            mb="md" 
            radius="md" 
        />
        
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