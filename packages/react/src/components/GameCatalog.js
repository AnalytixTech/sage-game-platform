"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameCatalog = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const useGames_1 = require("../hooks/useGames");
const GameCatalog = ({ onSelectGame, renderGameCard, categoryFilter, className, }) => {
    const [selectedCategory, setSelectedCategory] = (0, react_1.useState)(categoryFilter);
    const { games, loading, error } = (0, useGames_1.useGames)({ category: selectedCategory });
    const categories = [
        'quiz',
        'trivia',
        'word',
        'puzzle',
        'memory',
        'multiplayer',
        'arcade',
    ];
    if (loading) {
        return (0, jsx_runtime_1.jsx)("div", { style: { padding: '20px', textAlign: 'center' }, children: "Loading SageGame catalog..." });
    }
    if (error) {
        return ((0, jsx_runtime_1.jsxs)("div", { style: { color: 'red', padding: '20px' }, children: ["Failed to load catalog: ", error.message] }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: className, style: { fontFamily: 'sans-serif', padding: '16px' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedCategory(undefined), style: {
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: 'none',
                            background: !selectedCategory ? '#4f46e5' : '#e0e7ff',
                            color: !selectedCategory ? '#fff' : '#3730a3',
                            cursor: 'pointer',
                        }, children: "All" }), categories.map((cat) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedCategory(cat), style: {
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: 'none',
                            background: selectedCategory === cat ? '#4f46e5' : '#e0e7ff',
                            color: selectedCategory === cat ? '#fff' : '#3730a3',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                        }, children: cat }, cat)))] }), (0, jsx_runtime_1.jsx)("div", { style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '16px',
                }, children: games.map((game) => {
                    const handleSelect = () => onSelectGame?.(game);
                    if (renderGameCard) {
                        return (0, jsx_runtime_1.jsx)(react_1.default.Fragment, { children: renderGameCard(game, handleSelect) }, game.id);
                    }
                    return ((0, jsx_runtime_1.jsxs)("div", { onClick: handleSelect, style: {
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            padding: '16px',
                            background: '#fff',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            transition: 'transform 0.15s ease',
                        }, children: [game.thumbnail && ((0, jsx_runtime_1.jsx)("img", { src: game.thumbnail, alt: game.name, style: { width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' } })), (0, jsx_runtime_1.jsx)("h3", { style: { margin: '12px 0 4px', fontSize: '18px' }, children: game.name }), (0, jsx_runtime_1.jsx)("p", { style: { margin: '0 0 12px', color: '#6b7280', fontSize: '14px' }, children: game.description || 'Interactive game powered by SageGame' }), (0, jsx_runtime_1.jsx)("div", { style: {
                                    display: 'inline-block',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    background: '#f3f4f6',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                }, children: game.category })] }, game.id));
                }) })] }));
};
exports.GameCatalog = GameCatalog;
//# sourceMappingURL=GameCatalog.js.map