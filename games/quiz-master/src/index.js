"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizMasterGameModule = void 0;
class QuizMasterGameModule {
    id = 'game_quiz_001';
    context;
    status = 'idle';
    startTime = 0;
    currentScore = 0;
    questions = [];
    currentIndex = 0;
    correctAnswers = 0;
    userAnswers = [];
    questionStartTimes = [];
    timePerQuestionMs = [];
    async initialize(context) {
        this.context = context;
        const count = context.config?.questionCount || 5;
        // Generate sample questions
        this.questions = Array.from({ length: count }, (_, i) => ({
            id: `q_${i + 1}`,
            question: `Sample Question ${i + 1}: What is ${i + 1} + ${i + 2}?`,
            options: [`${2 * i + 1}`, `${2 * i + 3}`, `${2 * i + 5}`, `${2 * i + 7}`],
            correctIndex: 1,
        }));
        this.currentIndex = 0;
        this.correctAnswers = 0;
        this.userAnswers = [];
        this.timePerQuestionMs = [];
        this.status = 'idle';
    }
    async start() {
        this.status = 'running';
        this.startTime = Date.now();
        this.questionStartTimes[this.currentIndex] = Date.now();
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
        if (action.type === 'ANSWER_QUESTION') {
            const selectedIndex = Number(action.payload);
            this.userAnswers[this.currentIndex] = selectedIndex;
            const qStart = this.questionStartTimes[this.currentIndex] || Date.now();
            const elapsedMs = Date.now() - qStart;
            this.timePerQuestionMs.push(elapsedMs);
            const currentQ = this.questions[this.currentIndex];
            if (currentQ && selectedIndex === currentQ.correctIndex) {
                this.correctAnswers += 1;
                this.currentScore += 100;
                this.context?.onEvent({
                    type: 'game_score_updated',
                    sessionId: this.context.sessionId,
                    gameId: this.id,
                    timestamp: new Date().toISOString(),
                    currentScore: this.currentScore,
                    delta: 100,
                });
            }
            this.currentIndex += 1;
            if (this.currentIndex < this.questions.length) {
                this.questionStartTimes[this.currentIndex] = Date.now();
            }
            else {
                this.status = 'ended';
            }
        }
    }
    getState() {
        const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        return {
            sessionId: this.context?.sessionId || '',
            status: this.status,
            currentScore: this.currentScore,
            elapsedSeconds,
            data: {
                questions: this.questions,
                currentIndex: this.currentIndex,
                correctAnswers: this.correctAnswers,
                userAnswers: this.userAnswers,
                timePerQuestionMs: this.timePerQuestionMs,
            },
        };
    }
    async complete() {
        this.status = 'ended';
        const totalQuestions = this.questions.length;
        const accuracy = totalQuestions > 0 ? (this.correctAnswers / totalQuestions) * 100 : 0;
        const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
        const quizResult = {
            correctAnswers: this.correctAnswers,
            totalQuestions,
            accuracy,
            timePerQuestionMs: this.timePerQuestionMs,
        };
        return {
            sessionId: this.context?.sessionId || '',
            gameId: this.id,
            externalUserId: this.context?.externalUserId || '',
            score: this.currentScore,
            duration,
            completedAt: new Date().toISOString(),
            data: quizResult,
        };
    }
    async destroy() {
        this.status = 'ended';
    }
}
exports.QuizMasterGameModule = QuizMasterGameModule;
//# sourceMappingURL=index.js.map