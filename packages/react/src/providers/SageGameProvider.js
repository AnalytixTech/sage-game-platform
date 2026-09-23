"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSageGameContext = exports.SageGameProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const core_1 = require("@sagegame/core");
const SageGameContext = (0, react_1.createContext)(null);
const SageGameProvider = ({ children, sessionToken, baseUrl = 'https://api.sagegame.com', modules = [], }) => {
    const registeredModules = (0, react_1.useMemo)(() => {
        const map = new Map();
        modules.forEach((mod) => map.set(mod.id, mod));
        return map;
    }, [modules]);
    const client = (0, react_1.useMemo)(() => {
        return new core_1.SageGameClient({ baseUrl, sessionToken });
    }, [baseUrl, sessionToken]);
    const registerGameModule = (module) => {
        registeredModules.set(module.id, module);
    };
    const value = {
        client,
        sessionToken,
        baseUrl,
        registeredModules,
        registerGameModule,
    };
    return (0, jsx_runtime_1.jsx)(SageGameContext.Provider, { value: value, children: children });
};
exports.SageGameProvider = SageGameProvider;
const useSageGameContext = () => {
    const context = (0, react_1.useContext)(SageGameContext);
    if (!context) {
        throw new Error('useSageGameContext must be used within a <SageGameProvider>');
    }
    return context;
};
exports.useSageGameContext = useSageGameContext;
//# sourceMappingURL=SageGameProvider.js.map