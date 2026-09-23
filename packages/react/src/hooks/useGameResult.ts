import { useState } from 'react';
import { GameResult } from '@sagegame/types';

export function useGameResult<T = Record<string, unknown>>() {
  const [result, setResult] = useState<GameResult<T> | null>(null);
  return { result, setResult };
}
