import { FILTERS_LIBRARY } from '../filtersLibrary';
import type { Condition, OperationType } from '../types';

interface IndicatorRules {
  hasTimeframe: boolean;
  hasValue: boolean;
  hasOperation: boolean;
  allowBasic: boolean;
  hasReverse: boolean;
}

const DEFAULT_RULES: IndicatorRules = {
  hasTimeframe: true,
  hasValue: true,
  hasOperation: true,
  allowBasic: true,
  hasReverse: false
};

function getRules(indicator?: string): IndicatorRules {
  if (!indicator) return DEFAULT_RULES;
  return FILTERS_LIBRARY[indicator]?.settings ?? DEFAULT_RULES;
}

function normalizeOperation(value: unknown): OperationType {
  if (value === 'GREATER' || value === 'LESS') return value;
  return 'GREATER';
}

export function normalizeCondition(condition: Condition): Condition {
  const indicator = condition.indicator || (condition.type === 'PRICE' ? 'PRICE' : 'RSI');
  const rules = getRules(indicator);
  const forceBasic = !rules.hasValue && !rules.hasOperation;
  const basic = forceBasic ? true : (rules.allowBasic ? Boolean(condition.basic) : true);
  const rawValue = String(condition.value ?? '').replace(/,/g, '.');

  return {
    ...condition,
    type: indicator === 'PRICE' ? 'PRICE' : 'INDICATOR',
    indicator,
    interval: rules.hasTimeframe ? (condition.interval || 'FIVE_MINUTES') : 'FIVE_MINUTES',
    basic,
    value: rules.hasValue ? rawValue : '',
    operation: rules.hasOperation ? normalizeOperation(condition.operation) : null,
    reverse: rules.hasReverse ? Boolean(condition.reverse) : false,
    closed: condition.closed !== undefined ? condition.closed : true
  };
}

