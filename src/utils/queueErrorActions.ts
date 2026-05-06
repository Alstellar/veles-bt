export interface QueueErrorActionConfig {
  symbol: string;
  exchange: string;
}

export interface QueueErrorActionItem {
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'TIMEOUT';
  error?: string;
  config: QueueErrorActionConfig;
}

export function getQueueSymbolKey(item: QueueErrorActionItem): string {
  return `${String(item.config.exchange ?? '').trim().toUpperCase()}::${String(item.config.symbol ?? '').trim().toUpperCase()}`;
}

export function markNoMarketDataItems<T extends QueueErrorActionItem>(
  items: T[],
  currentIndex: number,
  message: string,
  pendingIndices: number[],
  onMarked?: (index: number) => void
): number {
  const current = items[currentIndex];
  if (!current) return 0;

  const key = getQueueSymbolKey(current);
  let skipped = 0;
  items[currentIndex] = { ...current, status: 'ERROR', error: message };
  onMarked?.(currentIndex);

  for (let i = 0; i < items.length; i++) {
    if (i === currentIndex) continue;
    const candidate = items[i];
    if (!candidate || candidate.status !== 'PENDING') continue;
    if (getQueueSymbolKey(candidate) !== key) continue;

    items[i] = { ...candidate, status: 'ERROR', error: message };
    skipped += 1;
    const pendingPos = pendingIndices.indexOf(i);
    if (pendingPos > -1) pendingIndices.splice(pendingPos, 1);
    onMarked?.(i);
  }

  return skipped;
}
