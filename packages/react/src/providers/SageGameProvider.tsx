import React, { createContext, useContext, useMemo } from 'react';
import { SageGameClient } from '@sagegames/core';
import { GameModule } from '@sagegames/types';

export interface SageGameContextValue {
  client: SageGameClient;
  sessionToken?: string;
  baseUrl?: string;
  registeredModules: Map<string, GameModule<any, any, any, any>>;
  registerGameModule: (module: GameModule<any, any, any, any>) => void;
}

const SageGameContext = createContext<SageGameContextValue | null>(null);

export interface SageGameProviderProps {
  children: React.ReactNode;
  sessionToken?: string;
  baseUrl?: string;
  modules?: GameModule<any, any, any, any>[];
}

export const SageGameProvider: React.FC<SageGameProviderProps> = ({
  children,
  sessionToken,
  baseUrl = 'https://api.sagegame.com',
  modules = [],
}) => {
  const registeredModules = useMemo(() => {
    const map = new Map<string, GameModule<any, any, any, any>>();
    modules.forEach((mod) => map.set(mod.id, mod));
    return map;
  }, [modules]);

  const client = useMemo(() => {
    return new SageGameClient({ baseUrl, sessionToken });
  }, [baseUrl, sessionToken]);

  const registerGameModule = (module: GameModule<any, any, any, any>) => {
    registeredModules.set(module.id, module);
  };

  const value: SageGameContextValue = {
    client,
    sessionToken,
    baseUrl,
    registeredModules,
    registerGameModule,
  };

  return <SageGameContext.Provider value={value}>{children}</SageGameContext.Provider>;
};

export const useSageGameContext = (): SageGameContextValue => {
  const context = useContext(SageGameContext);
  if (!context) {
    throw new Error('useSageGameContext must be used within a <SageGameProvider>');
  }
  return context;
};
