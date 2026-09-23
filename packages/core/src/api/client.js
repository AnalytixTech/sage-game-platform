"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SageGameClient = void 0;
class SageGameClient {
    baseUrl;
    sessionToken;
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://api.sagegame.com';
        this.sessionToken = options.sessionToken;
    }
    setSessionToken(token) {
        this.sessionToken = token;
    }
    getSessionToken() {
        return this.sessionToken;
    }
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        if (this.sessionToken) {
            headers['Authorization'] = `Bearer ${this.sessionToken}`;
        }
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`SageGame API Error (${response.status}): ${errorText}`);
        }
        return response.json();
    }
    games = {
        list: async (filter) => {
            const params = new URLSearchParams();
            if (filter?.category)
                params.append('category', filter.category);
            if (filter?.search)
                params.append('search', filter.search);
            const queryStr = params.toString() ? `?${params.toString()}` : '';
            return this.request(`/v1/games${queryStr}`);
        },
        get: async (gameId) => {
            return this.request(`/v1/games/${encodeURIComponent(gameId)}`);
        },
    };
    sessions = {
        get: async (sessionId) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}`);
        },
        start: async (sessionId) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/start`, {
                method: 'POST',
            });
        },
        pause: async (sessionId) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/pause`, {
                method: 'POST',
            });
        },
        resume: async (sessionId) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/resume`, {
                method: 'POST',
            });
        },
        complete: async (sessionId, resultData) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/complete`, {
                method: 'POST',
                body: JSON.stringify(resultData),
            });
        },
        submitEvent: async (sessionId, event) => {
            return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
                method: 'POST',
                body: JSON.stringify(event),
            });
        },
    };
    leaderboards = {
        get: async (query = {}) => {
            const params = new URLSearchParams();
            if (query.gameId)
                params.append('gameId', query.gameId);
            if (query.tenantId)
                params.append('tenantId', query.tenantId);
            if (query.period)
                params.append('period', query.period);
            if (query.scope)
                params.append('scope', query.scope);
            if (query.limit)
                params.append('limit', query.limit.toString());
            if (query.offset)
                params.append('offset', query.offset.toString());
            const queryStr = params.toString() ? `?${params.toString()}` : '';
            const targetGameId = query.gameId ? encodeURIComponent(query.gameId) : 'global';
            return this.request(`/v1/games/${targetGameId}/leaderboard${queryStr}`);
        },
    };
    stats = {
        get: async (externalUserId) => {
            return this.request(`/v1/users/${encodeURIComponent(externalUserId)}/stats`);
        },
    };
}
exports.SageGameClient = SageGameClient;
//# sourceMappingURL=client.js.map