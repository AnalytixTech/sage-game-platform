"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryMatchGameModule = void 0;
class MemoryMatchGameModule {
    id = 'game_memory_001';
    context;
    status = 'idle';
    startTime = 0;
    score = 0;
    moves = 0;
    matchedPairs = 0;
    flawlessMatches = 0;
    cards = [];
    flippedIndices = [];
    async initialize(context) {
        this.context = context;
        const pairCount = context.config?.pairCount || 4;
        const icons = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐯', '🦁', '🐮'];
        const values = icons.slice(0, pairCount);
        const deck = [...values, ...values].sort(() => Math.random() - 0.5);
        this.cards = deck.map((val, idx) => ({
            id: idx,
            val,
            isFlipped: false,
            isMatched: false,
        }));
        this.moves = 0;
        this.matchedPairs = 0;
        this.flawlessMatches = 0;
        this.score = 0;
        this.status = 'idle';
    }
    async start() {
        this.status = 'running';
        this.startTime = Date.now();
    }
    async pause() {
        this.status = 'paused';
    }
    async resume() {
        this.status = 'running';
    }
    async submitAction(action) {
        if (this.status !== 'running')
            return;
        if (action.type === 'FLIP_CARD') {
            const cardIdx = Number(action.payload);
            const card = this.cards[cardIdx];
            if (!card || card.isFlipped || card.isMatched || this.flippedIndices.length >= 2) {
                return;
            }
            card.isFlipped = true;
            this.flippedIndices.push(cardIdx);
            if (this.flippedIndices.length === 2) {
                this.moves += 1;
                const [idx1, idx2] = this.flippedIndices;
                const card1 = this.cards[idx1];
                const card2 = this.cards[idx2];
                if (card1.val === card2.val) {
                    card1.isMatched = true;
                    card2.isMatched = true;
                    this.matchedPairs += 1;
                    this.score += 250;
                    if (this.moves === this.matchedPairs) {
                        this.flawlessMatches += 1;
                    }
                    this.context?.onEvent({
                        type: 'game_score_updated',
                        sessionId: this.context.sessionId,
                        gameId: this.id,
                        timestamp: new Date().toISOString(),
                        currentScore: this.score,
                        delta: 250,
                    });
                    if (this.matchedPairs === this.cards.length / 2) {
                        this.status = 'ended';
                    }
                }
                else {
                    // Unflip after delay simulation
                    card1.isFlipped = false;
                    card2.isFlipped = false;
                }
                this.flippedIndices = [];
            }
        }
    }
    getState() {
        const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        return {
            sessionId: this.context?.sessionId || '',
            status: this.status,
            currentScore: this.score,
            elapsedSeconds,
            data: {
                cards: this.cards,
                moves: this.moves,
                matchedPairs: this.matchedPairs,
            },
        };
    }
    async complete() {
        this.status = 'ended';
        const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        const memoryResult = {
            totalMoves: this.moves,
            matchedPairs: this.matchedPairs,
            flawlessMatches: this.flawlessMatches,
        };
        return {
            sessionId: this.context?.sessionId || '',
            gameId: this.id,
            externalUserId: this.context?.externalUserId || '',
            score: this.score,
            duration,
            completedAt: new Date().toISOString(),
            data: memoryResult,
        };
    }
    async destroy() {
        this.status = 'ended';
    }
}
exports.MemoryMatchGameModule = MemoryMatchGameModule;
//# sourceMappingURL=index.js.map