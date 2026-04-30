function formatPresetValue(value: number): string {
  const normalized = Number(value.toFixed(6));
  return String(normalized);
}

function range(start: number, end: number, step: number): string[] {
  const values: string[] = [];

  for (let current = start; current <= end + step / 10; current += step) {
    values.push(formatPresetValue(current));
  }

  return values;
}

function descendingRange(start: number, end: number, step: number): string[] {
  const values: string[] = [];

  for (let current = start; current >= end - step / 10; current -= step) {
    values.push(formatPresetValue(current));
  }

  return values;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export const VELES_SIMPLE_SWEEP_PRESETS = {
  orders: range(2, 60, 1),
  martingale: range(1, 500, 1),
  indent: unique([
    ...range(0, 0.1, 0.01),
    ...range(0.1, 1, 0.05),
    ...range(1, 5, 0.1),
    ...range(5, 10, 0.5)
  ]),
  overlap: unique([
    ...range(0.5, 1, 0.05),
    ...range(1, 3, 0.1),
    ...range(3, 100, 1),
    ...range(100, 500, 10)
  ]),
  logarithmicFactor: range(0.1, 2.9, 0.1).filter((value) => value !== '1')
} as const;

export const VELES_TAKE_PROFIT_PRESETS = unique([
  ...range(0.2, 2, 0.05),
  ...range(2, 3, 0.1),
  ...range(3, 10, 0.5),
  ...range(10, 30, 1),
  ...range(30, 90, 5)
]);

export const VELES_SIMPLE_STOP_LOSS_PRESETS = unique([
  ...descendingRange(-0.05, -3, 0.05),
  ...descendingRange(-3, -5, 0.1),
  ...descendingRange(-5, -10, 0.5),
  ...descendingRange(-10, -99, 1)
]);
