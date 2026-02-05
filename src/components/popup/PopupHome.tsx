// src/components/popup/PopupHome.tsx
import { Paper, Image, Title, Text, Button, Stack } from '@mantine/core';
import { IconExternalLink, IconRobot } from '@tabler/icons-react';

interface Props {
    isVelesPage: boolean;
    onOpenDashboard: () => void;
    onAnalyze: () => void;
}

/**
 * Стартовый экран попапа.
 * Отображает логотип и доступные действия в зависимости от контекста страницы.
 */
export function PopupHome({ isVelesPage, onOpenDashboard, onAnalyze }: Props) {
    return (
        <Paper shadow="xs" p="xl" radius="md" w="100%" withBorder ta="center">
            {/* Логотип и заголовок */}
            <Image 
                src="/icons/icon-128.png" 
                w={80} h={80} 
                mx="auto" mb="md" radius="md" 
            />
            
            <Title order={3} mb="sm">Veles Helper</Title>
            <Text size="sm" c="dimmed" mb="xl">
                {isVelesPage 
                    ? 'Обнаружена страница настройки бота' 
                    : 'Конфигуратор параметров для поиска эффективных стратегий'}
            </Text>

            <Stack>
                {/* Кнопка Анализа - только для страниц Veles */}
                {isVelesPage && (
                    <Button 
                        fullWidth size="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}
                        leftSection={<IconRobot size={20} />}
                        onClick={onAnalyze}
                    >
                        AI Анализ конфигурации
                    </Button>
                )}

                {/* Кнопка Панели управления - доступна всегда */}
                <Button 
                    fullWidth size="md" variant="default"
                    rightSection={<IconExternalLink size={20} />}
                    onClick={onOpenDashboard}
                >
                    Открыть панель управления
                </Button>
            </Stack>
        </Paper>
    );
}