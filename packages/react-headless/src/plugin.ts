import { ComponentType } from 'react';
import { AnyGameRules } from '@sagegames/types';
import { SageLabels } from './labels';
import { SageTheme } from './theme';

/** Props every game view receives from a launcher. */
export interface GameViewProps<TState = unknown> {
  state: TState;
  dispatch: (type: string, payload?: unknown) => void;
  /** Active play time in ms (pauses excluded). */
  elapsedMs: number;
  paused: boolean;
  ended: boolean;
  theme: SageTheme;
  labels: SageLabels;
}

/**
 * A game the SDK can render: its deterministic rules (shared with the server) plus a view.
 * The web and React Native packages each ship plugins with their own views for the same rules.
 */
export interface GamePlugin {
  rules: AnyGameRules;
  title: string;
  /** One or two sentences shown on the intro card. */
  instructions: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  View: ComponentType<GameViewProps<any>>;
}

export function definePlugin<TState>(plugin: {
  rules: AnyGameRules;
  title: string;
  instructions: string;
  View: ComponentType<GameViewProps<TState>>;
}): GamePlugin {
  return plugin as GamePlugin;
}
