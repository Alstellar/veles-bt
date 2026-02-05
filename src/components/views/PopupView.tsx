// src/components/views/PopupView.tsx
import { useState, useEffect } from 'react';
import { Box, Center, Loader } from '@mantine/core';
import { getPageContext } from '../../utils/pageParser'; 
import { PopupHome } from '../popup/PopupHome';
import { AnalyzerWidget } from '../AnalyzerWidget';
import type { VelesPageContext } from '../../types';

export function PopupView() {
    const [loading, setLoading] = useState(true);
    const [isVeles, setIsVeles] = useState(false);
    const [context, setContext] = useState<VelesPageContext | null>(null);
    const [view, setView] = useState<'home' | 'analysis'>('home');

    useEffect(() => {
        checkCurrentContext();
    }, []);

    const checkCurrentContext = async () => {
        setLoading(true);
        try {
            const data = await getPageContext();
            setContext(data);
            setIsVeles(data.isBotPage);
        } catch (e) {
            console.error('Ошибка получения контекста:', e);
            setIsVeles(false);
        } finally {
            setLoading(false);
        }
    };

    const openFullTab = () => {
        const url = 'index.html?mode=fullscreen';
        if (chrome.tabs) {
            chrome.tabs.create({ url });
        } else {
            window.open(`?mode=fullscreen`, '_blank');
        }
    };

    const handleAnalyze = () => {
        setView('analysis');
    };

    if (loading) {
        return (
            <Center h={300} w={500} bg="white">
                <Loader type="dots" />
            </Center>
        );
    }

    return (
        // 👇👇👇 ВОТ ЗДЕСЬ НАСТРАИВАЕТСЯ ОТСТУП 👇👇👇
        // Добавили p={10} — это 10 пикселей отступа со всех сторон внутри попапа.
        <Box w={500} bg="white" style={{ minHeight: 'auto' }} p={10}>
            {view === 'home' ? (
                <PopupHome 
                    isVelesPage={isVeles}
                    onOpenDashboard={openFullTab}
                    onAnalyze={handleAnalyze}
                />
            ) : (
                context && (
                    <AnalyzerWidget 
                        symbol={context.symbol}
                        exchange={context.exchange}
                        algo={context.algo}
                        onBack={() => setView('home')}
                    />
                )
            )}
        </Box>
    );
}