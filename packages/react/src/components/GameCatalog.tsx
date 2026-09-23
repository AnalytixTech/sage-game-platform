import React, { useState } from 'react';
import { Game, GameCategory } from '@sagegames/types';
import { useGames } from '../hooks/useGames';

export interface GameCatalogProps {
  onSelectGame?: (game: Game) => void;
  renderGameCard?: (game: Game, onSelect: () => void) => React.ReactNode;
  categoryFilter?: GameCategory;
  className?: string;
}

export const GameCatalog: React.FC<GameCatalogProps> = ({
  onSelectGame,
  renderGameCard,
  categoryFilter,
  className,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<GameCategory | undefined>(
    categoryFilter
  );
  const { games, loading, error } = useGames({ category: selectedCategory });

  const categories: GameCategory[] = [
    'quiz',
    'trivia',
    'word',
    'puzzle',
    'memory',
    'multiplayer',
    'arcade',
  ];

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading SageGame catalog...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'red', padding: '20px' }}>
        Failed to load catalog: {error.message}
      </div>
    );
  }

  return (
    <div className={className} style={{ fontFamily: 'sans-serif', padding: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }}>
        <button
          onClick={() => setSelectedCategory(undefined)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            background: !selectedCategory ? '#4f46e5' : '#e0e7ff',
            color: !selectedCategory ? '#fff' : '#3730a3',
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: selectedCategory === cat ? '#4f46e5' : '#e0e7ff',
              color: selectedCategory === cat ? '#fff' : '#3730a3',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}
      >
        {games.map((game) => {
          const handleSelect = () => onSelectGame?.(game);

          if (renderGameCard) {
            return <React.Fragment key={game.id}>{renderGameCard(game, handleSelect)}</React.Fragment>;
          }

          return (
            <div
              key={game.id}
              onClick={handleSelect}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px',
                background: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                transition: 'transform 0.15s ease',
              }}
            >
              {game.thumbnail && (
                <img
                  src={game.thumbnail}
                  alt={game.name}
                  style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' }}
                />
              )}
              <h3 style={{ margin: '12px 0 4px', fontSize: '18px' }}>{game.name}</h3>
              <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: '14px' }}>
                {game.description || 'Interactive game powered by SageGame'}
              </p>
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: '#f3f4f6',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {game.category}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
