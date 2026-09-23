import { GameSession, GameSessionStatus } from '@sagegame/types';
import { SageGameClient } from '../api/client';

export interface SessionEngineOptions {
  client: SageGameClient;
  sessionToken: string;
  heartbeatIntervalMs?: number;
}

export class SessionEngine {
  private client: SageGameClient;
  private sessionToken: string;
  private sessionData?: GameSession;
  private heartbeatTimer?: any;
  private heartbeatIntervalMs: number;

  constructor(options: SessionEngineOptions) {
    this.client = options.client;
    this.sessionToken = options.sessionToken;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30000;
  }

  public async startSession(sessionId: string): Promise<GameSession> {
    this.client.setSessionToken(this.sessionToken);
    const session = await this.client.sessions.get(sessionId);
    this.sessionData = session;
    this.startHeartbeat();
    return session;
  }

  public get session(): GameSession | undefined {
    return this.sessionData;
  }

  public isExpired(): boolean {
    if (!this.sessionData?.expiresAt) return false;
    return new Date(this.sessionData.expiresAt).getTime() <= Date.now();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isExpired()) {
        this.stopHeartbeat();
        if (this.sessionData) {
          this.sessionData.status = 'expired' as GameSessionStatus;
        }
      }
    }, this.heartbeatIntervalMs);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  public destroy(): void {
    this.stopHeartbeat();
  }
}
