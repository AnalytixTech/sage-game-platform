import React, { useState } from 'react';
import { Game, GameCatalog, SageGameProvider } from '@sagegames/react';
import { QuizMasterGameModule } from '@sagegames/game-quiz-master';
import { WordRushGameModule } from '@sagegames/game-word-rush';
import { MemoryMatchGameModule } from '@sagegames/game-memory-match';
import { WordSearchGameModule } from '@sagegames/game-word-search';
import { SudokuGameModule } from '@sagegames/game-sudoku';
import { Game as GameType, GameResult, WordSearchConfig } from '@sagegames/types';

const quizModule = new QuizMasterGameModule();
const wordModule = new WordRushGameModule();
const memoryModule = new MemoryMatchGameModule();
const wordSearchModule = new WordSearchGameModule();
const sudokuModule = new SudokuGameModule();

// Example host custom word configuration for Word Search game
const customWordConfig: WordSearchConfig = {
  categoryName: 'Immigration & Law Terms',
  difficulty: 'medium',
  gridSize: 12,
  words: [
    { token: 'VISA', display: 'Visa', definition: 'Conditional authorization granted by a territory' },
    { token: 'PERMIT', display: 'Permit', definition: 'An official document giving authorization' },
    { token: 'RIGHTS', display: 'Rights', definition: 'Legal or moral entitlements' },
    { token: 'APPEAL', display: 'Appeal', definition: 'Apply to a higher court for a reversal of decision' },
    { token: 'STATUTE', display: 'Statute', definition: 'A written law passed by a legislative body' },
  ],
};

export default function App() {
  const [token] = useState<string>('stk_demo_web_token_123');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);

  const handleSelectGame = async (game: GameType) => {
    setSelectedGame(game);
    setLastResult(null);
  };

  const handleComplete = (result: GameResult) => {
    console.log('Game completed!', result);
    setLastResult(result);
  };

  return (
    <SageGameProvider
      baseUrl="http://localhost:4000"
      sessionToken={token}
      modules={[quizModule, wordModule, memoryModule, wordSearchModule, sudokuModule]}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
        <header style={{ borderBottom: '2px solid #eee', paddingBottom: '16px', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, color: '#1e1b4b' }}>CampusApp — SageGame Integration</h1>
          <p style={{ color: '#6b7280' }}>
            Host Application: <strong>CampusApp</strong> | User: <strong>John Doe (user_123)</strong>
          </p>
        </header>

        {!selectedGame ? (
          <div>
            <h2>Select a Game</h2>
            <GameCatalog onSelectGame={handleSelectGame} />
          </div>
        ) : (
          <div>
            <button
              onClick={() => setSelectedGame(null)}
              style={{
                marginBottom: '16px',
                padding: '8px 16px',
                background: '#f3f4f6',
                border: '1px solid #ccc',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              ← Back to Game Catalog
            </button>

            <h2>Playing: {selectedGame.name}</h2>
            {selectedGame.id === 'game_word_search_001' ? (
              <div>
                <p style={{ color: '#4f46e5', fontWeight: 600 }}>
                  Category: {customWordConfig.categoryName} (Custom Host Config)
                </p>
                <Game
                  gameId={selectedGame.id}
                  config={customWordConfig}
                  onComplete={handleComplete}
                />
              </div>
            ) : (
              <Game gameId={selectedGame.id} onComplete={handleComplete} />
            )}

            {lastResult && (
              <div
                style={{
                  marginTop: '24px',
                  padding: '20px',
                  background: '#ecfdf5',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', color: '#065f46' }}>🎉 Session Completed!</h3>
                <p>Final Score: <strong>{lastResult.score}</strong></p>
                <p>Duration: <strong>{lastResult.duration} seconds</strong></p>
                <pre style={{ background: '#fff', padding: '12px', borderRadius: '4px', fontSize: '12px' }}>
                  {JSON.stringify(lastResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </SageGameProvider>
  );
}
