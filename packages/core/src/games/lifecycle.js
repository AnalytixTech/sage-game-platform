"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLifecycleManager = void 0;
const emitter_1 = require("../events/emitter");
class GameLifecycleManager {
    module;
    state = 'uninitialized';
    eventEmitter;
    constructor(module) {
        this.module = module;
        this.eventEmitter = new emitter_1.TypedEventEmitter();
    }
    get currentLifecycleState() {
        return this.state;
    }
    async initialize(context) {
        if (this.state !== 'uninitialized') {
            throw new Error(`Cannot initialize game from state: ${this.state}`);
        }
        const wrappedContext = {
            ...context,
            onEvent: (event) => {
                this.eventEmitter.emit(event);
                if (context.onEvent) {
                    context.onEvent(event);
                }
            },
        };
        await this.module.initialize(wrappedContext);
        this.state = 'initialized';
    }
    async start() {
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
    async pause() {
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
    async resume() {
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
    async submitAction(action) {
        if (this.state !== 'started') {
            throw new Error(`Cannot submit action when game is in state: ${this.state}`);
        }
        await this.module.submitAction(action);
    }
    getGameState() {
        return this.module.getState();
    }
    async complete() {
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
    async destroy() {
        await this.module.destroy();
        this.state = 'destroyed';
        this.eventEmitter.removeAllListeners();
    }
}
exports.GameLifecycleManager = GameLifecycleManager;
//# sourceMappingURL=lifecycle.js.map