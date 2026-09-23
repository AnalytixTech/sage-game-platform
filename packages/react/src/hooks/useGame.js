"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGame = useGame;
const react_1 = require("react");
const SageGameProvider_1 = require("../providers/SageGameProvider");
function useGame(gameId) {
    const { client } = (0, SageGameProvider_1.useSageGameContext)();
    const [game, setGame] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const fetchGame = (0, react_1.useCallback)(async () => {
        if (!gameId)
            return;
        setLoading(true);
        setError(null);
        try {
            const data = await client.games.get(gameId);
            setGame(data);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    }, [client, gameId]);
    (0, react_1.useEffect)(() => {
        fetchGame();
    }, [fetchGame]);
    return { game, loading, error, refetch: fetchGame };
}
//# sourceMappingURL=useGame.js.map