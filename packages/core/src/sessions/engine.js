"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionEngine = void 0;
class SessionEngine {
    client;
    sessionToken;
    sessionData;
    heartbeatTimer;
    heartbeatIntervalMs;
    constructor(options) {
        this.client = options.client;
        this.sessionToken = options.sessionToken;
        this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30000;
    }
    async startSession(sessionId) {
        this.client.setSessionToken(this.sessionToken);
        const session = await this.client.sessions.get(sessionId);
        this.sessionData = session;
        this.startHeartbeat();
        return session;
    }
    get session() {
        return this.sessionData;
    }
    isExpired() {
        if (!this.sessionData?.expiresAt)
            return false;
        return new Date(this.sessionData.expiresAt).getTime() <= Date.now();
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.isExpired()) {
                this.stopHeartbeat();
                if (this.sessionData) {
                    this.sessionData.status = 'expired';
                }
            }
        }, this.heartbeatIntervalMs);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    destroy() {
        this.stopHeartbeat();
    }
}
exports.SessionEngine = SessionEngine;
//# sourceMappingURL=engine.js.map