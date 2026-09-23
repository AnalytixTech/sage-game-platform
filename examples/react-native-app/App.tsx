import React, { useState } from 'react';
import {
  Game,
  GameCatalog,
  SageGameProvider,
} from '@sagegame/react-native';
import { Game as GameType, GameResult } from '@sagegame/types';

export default function App() {
  const [sessionToken] = useState('stk_demo_mobile_token_456');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);

  return (
    <SageGameProvider baseUrl="http://localhost:4000" sessionToken={sessionToken}>
      <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
        <h2>FitnessApp Mobile Games</h2>

        {!selectedGame ? (
          <GameCatalog
            onSelectGame={(game: GameType) => setSelectedGame(game)}
          />
        ) : (
          <div>
            <button
              onClick={() => setSelectedGame(null)}
              style={{
                marginBottom: 12,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #ccc',
              }}
            >
              Back
            </button>
            <Game
              gameId={selectedGame.id}
              sessionToken={sessionToken}
              onComplete={(res: GameResult) => {
                alert(`Mobile Game Complete! Score: ${res.score}`);
                setSelectedGame(null);
              }}
            />
          </div>
        )}
      </div>
    </SageGameProvider>
  );
}
