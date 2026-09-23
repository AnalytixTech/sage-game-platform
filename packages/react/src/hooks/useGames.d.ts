import { GameCategory } from '@sagegame/types';
export interface UseGamesOptions {
    category?: GameCategory;
    search?: string;
    autoFetch?: boolean;
}
export declare function useGames(options?: UseGamesOptions): {
    games: Game[];
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
};
//# sourceMappingURL=useGames.d.ts.map