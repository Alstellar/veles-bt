import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBug } from '@tabler/icons-react';

import { ValidatorService } from '../services/ValidatorService';
import { ConfigGenerator } from '../services/ConfigGenerator';
import type { StaticConfig, OrderState, EntryConfig, ExitConfig } from '../types';

interface DebugToolsProps {
  staticConfig: StaticConfig;
  entryConfig: EntryConfig;
  orderState: OrderState;
  exitConfig: ExitConfig;
}

export function DebugTools({ 
  staticConfig, entryConfig, orderState, exitConfig 
}: DebugToolsProps) {

  // МЫ УБРАЛИ ПРОВЕРКУ import.meta.env.DEV
  // Теперь компонент отображается всегда, когда он вызван в родителе.

  const handleDebug = () => {
    // 1. Валидация
    const val = ValidatorService.validate(staticConfig, entryConfig, orderState, exitConfig);
    if (!val.valid) {
        notifications.show({ color: 'red', message: `Ошибка валидации: ${val.error}` });
        return;
    }

    // 2. Генерация
    const { configs } = ConfigGenerator.generate(staticConfig, entryConfig, orderState, exitConfig);

    // 3. Вывод в консоль
    console.group('🛠️ DEBUG: Generated Configurations');
    console.log(`Всего вариаций: ${configs.length}`);
    
    configs.forEach((cfg, i) => {
        console.log(`%c Config #${i + 1}: ${cfg.name}`, 'color: #228be6; font-weight: bold;', cfg);
    });
    console.groupEnd();

    notifications.show({ 
        title: 'Debug Success',
        message: `Сгенерировано ${configs.length} конфигов. Результат в консоли (F12).`,
        color: 'teal',
        icon: <IconBug size={16} />
    });
  };

  return (
    <Button 
        variant="subtle" 
        color="orange" 
        size="xs"
        leftSection={<IconBug size={16} />}
        onClick={handleDebug}
    >
        Debug
    </Button>
  );
}