import {
  GameAction,
  GameContext,
  GameEvent,
  GameModule,
  GameResult,
  GameState,
} from '@sagegames/types';
import { TypedEventEmitter } from '../events/emitter';

export type LifecycleState = 'uninitialized' | 'initialized' | 'started' | 'paused' | 'completed' | 'destroyed';

export class GameLifecycleManager<
  TConfig = Record<string, unknown>,
  TAction extends GameAction = GameAction,
  TState extends GameState = GameState,
  TResult extends GameResult = GameResult
> {
  private module: GameModule<TConfig, TAction, TState, TResult>;
  private state: LifecycleState = 'uninitialized';
  public readonly eventEmitter: TypedEventEmitter;

  constructor(module: GameModule<TConfig, TAction, TState, TResult>) {
    this.module = module;
    this.eventEmitter = new TypedEventEmitter();
  }

  public get currentLifecycleState(): LifecycleState {
    return this.state;
  }

  public async initialize(context: GameContext<TConfig>): Promise<void> {
    if (this.state !== 'uninitialized') {
      throw new Error(`Cannot initialize game from state: ${this.state}`);
    }

    const wrappedContext: GameContext<TConfig> = {
      ...context,
      onEvent: (event: GameEvent) => {
        this.eventEmitter.emit(event);
        if (context.onEvent) {
          context.onEvent(event);
        }
      },
    };

    await this.module.initialize(wrappedContext);
    this.state = 'initialized';
  }

  public async start(): Promise<void> {
    if (this.state !== 'initialized' && this.state !== 'paused') {
      throw new Error(`Cannot start game from state: ${this.state}`);
    }
    await this.module.start();
    this.state = 'started';
    this.eventEmitter.emit({
      type: 'game_started',
      sessionId: this.module.id,
      gameId: this.module.id,
      timestamp: new Date().toISOString(),
    });
  }

  public async pause(): Promise<void> {
    if (this.state !== 'started') {
      throw new Error(`Cannot pause game when not started. Current state: ${this.state}`);
    }
    await this.module.pause();
    this.state = 'paused';
    this.eventEmitter.emit({
      type: 'game_paused',
      sessionId: this.module.id,
      gameId: this.module.id,
      timestamp: new Date().toISOString(),
    });
  }

  public async resume(): Promise<void> {
    if (this.state !== 'paused') {
      throw new Error(`Cannot resume game when not paused. Current state: ${this.state}`);
    }
    await this.module.resume();
    this.state = 'started';
    this.eventEmitter.emit({
      type: 'game_resumed',
      sessionId: this.module.id,
      gameId: this.module.id,
      timestamp: new Date().toISOString(),
    });
  }

  public async submitAction(action: TAction): Promise<void> {
    if (this.state !== 'started') {
      throw new Error(`Cannot submit action when game is in state: ${this.state}`);
    }
    await this.module.submitAction(action);
  }

  public getGameState(): TState {
    return this.module.getState();
  }

  public async complete(): Promise<TResult> {
    if (this.state !== 'started' && this.state !== 'paused') {
      throw new Error(`Cannot complete game from state: ${this.state}`);
    }
    const result = await this.module.complete();
    this.state = 'completed';
    this.eventEmitter.emit({
      type: 'game_completed',
      sessionId: this.module.id,
      gameId: this.module.id,
      timestamp: new Date().toISOString(),
      result,
    });
    return result;
  }

  public async destroy(): Promise<void> {
    await this.module.destroy();
    this.state = 'destroyed';
    this.eventEmitter.removeAllListeners();
  }
}
