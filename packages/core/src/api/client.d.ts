import { Game, GameCategory, GameResult, GameSession, Leaderboard, LeaderboardQuery, PlayerStats } from '@sagegame/types';
export interface SageGameClientOptions {
    baseUrl?: string;
    sessionToken?: string;
}
export interface GameListFilter {
    category?: GameCategory;
    search?: string;
}
export declare class SageGameClient {
    private baseUrl;
    private sessionToken?;
    constructor(options?: SageGameClientOptions);
    setSessionToken(token: string): void;
    getSessionToken(): string | undefined;
    private request;
    games: {
        list: (filter?: GameListFilter) => Promise<Game[]>;
        get: (gameId: string) => Promise<Game>;
    };
    sessions: {
        get: (sessionId: string) => Promise<GameSession>;
        start: (sessionId: string) => Promise<GameSession>;
        pause: (sessionId: string) => Promise<GameSession>;
        resume: (sessionId: string) => Promise<GameSession>;
        complete: <T = Record<string, unknown>>(sessionId: string, resultData: {
            score: number;
            duration: number;
            data?: T;
        }) => Promise<GameResult<T>>;
        submitEvent: (sessionId: string, event: unknown) => Promise<{
            success: boolean;
        }>;
    };
    leaderboards: {
        get: (query?: LeaderboardQuery) => Promise<Leaderboard>;
    };
    stats: {
        get: (externalUserId: string) => Promise<PlayerStats>;
    };
}
//# sourceMappingURL=client.d.ts.map