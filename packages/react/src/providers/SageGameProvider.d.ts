import React from 'react';
import { SageGameClient } from '@sagegame/core';
import { GameModule } from '@sagegame/types';
export interface SageGameContextValue {
    client: SageGameClient;
    sessionToken?: string;
    baseUrl?: string;
    registeredModules: Map<string, GameModule<any, any, any, any>>;
    registerGameModule: (module: GameModule<any, any, any, any>) => void;
}
export interface SageGameProviderProps {
    children: React.ReactNode;
    sessionToken?: string;
    baseUrl?: string;
    modules?: GameModule<any, any, any, any>[];
}
export declare const SageGameProvider: React.FC<SageGameProviderProps>;
export declare const useSageGameContext: () => SageGameContextValue;
//# sourceMappingURL=SageGameProvider.d.ts.map