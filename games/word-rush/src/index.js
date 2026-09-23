"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordRushGameModule = void 0;
class WordRushGameModule {
    id = 'game_word_001';
    context;
    status = 'idle';
    startTime = 0;
    score = 0;
    foundWords = [];
    longestWord = '';
    bonusPoints = 0;
    invalidAttempts = 0;
    gridLetters = ['S', 'A', 'G', 'E', 'G', 'A', 'M', 'E', 'R', 'U', 'S', 'H', 'W', 'O', 'R', 'D'];
    async initialize(context) {
        this.context = context;
        this.foundWords = [];
        this.longestWord = '';
        this.score = 0;
        this.bonusPoints = 0;
        this.invalidAttempts = 0;
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
        if (action.type === 'SUBMIT_WORD') {
            const word = String(action.payload).toUpperCase().trim();
            if (word.length >= 3 && !this.foundWords.includes(word)) {
                this.foundWords.push(word);
                const wordScore = word.length * 50;
                this.score += wordScore;
                if (word.length > this.longestWord.length) {
                    this.longestWord = word;
                    this.bonusPoints += 100;
                    this.score += 100;
                }
                this.context?.onEvent({
                    type: 'game_score_updated',
                    sessionId: this.context.sessionId,
                    gameId: this.id,
                    timestamp: new Date().toISOString(),
                    currentScore: this.score,
                    delta: wordScore,
                });
            }
            else {
                this.invalidAttempts += 1;
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
                foundWords: this.foundWords,
                currentInput: '',
                gridLetters: this.gridLetters,
            },
        };
    }
    async complete() {
        this.status = 'ended';
        const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        const wordResult = {
            wordsFound: this.foundWords.length,
            longestWord: this.longestWord,
            bonusPoints: this.bonusPoints,
            invalidAttempts: this.invalidAttempts,
        };
        return {
            sessionId: this.context?.sessionId || '',
            gameId: this.id,
            externalUserId: this.context?.externalUserId || '',
            score: this.score,
            duration,
            completedAt: new Date().toISOString(),
            data: wordResult,
        };
    }
    async destroy() {
        this.status = 'ended';
    }
}
exports.WordRushGameModule = WordRushGameModule;
//# sourceMappingURL=index.js.map