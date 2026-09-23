import React, { useEffect, useRef, useState } from 'react';
import { GameLifecycleManager } from '@sagegame/core';
import { GameAction, GameEvent, GameModule, GameResult, GameState } from '@sagegame/types';
import { useSageGameContext } from '../providers/SageGameProvider';

export interface GameLauncherProps {
  gameId: string;
  sessionToken?: string;
  config?: Record<string, unknown>;
  onComplete?: (result: GameResult<any>) => void;
  onError?: (error: Error) => void;
  onEvent?: (event: GameEvent) => void;
}

export const GameLauncher: React.FC<GameLauncherProps> = ({
  gameId,
  sessionToken: overrideToken,
  config = {},
  onComplete,
  onError,
  onEvent,
}) => {
  const { client, sessionToken: contextToken, registeredModules } = useSageGameContext();
  const effectiveToken = overrideToken || contextToken;

  const [loading, setLoading] = useState<boolean>(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [currentGameState, setCurrentGameState] = useState<GameState | null>(null);

  const managerRef = useRef<GameLifecycleManager<any, any, any, any> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function initAndStartGame() {
      if (!effectiveToken) {
        const err = new Error('Missing session token for GameLauncher');
        setErrorState(err.message);
        onError?.(err);
        setLoading(false);
        return;
      }

      const module: GameModule<any, any, any, any> | undefined = registeredModules.get(gameId);

      if (!module) {
        const err = new Error(`Game module '${gameId}' is not registered in SageGameProvider`);
        setErrorState(err.message);
        onError?.(err);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        client.setSessionToken(effectiveToken);

        const manager = new GameLifecycleManager(module);
        managerRef.current = manager;

        manager.eventEmitter.on('all', (evt: GameEvent) => {
          onEvent?.(evt);
          if (evt.type === 'game_completed' && onComplete) {
            onComplete(evt.result);
          }
        });

        await manager.initialize({
          sessionId: `sess_${Date.now()}`,
          gameId,
          externalUserId: 'user_active',
          platform: 'web',
          config,
          sessionToken: effectiveToken,
          onEvent: (evt: GameEvent) => manager.eventEmitter.emit(evt),
        });

        await manager.start();

        if (isMounted) {
          setCurrentGameState(manager.getGameState());
          setLoading(false);
        }
      } catch (err: any) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (isMounted) {
          setErrorState(e.message);
          onError?.(e);
          setLoading(false);
        }
      }
    }

    initAndStartGame();

    return () => {
      isMounted = false;
      if (managerRef.current) {
        managerRef.current.destroy();
      }
    };
  }, [gameId, effectiveToken]);

  const handleAction = async (actionType: string, payload: unknown) => {
    if (!managerRef.current) return;
    const action: GameAction = {
      type: actionType,
      payload,
      timestamp: Date.now(),
    };
    await managerRef.current.submitAction(action);
    setCurrentGameState({ ...managerRef.current.getGameState() });
  };

  const handleFinish = async () => {
    if (!managerRef.current) return;
    const result = await managerRef.current.complete();
    onComplete?.(result);
  };

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Initializing {gameId}...</div>;
  }

  if (errorState) {
    return (
      <div style={{ padding: '24px', color: '#dc2626', background: '#fef2f2', borderRadius: '8px' }}>
        <strong>Game Launcher Error:</strong> {errorState}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3>Game Engine: {gameId}</h3>
        <div>Score: {currentGameState?.currentScore ?? 0}</div>
      </div>

      <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <p>Active Session State:</p>
        <pre style={{ fontSize: '12px' }}>{JSON.stringify(currentGameState?.data, null, 2)}</pre>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => handleAction('INTERACT', { timestamp: Date.now() })}
          style={{
            padding: '8px 16px',
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Submit Action
        </button>
        <button
          onClick={handleFinish}
          style={{
            padding: '8px 16px',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Complete Game
        </button>
      </div>
    </div>
  );
};
