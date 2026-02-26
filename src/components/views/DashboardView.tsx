import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  Paper,
  ThemeIcon,
  Button,
  SimpleGrid,
  Card,
  Badge,
  Accordion,
  List
} from '@mantine/core';
import {
  IconTestPipe,
  IconHistory,
  IconRocket,
  IconBrain,
  IconChartBar,
  IconAdjustments,
  IconCoins,
  IconTable,
  IconLock,
  IconPlayerPause,
  IconSettings,
  IconDownload,
  IconChevronLeft,
  IconChevronRight
} from '@tabler/icons-react';
import styles from './DashboardView.module.css';
import { ConnectionAlert } from '../ConnectionAlert';

interface Props {
  onNavigate: (view: string) => void;
  connectionError?: string | null;
}

interface ReleaseSlide {
  version: string;
  title: string;
  badge: string;
  color: string;
  points: Array<{ icon: ReactNode; text: string }>;
}

export function DashboardView({ onNavigate, connectionError }: Props) {
  const error = connectionError ?? null;

  const releases = useMemo<ReleaseSlide[]>(() => ([
    {
      version: 'v1.5.0',
      title: '\u0427\u0442\u043e \u043d\u043e\u0432\u043e\u0433\u043e',
      badge: 'NEW',
      color: 'teal',
      points: [
        {
          icon: <IconCoins size={16} />,
          text: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u0432\u043a\u043b\u0430\u0434\u043a\u0430 "\u0410\u043a\u0442\u0438\u0432\u044b": \u0442\u043e\u043f-10 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043c\u043e\u043d\u0435\u0442 \u0438 \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u0430\u043a\u0442\u0438\u0432\u043e\u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u0431\u0438\u0440\u0436\u0438.'
        }
      ]
    },
    {
      version: 'v1.4.0',
      title: 'Что нового',
      badge: 'NEW',
      color: 'orange',
      points: [
        {
          icon: <IconPlayerPause size={16} />,
          text: 'Добавлены Остановка/Возобновление задач и улучшена работа с несколькими вкладками Veles.'
        },
        {
          icon: <IconAdjustments size={16} />,
          text: 'Полностью переработан конфигуратор: новые блоки и расширенные проверки.'
        },
        {
          icon: <IconSettings size={16} />,
          text: 'Добавлена страница настроек и выгрузка отчета об ошибках.'
        },
        {
          icon: <IconDownload size={16} />,
          text: 'Добавлен импорт настроек из ботов Veles.'
        }
      ]
    },
    {
      version: 'v1.3.0',
      title: 'Что нового',
      badge: 'HOT',
      color: 'blue',
      points: [
        {
          icon: <IconBrain size={16} />,
          text: 'AI анализатор стратегий для Smart Analysis и оптимизации TP/GRID по ATR.'
        },
        {
          icon: <IconChartBar size={16} />,
          text: 'Таблица результатов 2.0: фильтрация, сортировка, экспорт CSV и полноэкранный режим.'
        },
        {
          icon: <IconRocket size={16} />,
          text: 'Оптимизация запуска тестов и повышение стабильности выполнения.'
        },
        {
          icon: <IconHistory size={16} />,
          text: 'Улучшения истории запусков и повторной синхронизации результатов.'
        }
      ]
    }
  ]), []);

  const [slideIndex, setSlideIndex] = useState(0);
  const activeSlide = releases[slideIndex];

  return (
    <Container size="lg" py="xl" className={`ui-surface ${styles.viewRoot}`}>
      <Stack gap="xl">
        <div className={`ui-topbar ${styles.topbar}`}>
          <div className={styles.titleWrap}>
            <Title order={1} className={styles.pageTitle}>Veles Helper</Title>
            <Text className={styles.pageHint}>Конфигуратор параметров для поиска эффективных стратегий.</Text>
          </div>
        </div>

        {error && (
          <Paper withBorder p="sm" radius="md" className="ui-card">
            <ConnectionAlert visible />
          </Paper>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" className={styles.mainGrid}>
          <Card withBorder radius="md" padding="lg" className={`ui-card ui-hover-lift ${styles.mainCard}`}>
            <Group justify="space-between" mb="xs">
              <Text fw={500}>Конфигуратор</Text>
              <Badge color="blue" variant="light">Основное</Badge>
            </Group>
            <Text size="sm" c="dimmed" mb="lg">
              Настройка конфигураций, запуск Grid Search и быстрый запуск тестов на больших наборах параметров.
            </Text>
            <Button
              variant="light"
              color="blue"
              fullWidth
              mt="md"
              radius="md"
              leftSection={<IconTestPipe size={20} />}
              onClick={() => onNavigate('backtester')}
              disabled={!!error}
            >
              Запустить новый тест
            </Button>
          </Card>

          <Card withBorder radius="md" padding="lg" className={`ui-card ui-hover-lift ${styles.mainCard}`}>
            <Group justify="space-between" mb="xs">
              <Text fw={500}>История запусков</Text>
              <Badge color="violet" variant="light">Контроль</Badge>
            </Group>
            <Text size="sm" c="dimmed" mb="lg">
              Просмотр прогресса задач, управление остановкой/продолжением и быстрый доступ к результатам.
            </Text>
            <Button
              variant="light"
              color="gray"
              fullWidth
              mt="md"
              radius="md"
              leftSection={<IconHistory size={20} />}
              onClick={() => onNavigate('history')}
            >
              Открыть историю
            </Button>
          </Card>
        </SimpleGrid>

        <Paper withBorder p="lg" radius="md" className={`ui-card ${styles.mainCard} ${styles.whatsNewCard}`}>
          <div className={styles.whatsNewHeader}>
            <Group gap="xs">
              <Title order={4}>{activeSlide.title}</Title>
              <Badge variant="filled" color={activeSlide.color} size="sm">{activeSlide.version}</Badge>
            </Group>
            <Badge variant="gradient" gradient={{ from: 'orange', to: 'red' }}>{activeSlide.badge}</Badge>
          </div>

          <div className={styles.slideBody}>
            <List spacing="sm" size="sm" center>
              {activeSlide.points.map((point, idx) => (
                <List.Item
                  key={`${activeSlide.version}-${idx}`}
                  icon={(
                    <ThemeIcon color="blue" size={24} radius="xl" variant="light">
                      {point.icon}
                    </ThemeIcon>
                  )}
                >
                  {point.text}
                </List.Item>
              ))}
            </List>
          </div>

          <div className={styles.slideNav}>
            <Button
              variant="default"
              className={styles.slideNavButton}
              leftSection={<IconChevronLeft size={14} />}
              disabled={slideIndex === 0}
              onClick={() => setSlideIndex((prev) => Math.max(0, prev - 1))}
            >
              Назад
            </Button>
            <Button
              variant="default"
              className={styles.slideNavButton}
              rightSection={<IconChevronRight size={14} />}
              disabled={slideIndex === releases.length - 1}
              onClick={() => setSlideIndex((prev) => Math.min(releases.length - 1, prev + 1))}
            >
              Вперед
            </Button>
          </div>
        </Paper>

        <Paper withBorder p="xl" radius="md" className={`ui-card ${styles.mainCard}`}>
          <Title order={4} mb="sm">Возможности Veles Helper</Title>
          <Text size="sm" c="dimmed" mb="md">
            Veles Helper - это профессиональный ассистент для автоматизации поиска прибыльных стратегий. Мы превращаем рутинный подбор параметров в системный процесс.
          </Text>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon color="blue" variant="light" size="lg"><IconAdjustments size={20} /></ThemeIcon>
              <div>
                <Text size="sm" fw={700}>Автоматический Grid Search</Text>
                <Text size="xs" c="dimmed">
                  Задайте диапазоны (например, сетка 10-20%, шаг 1%), и расширение проведет сотни тестов для поиска идеала.
                </Text>
              </div>
            </Group>

            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon color="grape" variant="light" size="lg"><IconBrain size={20} /></ThemeIcon>
              <div>
                <Text size="sm" fw={700}>AI Анализ конфигурации</Text>
                <Text size="xs" c="dimmed">
                  Независимый инструмент на странице редактирования бота. Подсказывает настройки TP и Сетки (на основе ATR) еще до запуска тестов.
                </Text>
              </div>
            </Group>

            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon color="teal" variant="light" size="lg"><IconTable size={20} /></ThemeIcon>
              <div>
                <Text size="sm" fw={700}>Продвинутая Аналитика</Text>
                <Text size="xs" c="dimmed">
                  Сортируйте результаты по профиту и просадке. Выявляйте самые стабильные настройки и выгружайте отчеты в CSV.
                </Text>
              </div>
            </Group>

            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon color="gray" variant="light" size="lg"><IconLock size={20} /></ThemeIcon>
              <div>
                <Text size="sm" fw={700}>Безопасность</Text>
                <Text size="xs" c="dimmed">
                  Работает поверх интерфейса Veles без доступа к API ключам. История тестов хранится локально.
                </Text>
              </div>
            </Group>
          </SimpleGrid>
        </Paper>

        <Paper withBorder p="xl" radius="md" className={`ui-card ${styles.faqCard}`}>
          <Title order={4} mb="md">Часто задаваемые вопросы</Title>
          <Accordion variant="separated" radius="md">
            <Accordion.Item value="grid">
              <Accordion.Control>Что такое Grid Search (перебор)?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dimmed">
                  Это метод поиска оптимальных настроек путем перебора всех возможных комбинаций. Если вы укажете 3 варианта отступа и 2 варианта мартингейла, расширение проведет 3 * 2 = 6 тестов.
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="close">
              <Accordion.Control>Можно ли закрывать расширение во время теста?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dimmed">
                  Нет. Очередь тестов управляется скриптом внутри этой вкладки. Если вы закроете вкладку, запуск остановится. Однако, тестирование можно будет продолжить в Истории запусков
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="safe">
              <Accordion.Control>Это безопасно? Вы крадете мои API ключи?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dimmed">
                  Абсолютно. Расширение не требует ввода API ключей. Оно работает поверх вашей сессии в браузере. Все данные хранятся локально.
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="limits">
              <Accordion.Control>Как работают лимиты Veles?</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dimmed">
                  Veles ограничивает частоту запусков. Расширение автоматически делает паузы между тестами.
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      </Stack>
    </Container>
  );
}
