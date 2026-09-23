import { GameAction, GameContext, GameModule, GameResult, GameState } from '@sagegame/types';
import { TypedEventEmitter } from '../events/emitter';
export type LifecycleState = 'uninitialized' | 'initialized' | 'started' | 'paused' | 'completed' | 'destroyed';
export declare class GameLifecycleManager<TConfig = Record<string, unknown>, TAction extends GameAction = GameAction, TState extends GameState = GameState, TResult extends GameResult = GameResult> {
    private module;
    private state;
    readonly eventEmitter: TypedEventEmitter;
    constructor(module: GameModule<TConfig, TAction, TState, TResult>);
    get currentLifecycleState(): LifecycleState;
    initialize(context: GameContext<TConfig>): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    submitAction(action: TAction): Promise<void>;
    getGameState(): TState;
    complete(): Promise<TResult>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=lifecycle.d.ts.map