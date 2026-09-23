"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_2 = require("@sagegame/react");
const game_quiz_master_1 = require("@sagegame/game-quiz-master");
const game_word_rush_1 = require("@sagegame/game-word-rush");
const game_memory_match_1 = require("@sagegame/game-memory-match");
const quizModule = new game_quiz_master_1.QuizMasterGameModule();
const wordModule = new game_word_rush_1.WordRushGameModule();
const memoryModule = new game_memory_match_1.MemoryMatchGameModule();
function App() {
    const [token, setToken] = (0, react_1.useState)('stk_demo_web_token_123');
    const [selectedGame, setSelectedGame] = (0, react_1.useState)(null);
    const [lastResult, setLastResult] = (0, react_1.useState)(null);
    const handleSelectGame = async (game) => {
        setSelectedGame(game);
        setLastResult(null);
    };
    const handleComplete = (result) => {
        console.log('Game completed!', result);
        setLastResult(result);
    };
    return ((0, jsx_runtime_1.jsx)(react_2.SageGameProvider, { baseUrl: "http://localhost:4000", sessionToken: token, modules: [quizModule, wordModule, memoryModule], children: (0, jsx_runtime_1.jsxs)("div", { style: { maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', padding: '24px' }, children: [(0, jsx_runtime_1.jsxs)("header", { style: { borderBottom: '2px solid #eee', paddingBottom: '16px', marginBottom: '24px' }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { margin: 0, color: '#1e1b4b' }, children: "CampusApp \u2014 SageGame Integration" }), (0, jsx_runtime_1.jsxs)("p", { style: { color: '#6b7280' }, children: ["Host Application: ", (0, jsx_runtime_1.jsx)("strong", { children: "CampusApp" }), " | User: ", (0, jsx_runtime_1.jsx)("strong", { children: "John Doe (user_123)" })] })] }), !selectedGame ? ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { children: "Select a Game" }), (0, jsx_runtime_1.jsx)(react_2.GameCatalog, { onSelectGame: handleSelectGame })] })) : ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedGame(null), style: {
                                marginBottom: '16px',
                                padding: '8px 16px',
                                background: '#f3f4f6',
                                border: '1px solid #ccc',
                                borderRadius: '6px',
                                cursor: 'pointer',
                            }, children: "\u2190 Back to Game Catalog" }), (0, jsx_runtime_1.jsxs)("h2", { children: ["Playing: ", selectedGame.name] }), (0, jsx_runtime_1.jsx)(react_2.Game, { gameId: selectedGame.id, onComplete: handleComplete }), lastResult && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                marginTop: '24px',
                                padding: '20px',
                                background: '#ecfdf5',
                                border: '1px solid #10b981',
                                borderRadius: '8px',
                            }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { margin: '0 0 12px', color: '#065f46' }, children: "\uD83C\uDF89 Session Completed!" }), (0, jsx_runtime_1.jsxs)("p", { children: ["Final Score: ", (0, jsx_runtime_1.jsx)("strong", { children: lastResult.score })] }), (0, jsx_runtime_1.jsxs)("p", { children: ["Duration: ", (0, jsx_runtime_1.jsxs)("strong", { children: [lastResult.duration, " seconds"] })] }), (0, jsx_runtime_1.jsx)("pre", { style: { background: '#fff', padding: '12px', borderRadius: '4px', fontSize: '12px' }, children: JSON.stringify(lastResult.data, null, 2) })] }))] }))] }) }));
}
//# sourceMappingURL=App.js.map