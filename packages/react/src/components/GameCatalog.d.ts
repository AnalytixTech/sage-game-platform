import React from 'react';
import { Game, GameCategory } from '@sagegame/types';
export interface GameCatalogProps {
    onSelectGame?: (game: Game) => void;
    renderGameCard?: (game: Game, onSelect: () => void) => React.ReactNode;
    categoryFilter?: GameCategory;
    className?: string;
}
export declare const GameCatalog: React.FC<GameCatalogProps>;
//# sourceMappingURL=GameCatalog.d.ts.map