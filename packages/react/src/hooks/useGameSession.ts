import { useCallback, useEffect, useState } from 'react';
import { GameSession } from '@sagegame/types';
import { useSageGameContext } from '../providers/SageGameProvider';

export function useGameSession(sessionId?: string) {
  const { client } = useSageGameContext();
  const [session, setSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await client.sessions.get(sessionId);
      setSession(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, sessionId]);

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    }
  }, [fetchSession, sessionId]);

  return { session, loading, error, refetch: fetchSession };
}
