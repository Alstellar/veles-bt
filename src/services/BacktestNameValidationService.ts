export const BACKTEST_NAME_MAX_LENGTH = 100;
export const BACKTEST_NAME_PREFIX_MAX_LENGTH = 70;

export interface BacktestNameValidationError {
  index: number;
  name: string;
  length: number;
  max: number;
  overflow: number;
  symbol?: string;
  sourceTemplateUrl?: string;
}

export interface BacktestNameValidationResult {
  ok: boolean;
  errors: BacktestNameValidationError[];
}

export interface BacktestNameQueueItemLike {
  config: {
    name?: string | null;
    symbol?: string | null;
  };
  sourceTemplateUrl?: string;
}

export class BacktestNameValidationService {
  static getLength(value: unknown): number {
    return String(value ?? '').length;
  }

  static validatePrefix(prefix: string): { ok: boolean; length: number; max: number; overflow: number; message?: string } {
    const length = this.getLength(prefix);
    const overflow = Math.max(0, length - BACKTEST_NAME_PREFIX_MAX_LENGTH);
    return {
      ok: overflow === 0,
      length,
      max: BACKTEST_NAME_PREFIX_MAX_LENGTH,
      overflow,
      message: overflow > 0
        ? `Префикс имени слишком длинный: ${length}/${BACKTEST_NAME_PREFIX_MAX_LENGTH}. Сократите минимум на ${overflow} символ(ов).`
        : undefined
    };
  }

  static validateName(name: string): { ok: boolean; length: number; max: number; overflow: number; message?: string } {
    const length = this.getLength(name);
    const overflow = Math.max(0, length - BACKTEST_NAME_MAX_LENGTH);
    return {
      ok: overflow === 0,
      length,
      max: BACKTEST_NAME_MAX_LENGTH,
      overflow,
      message: overflow > 0
        ? `Имя теста слишком длинное: ${length}/${BACKTEST_NAME_MAX_LENGTH}. Сократите минимум на ${overflow} символ(ов).`
        : undefined
    };
  }

  static validateQueueItems(items: BacktestNameQueueItemLike[]): BacktestNameValidationResult {
    const errors: BacktestNameValidationError[] = [];
    items.forEach((item, index) => {
      const name = String(item.config.name ?? '');
      const result = this.validateName(name);
      if (!result.ok) {
        errors.push({
          index,
          name,
          length: result.length,
          max: result.max,
          overflow: result.overflow,
          symbol: item.config.symbol ?? undefined,
          sourceTemplateUrl: item.sourceTemplateUrl
        });
      }
    });
    return { ok: errors.length === 0, errors };
  }

  static formatQueueValidationError(result: BacktestNameValidationResult, label = 'тестов'): string {
    if (result.ok) return '';
    const examples = result.errors.slice(0, 5).map((error) => {
      const shortName = error.name.length > 120 ? `${error.name.slice(0, 117)}...` : error.name;
      const symbol = error.symbol ? `, ${error.symbol}` : '';
      return `#${error.index + 1}${symbol}: ${error.length}/${error.max}, +${error.overflow} - ${shortName}`;
    });
    const more = result.errors.length > examples.length
      ? `\n...и еще ${result.errors.length - examples.length}`
      : '';
    return [
      `Найдено ${result.errors.length} ${label} с именем длиннее ${BACKTEST_NAME_MAX_LENGTH} символов.`,
      'Сократите префикс, шаблон имени или имя импортированного шаблона.',
      '',
      ...examples,
      more
    ].filter(Boolean).join('\n');
  }
}
