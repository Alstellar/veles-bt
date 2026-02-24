import { Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface Props {
  visible: boolean;
}

export function ConnectionAlert({ visible }: Props) {
  if (!visible) return null;

  return (
    <Alert variant="light" color="red" title="Подсказка" icon={<IconAlertCircle />}>
      Для работы с расширением откройте{' '}
      <a href="https://veles.finance/cabinet" target="_blank" rel="noreferrer">
        <b>veles.finance</b>
      </a>{' '}
      в активной вкладке и авторизуйтесь.
    </Alert>
  );
}
