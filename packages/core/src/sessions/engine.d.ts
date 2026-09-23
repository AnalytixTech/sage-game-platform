import { GameSession } from '@sagegame/types';
import { SageGameClient } from '../api/client';
export interface SessionEngineOptions {
    client: SageGameClient;
    sessionToken: string;
    heartbeatIntervalMs?: number;
}
export declare class SessionEngine {
    private client;
    private sessionToken;
    private sessionData?;
    private heartbeatTimer?;
    private heartbeatIntervalMs;
    constructor(options: SessionEngineOptions);
    startSession(sessionId: string): Promise<GameSession>;
    get session(): GameSession | undefined;
    isExpired(): boolean;
    private startHeartbeat;
    stopHeartbeat(): void;
    destroy(): void;
}
//# sourceMappingURL=engine.d.ts.map