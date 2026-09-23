import { useState } from 'react';
import { GameResult } from '@sagegames/types';

export function useGameResult<T = Record<string, unknown>>() {
  const [result, setResult] = useState<GameResult<T> | null>(null);
  return { result, setResult };
}
