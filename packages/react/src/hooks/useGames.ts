import { useCallback, useEffect, useState } from 'react';
import { Game, GameCategory } from '@sagegame/types';
import { useSageGameContext } from '../providers/SageGameProvider';

export interface UseGamesOptions {
  category?: GameCategory;
  search?: string;
  autoFetch?: boolean;
}

export function useGames(options: UseGamesOptions = {}) {
  const { client } = useSageGameContext();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(options.autoFetch !== false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.games.list({
        category: options.category,
        search: options.search,
      });
      setGames(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, options.category, options.search]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchGames();
    }
  }, [fetchGames, options.autoFetch]);

  return { games, loading, error, refetch: fetchGames };
}
