import { useEffect, useState } from 'react';
import type { SearchConditions } from '../types';

const STORAGE_KEY = 'nagoya-subway-conditions-v3';

export const DEFAULT_CONDITIONS: SearchConditions = {
  ticketKind: 'commuter',
  period: '1',
  minZone: 1,
  maxZone: 5,
  selections: {
    endpoints: [],
    via_hard: [],
    via_soft: [],
    avoid: [],
  },
};

const loadConditions = (): SearchConditions => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CONDITIONS;
    const parsed = JSON.parse(stored) as Partial<SearchConditions>;
    return {
      ...DEFAULT_CONDITIONS,
      ...parsed,
      selections: {
        ...DEFAULT_CONDITIONS.selections,
        ...parsed.selections,
      },
    };
  } catch {
    return DEFAULT_CONDITIONS;
  }
};

export const usePersistentConditions = () => {
  const [conditions, setConditions] = useState<SearchConditions>(loadConditions);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conditions));
  }, [conditions]);

  const resetConditions = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConditions(DEFAULT_CONDITIONS);
  };

  return { conditions, setConditions, resetConditions };
};
