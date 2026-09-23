import { Game, GameCategory, Platform } from '@sagegame/types';
export declare class GameRegistry {
    private games;
    constructor(initialGames?: Game[]);
    register(game: Game): void;
    get(idOrSlug: string): Game | undefined;
    list(filter?: {
        category?: GameCategory;
        platform?: Platform;
        status?: string;
    }): Game[];
    isSupportedOn(gameId: string, platform: Platform): boolean;
}
//# sourceMappingURL=registry.d.ts.map