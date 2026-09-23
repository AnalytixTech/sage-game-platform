"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLauncher = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const core_1 = require("@sagegame/core");
const SageGameProvider_1 = require("../providers/SageGameProvider");
const GameLauncher = ({ gameId, sessionToken: overrideToken, config = {}, onComplete, onError, onEvent, }) => {
    const { client, sessionToken: contextToken, registeredModules } = (0, SageGameProvider_1.useSageGameContext)();
    const effectiveToken = overrideToken || contextToken;
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [errorState, setErrorState] = (0, react_1.useState)(null);
    const [currentGameState, setCurrentGameState] = (0, react_1.useState)(null);
    const managerRef = (0, react_1.useRef)(null);
    const containerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        let isMounted = true;
        async function initAndStartGame() {
            if (!effectiveToken) {
                const err = new Error('Missing session token for GameLauncher');
                setErrorState(err.message);
                onError?.(err);
                setLoading(false);
                return;
            }
            const module = registeredModules.get(gameId);
            if (!module) {
                const err = new Error(`Game module '${gameId}' is not registered in SageGameProvider`);
                setErrorState(err.message);
                onError?.(err);
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                client.setSessionToken(effectiveToken);
                const manager = new core_1.GameLifecycleManager(module);
                managerRef.current = manager;
                manager.eventEmitter.on('all', (evt) => {
                    onEvent?.(evt);
                    if (evt.type === 'game_completed' && onComplete) {
                        onComplete(evt.result);
                    }
                });
                await manager.initialize({
                    sessionId: `sess_${Date.now()}`,
                    gameId,
                    externalUserId: 'user_active',
                    platform: 'web',
                    config,
                    sessionToken: effectiveToken,
                    onEvent: (evt) => manager.eventEmitter.emit(evt),
                });
                await manager.start();
                if (isMounted) {
                    setCurrentGameState(manager.getGameState());
                    setLoading(false);
                }
            }
            catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                if (isMounted) {
                    setErrorState(e.message);
                    onError?.(e);
                    setLoading(false);
                }
            }
        }
        initAndStartGame();
        return () => {
            isMounted = false;
            if (managerRef.current) {
                managerRef.current.destroy();
            }
        };
    }, [gameId, effectiveToken]);
    const handleAction = async (actionType, payload) => {
        if (!managerRef.current)
            return;
        const action = {
            type: actionType,
            payload,
            timestamp: Date.now(),
        };
        await managerRef.current.submitAction(action);
        setCurrentGameState({ ...managerRef.current.getGameState() });
    };
    const handleFinish = async () => {
        if (!managerRef.current)
            return;
        const result = await managerRef.current.complete();
        onComplete?.(result);
    };
    if (loading) {
        return (0, jsx_runtime_1.jsxs)("div", { style: { padding: '24px', textAlign: 'center' }, children: ["Initializing ", gameId, "..."] });
    }
    if (errorState) {
        return ((0, jsx_runtime_1.jsxs)("div", { style: { padding: '24px', color: '#dc2626', background: '#fef2f2', borderRadius: '8px' }, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Game Launcher Error:" }), " ", errorState] }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { ref: containerRef, style: {
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            background: '#ffffff',
        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }, children: [(0, jsx_runtime_1.jsxs)("h3", { children: ["Game Engine: ", gameId] }), (0, jsx_runtime_1.jsxs)("div", { children: ["Score: ", currentGameState?.currentScore ?? 0] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }, children: [(0, jsx_runtime_1.jsx)("p", { children: "Active Session State:" }), (0, jsx_runtime_1.jsx)("pre", { style: { fontSize: '12px' }, children: JSON.stringify(currentGameState?.data, null, 2) })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '8px' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleAction('INTERACT', { timestamp: Date.now() }), style: {
                            padding: '8px 16px',
                            background: '#4f46e5',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }, children: "Submit Action" }), (0, jsx_runtime_1.jsx)("button", { onClick: handleFinish, style: {
                            padding: '8px 16px',
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }, children: "Complete Game" })] })] }));
};
exports.GameLauncher = GameLauncher;
//# sourceMappingURL=GameLauncher.js.map