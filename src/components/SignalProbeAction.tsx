import { ActionIcon, Badge, Loader, Tooltip } from '@mantine/core';
import { IconBellRinging } from '@tabler/icons-react';
import type { SignalProbeViewState } from '../services/SignalProbeService';

interface Props {
  state: SignalProbeViewState;
  onRequest: () => void;
  size?: 'sm' | 'md';
}

export function SignalProbeAction({ state, onRequest, size = 'md' }: Props) {
  if (state.status === 'ready' && typeof state.count === 'number') {
    return (
      <Badge variant="light" color="teal" size="sm">
        {state.count}
      </Badge>
    );
  }

  if (state.status === 'loading') {
    return (
      <ActionIcon variant="light" color="gray" size={size} disabled>
        <Loader size={14} />
      </ActionIcon>
    );
  }

  const tooltip = state.status === 'error' && state.error
    ? `Ошибка расчета: ${state.error}`
    : 'Проверить количество сигналов';

  return (
    <Tooltip label={tooltip}>
      <ActionIcon
        variant="light"
        color={state.status === 'error' ? 'red' : 'blue'}
        size={size}
        onClick={onRequest}
      >
        <IconBellRinging size={14} />
      </ActionIcon>
    </Tooltip>
  );
}

