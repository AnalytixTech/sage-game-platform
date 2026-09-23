"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const GameLauncher_1 = require("./GameLauncher");
const Game = ({ gameId, sessionToken, config, onComplete, onError, onEvent, className, }) => {
    return ((0, jsx_runtime_1.jsx)("div", { className: className, children: (0, jsx_runtime_1.jsx)(GameLauncher_1.GameLauncher, { gameId: gameId, sessionToken: sessionToken, config: config, onComplete: onComplete, onError: onError, onEvent: onEvent }) }));
};
exports.Game = Game;
//# sourceMappingURL=Game.js.map