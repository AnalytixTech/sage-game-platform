"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGameResult = useGameResult;
const react_1 = require("react");
function useGameResult() {
    const [result, setResult] = (0, react_1.useState)(null);
    return { result, setResult };
}
//# sourceMappingURL=useGameResult.js.map