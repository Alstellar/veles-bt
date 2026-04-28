// src/components/modals/DonateModal.tsx
import { 
    Modal, Stack, Text, Divider, List, ThemeIcon, Button, Code, Group, 
    CopyButton, Tooltip, ActionIcon, Title, Tabs // 👈 Удалили Badge
} from '@mantine/core';
import { IconGift, IconCheck, IconCopy, IconFlame, IconExternalLink } from '@tabler/icons-react';

interface Props {
    opened: boolean;
    onClose: () => void;
}

export function DonateModal({ opened, onClose }: Props) {
    
    // Шаблон письма для Veles
    const emailTemplate = `Здравствуйте! Прошу закрепить мой аккаунт за партнером ID 2502 (код invite: algo_bots). Мой ID на платформе: [ВСТАВЬТЕ СЮДА ВАШ ID]`;
    
    // Код реферала для Tiger
    const tigerCode = "algobots";

    return (
        <Modal 
            opened={opened} 
            onClose={onClose} 
            title={
                <Group>
                    <IconGift color="var(--mantine-color-pink-6)"/>
                    <Title order={4}>Поддержать автора</Title>
                </Group>
            }
            size="lg"
        >
            <Stack gap="md">
                {/* 1. ОБЩЕЕ ВСТУПЛЕНИЕ */}
                <Text size="sm">
                    Проект <b>Veles Helper</b> полностью бесплатен. Лучшая награда для меня — если вы станете моим партнером. 
                    Это дает вам бонусы, а мне — мотивацию развивать проект!
                </Text>

                {/* 2. ОБЩИЕ БОНУСЫ */}
                <Divider label="Что вы получите (для любого способа)" labelPosition="center" />
                <List
                    spacing="xs"
                    size="sm"
                    center
                    icon={
                        <ThemeIcon color="teal" size={20} radius="xl">
                            <IconCheck size={12} />
                        </ThemeIcon>
                    }
                >
                    <List.Item>Ранний доступ к новым инструментам и функциям</List.Item>
                    <List.Item>Доступ в закрытый канал с моими личными стратегиями</List.Item>
                    <List.Item>Помощь в освоении бектестера и настройки ботов</List.Item>
                </List>

                {/* 3. ВКЛАДКИ ВЫБОРА ПЛАТФОРМЫ */}
                <Tabs defaultValue="veles" variant="outline" radius="md" mt="sm">
                    <Tabs.List grow>
                        <Tabs.Tab value="donate" fw={700}>Донат</Tabs.Tab>
                        <Tabs.Tab value="veles" fw={700}>Veles Finance</Tabs.Tab>
                        <Tabs.Tab value="tiger" fw={700} color="orange">Tiger Broker 🐯</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="donate" pt="md">
                        <Stack gap="md">
                            <Text size="sm">
                                Расширение было полезно? Можете выразить свою благодарность в виде любого доната.
                            </Text>
                            <Text size="sm">
                                Любая благодарность мотивирует меня на дальнейшую разработку полезных инструментов!
                            </Text>
                            <Button
                                component="a"
                                href="https://web.tribute.tg/d/J3C"
                                target="_blank"
                                size="md"
                                color="pink"
                                rightSection={<IconExternalLink size={18} />}
                            >
                                Поддержать донатом
                            </Button>
                        </Stack>
                    </Tabs.Panel>

                    {/* === Вкладка VELES === */}
                    <Tabs.Panel value="veles" pt="md">
                        <Stack gap="md">
                            <Divider label="Способ 1: Регистрация (для новичков)" labelPosition="center" />
                            <Button 
                                component="a" 
                                href="https://veles.finance/invite/algo_bots" 
                                target="_blank"
                                size="md" 
                                variant="gradient" 
                                gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
                            >
                                Зарегистрироваться на Veles
                            </Button>

                            <Divider label="Способ 2: Если аккаунт уже есть" labelPosition="center" />
                            <Text size="sm" c="dimmed">
                                Напишите письмо на <Code>support@veles.finance</Code><br/>
                                Укажите ваш ID платформы, мой партнерский ID <b>2502</b> и код <b>algo_bots</b>.
                            </Text>

                            <Stack gap={5}>
                                <Text size="xs" fw={700}>Шаблон письма:</Text>
                                <Group gap={0} wrap="nowrap">
                                    <Code block style={{ flex: 1, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                                        {emailTemplate}
                                    </Code>
                                    <CopyButton value={emailTemplate} timeout={2000}>
                                        {({ copied, copy }) => (
                                            <Tooltip label={copied ? 'Скопировано' : 'Копировать'} withArrow position="right">
                                                <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} size="lg" h="auto" style={{ alignSelf: 'stretch' }}>
                                                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                </Group>
                            </Stack>
                        </Stack>
                    </Tabs.Panel>

                    {/* === Вкладка TIGER BROKER === */}
                    <Tabs.Panel value="tiger" pt="md">
                         <Stack gap="md">
                            <Text size="sm">
                                <b>Tiger Broker</b> — официальный брокер, предоставляющий доступ к ликвидности <b>Binance</b> и <b>Bybit</b>.
                            </Text>

                            <List
                                spacing="xs"
                                size="sm"
                                center
                                icon={
                                    <ThemeIcon color="orange" size={20} radius="xl" variant="light">
                                        <IconFlame size={14} />
                                    </ThemeIcon>
                                }
                            >
                                <List.Item>Кэшбек с торговых комиссий (возврат средств)</List.Item>
                                <List.Item>Возможность создания до 5 субаккаунтов</List.Item>
                                <List.Item>Нет привязки к вашему ГЕО</List.Item>
                            </List>

                            <Divider label="Способ 1: Регистрация (для новичков)" labelPosition="center" />
                            <Button 
                                component="a" 
                                href="https://account.tiger.com/signup?referral=algobots" 
                                target="_blank"
                                size="md" 
                                color="orange"
                                rightSection={<IconExternalLink size={18}/>}
                            >
                                Регистрация в Tiger.com
                            </Button>

                            <Divider label="Способ 2: Если аккаунт уже есть" labelPosition="center" />
                            <Text size="sm" c="dimmed">
                                1. Перейди в личный кабинет → раздел «Реферальная программа».<br/>
                                2. В поле «Реферальный код» вставь код ниже.
                            </Text>

                            <Group gap="xs" grow>
                                <Button 
                                    variant="light" color="gray" 
                                    size="lg" 
                                    styles={{ root: { border: '1px dashed var(--mantine-color-gray-4)' } }}
                                >
                                    <Text span fw={900} size="xl" ff="monospace">{tigerCode}</Text>
                                </Button>
                                <CopyButton value={tigerCode} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Button 
                                            color={copied ? 'teal' : 'blue'} 
                                            onClick={copy} 
                                            size="lg"
                                            leftSection={copied ? <IconCheck size={20}/> : <IconCopy size={20}/>}
                                        >
                                            {copied ? 'Скопировано!' : 'Копировать код'}
                                        </Button>
                                    )}
                                </CopyButton>
                            </Group>
                         </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Modal>
    );
}