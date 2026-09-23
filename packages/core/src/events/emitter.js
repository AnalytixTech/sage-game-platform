"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedEventEmitter = void 0;
class TypedEventEmitter {
    listeners = new Map();
    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        const targetSet = this.listeners.get(type);
        targetSet.add(callback);
        // Return unsubscribe function
        return () => {
            targetSet.delete(callback);
        };
    }
    off(type, callback) {
        const targetSet = this.listeners.get(type);
        if (targetSet) {
            targetSet.delete(callback);
        }
    }
    emit(event) {
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
    removeAllListeners() {
        this.listeners.clear();
    }
}
exports.TypedEventEmitter = TypedEventEmitter;
//# sourceMappingURL=emitter.js.map