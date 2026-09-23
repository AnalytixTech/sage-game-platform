"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGames = useGames;
const react_1 = require("react");
const SageGameProvider_1 = require("../providers/SageGameProvider");
function useGames(options = {}) {
    const { client } = (0, SageGameProvider_1.useSageGameContext)();
    const [games, setGames] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(options.autoFetch !== false);
    const [error, setError] = (0, react_1.useState)(null);
    const fetchGames = (0, react_1.useCallback)(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await client.games.list({
                category: options.category,
                search: options.search,
            });
            setGames(data);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    }, [client, options.category, options.search]);
    (0, react_1.useEffect)(() => {
        if (options.autoFetch !== false) {
            fetchGames();
        }
    }, [fetchGames, options.autoFetch]);
    return { games, loading, error, refetch: fetchGames };
}
//# sourceMappingURL=useGames.js.map