/** A playable game inside the docs (local play, nothing is submitted). Loaded only on pages that use it. */
import { useState } from 'react';
import { allGames, arcadeTheme, GamePreview, lightTheme, SageGameProvider } from '@sagegames/react';

export default function GamePreviewBlock({ gameId }: { gameId: string }) {
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === 'light');
  const [seed, setSeed] = useState('docs');
  const plugin = allGames.find((g) => g.rules.gameId === gameId);
  if (!plugin) return null;
  const theme = light ? lightTheme : arcadeTheme;
  return (
    <figure className="doc-preview">
      <div className="doc-preview-bar">
        <span>Try it · local preview, not scored</span>
        <div className="row">
          <button type="button" className="ghost small" onClick={() => setLight((l) => !l)}>{light ? 'Dark' : 'Light'}</button>
          <button type="button" className="ghost small" onClick={() => setSeed(`docs-${Date.now()}`)}>New puzzle</button>
        </div>
      </div>
      <div className="doc-preview-stage" style={{ background: theme.colors.background }}>
        <SageGameProvider games={allGames} theme={theme}>
          <GamePreview key={seed} plugin={plugin} seed={seed} config={gameId === 'game_sudoku_001' ? { variant: '6x6' } : undefined} />
        </SageGameProvider>
      </div>
    </figure>
  );
}
