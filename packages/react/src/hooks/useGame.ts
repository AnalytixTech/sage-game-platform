import { useCallback, useEffect, useState } from 'react';
import { Game } from '@sagegames/types';
import { useSageGameContext } from '../providers/SageGameProvider';

export function useGame(gameId: string) {
  const { client } = useSageGameContext();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await client.games.get(gameId);
      setGame(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, gameId]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  return { game, loading, error, refetch: fetchGame };
}
