"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_native_1 = require("@sagegame/react-native");
function App() {
    const [sessionToken] = (0, react_1.useState)('stk_demo_mobile_token_456');
    const [selectedGame, setSelectedGame] = (0, react_1.useState)(null);
    return ((0, jsx_runtime_1.jsx)(react_native_1.SageGameProvider, { baseUrl: "http://localhost:4000", sessionToken: sessionToken, children: (0, jsx_runtime_1.jsxs)("div", { style: { padding: 16, fontFamily: 'sans-serif' }, children: [(0, jsx_runtime_1.jsx)("h2", { children: "FitnessApp Mobile Games" }), !selectedGame ? ((0, jsx_runtime_1.jsx)(react_native_1.GameCatalog, { onSelectGame: (game) => setSelectedGame(game) })) : ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedGame(null), style: {
                                marginBottom: 12,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: '1px solid #ccc',
                            }, children: "Back" }), (0, jsx_runtime_1.jsx)(react_native_1.Game, { gameId: selectedGame.id, sessionToken: sessionToken, onComplete: (res) => {
                                alert(`Mobile Game Complete! Score: ${res.score}`);
                                setSelectedGame(null);
                            } })] }))] }) }));
}
//# sourceMappingURL=App.js.map