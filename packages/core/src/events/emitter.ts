import { GameEvent, GameEventType } from '@sagegames/types';

export type EventCallback<T = GameEvent> = (event: T) => void;

export class TypedEventEmitter {
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  public on<T extends GameEvent>(type: GameEventType | 'all', callback: EventCallback<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const targetSet = this.listeners.get(type)!;
    targetSet.add(callback);

    // Return unsubscribe function
    return () => {
      targetSet.delete(callback);
    };
  }

  public off<T extends GameEvent>(type: GameEventType | 'all', callback: EventCallback<T>): void {
    const targetSet = this.listeners.get(type);
    if (targetSet) {
      targetSet.delete(callback);
    }
  }

  public emit(event: GameEvent): void {
    // Specific event listeners
    const specificListeners = this.listeners.get(event.type);
    if (specificListeners) {
      specificListeners.forEach((cb) => cb(event));
    }

    // Catch-all listeners
    const allListeners = this.listeners.get('all');
    if (allListeners) {
      allListeners.forEach((cb) => cb(event));
    }
  }

  public removeAllListeners(): void {
    this.listeners.clear();
  }
}
