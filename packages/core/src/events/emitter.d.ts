import { GameEvent, GameEventType } from '@sagegame/types';
export type EventCallback<T = GameEvent> = (event: T) => void;
export declare class TypedEventEmitter {
    private listeners;
    on<T extends GameEvent>(type: GameEventType | 'all', callback: EventCallback<T>): () => void;
    off<T extends GameEvent>(type: GameEventType | 'all', callback: EventCallback<T>): void;
    emit(event: GameEvent): void;
    removeAllListeners(): void;
}
//# sourceMappingURL=emitter.d.ts.map