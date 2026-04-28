import { normalizeCondition } from '../services/ConditionNormalizationService';
import type { Condition, FilterSlot, SignalOrderLine, CustomOrderLine } from '../types';

const randomId = () => Math.random().toString(36).substr(2, 9);

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const cloneConditionWithNewId = (condition: Condition): Condition => {
  const cloned = deepClone(condition);
  return normalizeCondition({
    ...cloned,
    id: randomId()
  });
};

export const cloneFilterSlotWithNewIds = (slot: FilterSlot): FilterSlot => {
  const cloned = deepClone(slot);
  return {
    ...cloned,
    id: randomId(),
    variants: (cloned.variants || []).map(cloneConditionWithNewId)
  };
};

export const cloneSignalOrderWithNewIds = (order: SignalOrderLine): SignalOrderLine => {
  const cloned = deepClone(order);
  return {
    ...cloned,
    id: randomId(),
    filterSlots: (cloned.filterSlots || []).map(cloneFilterSlotWithNewIds)
  };
};

export const cloneCustomOrderWithNewId = (order: CustomOrderLine): CustomOrderLine => {
  const cloned = deepClone(order);
  return {
    ...cloned,
    id: randomId()
  };
};
