import { useState } from 'react';
import { GameState } from '@sagegames/types';

export function useGameState<TState extends GameState = GameState>(initialState?: TState) {
  const [gameState, setGameState] = useState<TState | undefined>(initialState);
  return { gameState, setGameState };
}
