// src/components/views/DashboardView.tsx

import { useEffect, useState } from 'react';
import { 
    Container, Stack, Group, Title, Text, Paper, Loader, ThemeIcon, Button, Alert, SimpleGrid, Card, Badge, Accordion, List 
} from '@mantine/core';
import { 
    IconAlertCircle, IconRefresh, IconPlugConnected, IconTestPipe, IconHistory, 
    IconRocket, IconBrain, IconChartBar, 
    IconAdjustments, IconTable, IconLock 
} from '@tabler/icons-react';
import { VelesService } from '../../services/VelesService';
import type { UserProfile } from '../../types/veles';

interface Props {
    onNavigate: (view: string) => void;
}

export function DashboardView({ onNavigate }: Props) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const checkAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            const tab = await VelesService.findTab();
            if (!tab || !tab.id) {
                throw new Error("Вкладка veles.finance не найдена");
            }
            const res = await VelesService.getProfile(tab.id);
            if (res.success && res.data) {
                setUser(res.data);
            } else {
                throw new Error("Не удалось получить профиль (вы не авторизованы?)");
            }
        } catch (e: any) {
            setError(e.message);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                <Group justify="space-between" align="flex-start">
                    <div>
                        <Title order={1}>Veles Helper</Title>
                        <Text c="dimmed">Конфигуратор параметров для поиска эффективных стратегий.</Text>
                    </div>
                    
                    <Paper withBorder p="xs" px="md" radius="md" bg="white">
                        {loading ? (
                            <Group>
                                <Loader size="xs" />
                                <Text size="sm">Проверка связи...</Text>
                            </Group>
                        ) : error ? (
                            <Group>
                                <ThemeIcon color="red" variant="light" size="sm"><IconAlertCircle size={14}/></ThemeIcon>
                                <Text size="sm" c="red" fw={500}>Нет соединения</Text>
                                <Button variant="subtle" size="compact-xs" onClick={checkAuth} leftSection={<IconRefresh size={12}/>}>
                                    Обновить
                                </Button>
                            </Group>
                        ) : (
                            <Group>
                                <ThemeIcon color="green" variant="light" size="sm"><IconPlugConnected size={14}/></ThemeIcon>
                                <Stack gap={0}>
                                    <Text size="xs" c="dimmed" fw={700}>СВЯЗЬ АКТИВНА</Text>
                                    <Text size="sm" fw={500}>Привет, ID: {user?.id}</Text>
                                </Stack>
                            </Group>
                        )}
                    </Paper>
                </Group>

                {error && (
                    <Alert variant="light" color="red" title="Внимание" icon={<IconAlertCircle />}>
                        Для работы расширения необходимо открыть вкладку <b>veles.finance</b> в этом же браузере и авторизоваться.
                    </Alert>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                            <Text fw={500}>Бектесты</Text>
                            <Badge color="blue" variant="light">Основное</Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mb="lg">
                            Создание конфигураций, генерация сеток Grid Search и массовый запуск тестов в фоновом режиме.
                        </Text>
                        <Button 
                            variant="light" color="blue" fullWidth mt="md" radius="md"
                            leftSection={<IconTestPipe size={20}/>}
                            onClick={() => onNavigate('backtester')}
                            disabled={!!error}
                        >
                            Запустить новый тест
                        </Button>
                    </Card>

                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                            <Text fw={500}>История запусков</Text>
                            <Badge color="violet" variant="light">Доступно</Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mb="lg">
                            Просмотр результатов предыдущих сессий (Batches). Список ID успешных тестов и параметры.
                        </Text>
                        <Button 
                            variant="light" color="gray" fullWidth mt="md" radius="md"
                            leftSection={<IconHistory size={20}/>}
                            onClick={() => onNavigate('history')}
                        >
                            Открыть историю
                        </Button>
                    </Card>
                </SimpleGrid>

                {/* БЛОК ОБНОВЛЕНИЙ v1.3.0 */}
                <Paper withBorder p="lg" radius="md" shadow="xs" style={{ borderLeft: '4px solid var(--mantine-color-blue-5)' }}>
                    <Group justify="space-between" mb="md">
                        <Group gap="xs">
                            <Title order={4}>Что нового</Title>
                            <Badge variant="filled" color="blue" size="sm">v1.3.0</Badge>
                        </Group>
                        <Badge variant="gradient" gradient={{ from: 'orange', to: 'red' }}>HOT</Badge>
                    </Group>
                    
                    <List spacing="sm" size="sm" center>
                        <List.Item icon={<ThemeIcon color="grape" size={24} radius="xl" variant="light"><IconBrain size={16} /></ThemeIcon>}>
                            <Text span fw={700}>AI Анализатор:</Text> Новый инструмент на странице бота. Рассчитывает <Text span fw={700} c="blue">TP</Text> и <Text span fw={700} c="blue">GRID</Text> на основе ATR (Smart Analysis).
                        </List.Item>
                        <List.Item icon={<ThemeIcon color="blue" size={24} radius="xl" variant="light"><IconChartBar size={16} /></ThemeIcon>}>
                            <Text span fw={700}>Таблица 2.0:</Text> Полный редизайн. Пагинация, сортировка, скачивание CSV, Full Screen режим и новые метрики.
                        </List.Item>
                        <List.Item icon={<ThemeIcon color="teal" size={24} radius="xl" variant="light"><IconRocket size={16} /></ThemeIcon>}>
                            <Text span fw={700}>Процесс:</Text> Прогресс в названии вкладки, синхронизация счетчиков и уведомления о завершении.
                        </List.Item>
                        <List.Item icon={<ThemeIcon color="orange" size={24} radius="xl" variant="light"><IconHistory size={16} /></ThemeIcon>}>
                            <Text span fw={700}>История:</Text> Компактные карточки, удаление групп, авто-очистка пустых запусков.
                        </List.Item>
                    </List>
                </Paper>

                {/* 🔥 ВОЗМОЖНОСТИ (ТЕПЕРЬ БЕЛЫЙ ФОН) 🔥 */}
                <Paper withBorder p="xl" radius="md" bg="white" shadow="sm">
                    <Title order={4} mb="sm">Возможности Veles Helper</Title>
                    <Text size="sm" c="dimmed" mb="md">
                        Veles Helper — это профессиональный ассистент для автоматизации поиска прибыльных стратегий. Мы превращаем рутинный подбор параметров в системный процесс.
                    </Text>

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                        <Group align="flex-start" wrap="nowrap">
                             <ThemeIcon color="blue" variant="light" size="lg"><IconAdjustments size={20}/></ThemeIcon>
                             <div>
                                 <Text size="sm" fw={700}>Автоматический Grid Search</Text>
                                 <Text size="xs" c="dimmed">Задайте диапазоны (например, сетка 10-20%, шаг 1%), и расширение проведет сотни тестов для поиска идеала.</Text>
                             </div>
                        </Group>

                        <Group align="flex-start" wrap="nowrap">
                             <ThemeIcon color="grape" variant="light" size="lg"><IconBrain size={20}/></ThemeIcon>
                             <div>
                                 <Text size="sm" fw={700}>AI Анализ конфигурации</Text>
                                 <Text size="xs" c="dimmed">Независимый инструмент на странице редактирования бота. Подсказывает настройки TP и Сетки (на основе ATR) еще до запуска тестов.</Text>
                             </div>
                        </Group>

                        <Group align="flex-start" wrap="nowrap">
                             <ThemeIcon color="teal" variant="light" size="lg"><IconTable size={20}/></ThemeIcon>
                             <div>
                                 <Text size="sm" fw={700}>Продвинутая Аналитика</Text>
                                 <Text size="xs" c="dimmed">Сортируйте результаты по профиту и просадке. Выявляйте самые стабильные настройки и выгружайте отчеты в CSV.</Text>
                             </div>
                        </Group>

                        <Group align="flex-start" wrap="nowrap">
                             <ThemeIcon color="gray" variant="light" size="lg"><IconLock size={20}/></ThemeIcon>
                             <div>
                                 <Text size="sm" fw={700}>Безопасность</Text>
                                 <Text size="xs" c="dimmed">Работает поверх интерфейса Veles без доступа к API ключам. История тестов хранится локально.</Text>
                             </div>
                        </Group>
                    </SimpleGrid>
                </Paper>

                <Paper withBorder p="xl" radius="md" bg="white">
                    <Title order={4} mb="md">Часто задаваемые вопросы</Title>
                    <Accordion variant="separated" radius="md">
                        <Accordion.Item value="grid">
                            <Accordion.Control>Что такое Grid Search (перебор)?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Это метод поиска оптимальных настроек путем перебора всех возможных комбинаций. 
                                    Если вы укажете 3 варианта отступа и 2 варианта мартингейла, расширение проведет 3 * 2 = 6 тестов.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                        <Accordion.Item value="close">
                            <Accordion.Control>Можно ли закрывать расширение во время теста?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    <b>Нет.</b> Очередь тестов управляется скриптом внутри этой вкладки. 
                                    Если вы закроете вкладку, запуск остановится.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                        <Accordion.Item value="safe">
                            <Accordion.Control>Это безопасно? Вы крадете мои API ключи?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Абсолютно. Расширение <b>не требует</b> ввода API ключей. 
                                    Оно работает поверх вашей сессии в браузере. Все данные хранятся локально.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                        <Accordion.Item value="limits">
                            <Accordion.Control>Как работают лимиты Veles?</Accordion.Control>
                            <Accordion.Panel>
                                <Text size="sm" c="dimmed">
                                    Veles ограничивает частоту запусков. Наше расширение автоматически делает паузы (Smart Delay) между тестами.
                                </Text>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Paper>
            </Stack>
        </Container>
    );
}