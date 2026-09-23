"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGameState = useGameState;
const react_1 = require("react");
function useGameState(initialState) {
    const [gameState, setGameState] = (0, react_1.useState)(initialState);
    return { gameState, setGameState };
}
//# sourceMappingURL=useGameState.js.map