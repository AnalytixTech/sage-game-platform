"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGameSession = useGameSession;
const react_1 = require("react");
const SageGameProvider_1 = require("../providers/SageGameProvider");
function useGameSession(sessionId) {
    const { client } = (0, SageGameProvider_1.useSageGameContext)();
    const [session, setSession] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(!!sessionId);
    const [error, setError] = (0, react_1.useState)(null);
    const fetchSession = (0, react_1.useCallback)(async () => {
        if (!sessionId)
            return;
        setLoading(true);
        setError(null);
        try {
            const data = await client.sessions.get(sessionId);
            setSession(data);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    }, [client, sessionId]);
    (0, react_1.useEffect)(() => {
        if (sessionId) {
            fetchSession();
        }
    }, [fetchSession, sessionId]);
    return { session, loading, error, refetch: fetchSession };
}
//# sourceMappingURL=useGameSession.js.map