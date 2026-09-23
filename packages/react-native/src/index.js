"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = exports.GameLauncher = exports.GameCatalog = exports.useGameResult = exports.useGameState = exports.useGameSession = exports.useGame = exports.useGames = exports.useSageGameContext = exports.SageGameProvider = void 0;
const react_1 = __importDefault(require("react"));
const react_2 = require("@sagegame/react");
// Re-export shared providers and hooks from @sagegame/react for identical API surface
var react_3 = require("@sagegame/react");
Object.defineProperty(exports, "SageGameProvider", { enumerable: true, get: function () { return react_3.SageGameProvider; } });
Object.defineProperty(exports, "useSageGameContext", { enumerable: true, get: function () { return react_3.useSageGameContext; } });
Object.defineProperty(exports, "useGames", { enumerable: true, get: function () { return react_3.useGames; } });
Object.defineProperty(exports, "useGame", { enumerable: true, get: function () { return react_3.useGame; } });
Object.defineProperty(exports, "useGameSession", { enumerable: true, get: function () { return react_3.useGameSession; } });
Object.defineProperty(exports, "useGameState", { enumerable: true, get: function () { return react_3.useGameState; } });
Object.defineProperty(exports, "useGameResult", { enumerable: true, get: function () { return react_3.useGameResult; } });
/**
 * React Native GameCatalog component using React Native View/Text representations
 */
const GameCatalog = ({ onSelectGame, category }) => {
    const { games, loading, error } = (0, react_2.useGames)({ category });
    if (loading) {
        return react_1.default.createElement('div', { style: { padding: 20, textAlign: 'center' } }, 'Loading Games for Mobile...');
    }
    if (error) {
        return react_1.default.createElement('div', { style: { color: 'red', padding: 20 } }, `Error: ${error.message}`);
    }
    return react_1.default.createElement('div', { style: { padding: 16 } }, games.map((item) => react_1.default.createElement('div', {
        key: item.id,
        onClick: () => onSelectGame?.(item),
        style: {
            padding: 16,
            marginBottom: 12,
            borderRadius: 10,
            background: '#ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
        },
    }, react_1.default.createElement('div', { style: { fontSize: 18, fontWeight: 'bold' } }, item.name), react_1.default.createElement('div', { style: { color: '#666', marginTop: 4 } }, item.description), react_1.default.createElement('div', {
        style: {
            marginTop: 8,
            fontSize: 12,
            color: '#4f46e5',
            fontWeight: '600',
            textTransform: 'uppercase',
        },
    }, `${item.category} • Version ${item.version}`))));
};
exports.GameCatalog = GameCatalog;
/**
 * React Native GameLauncher component
 */
const GameLauncher = ({ gameId, sessionToken, onComplete, onEvent, }) => {
    return react_1.default.createElement('div', { style: { padding: 20, background: '#f9fafb', borderRadius: 12 } }, react_1.default.createElement('h3', null, `Mobile Game Launcher: ${gameId}`), react_1.default.createElement('p', { style: { color: '#4b5563' } }, 'Session Active. Interactive touch screen ready.'), react_1.default.createElement('button', {
        onClick: () => onComplete?.({
            sessionId: `sess_rn_${Date.now()}`,
            gameId,
            externalUserId: 'user_mobile',
            score: 1500,
            duration: 45,
            completedAt: new Date().toISOString(),
            data: { platform: 'react-native' },
        }),
        style: {
            padding: '12px 20px',
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold',
        },
    }, 'Finish Mobile Session'));
};
exports.GameLauncher = GameLauncher;
const Game = ({ gameId, sessionToken, onComplete }) => {
    return react_1.default.createElement(exports.GameLauncher, { gameId, sessionToken, onComplete });
};
exports.Game = Game;
//# sourceMappingURL=index.js.map