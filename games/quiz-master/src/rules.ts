import { GameRules, QuizGameResult, RulesAction } from '@sagegames/types';
import {
  asConfigRecord,
  ConfigError,
  createRng,
  isNonNegativeInt,
  isRecord,
  readEnum,
  readInt,
} from '@sagegames/engine';
import { BankQuestion, DEFAULT_QUESTION_BANK, QuizDifficulty } from './content/bank';

export const QUIZ_MASTER_GAME_ID = 'game_quiz_001';

const MAX_CUSTOM_QUESTIONS = 200;

export interface QuizCustomQuestion {
  id?: string;
  question: string;
  answer: string;
  /** 1 to 5 wrong answers. */
  wrong: string[];
  category?: string;
  difficulty?: QuizDifficulty;
}

export interface QuizRulesConfig {
  questionCount: number;
  difficulty: QuizDifficulty | 'mixed';
  /** Empty means all categories. */
  categories: string[];
  timePerQuestionSec: number;
  /** Host-supplied questions. When present they replace the default bank unless includeDefaultQuestions is true. */
  questions: QuizCustomQuestion[] | null;
  includeDefaultQuestions: boolean;
}

export interface QuizQuestionState {
  id: string;
  question: string;
  category: string;
  options: string[];
  correctIndex: number;
}

export interface QuizState {
  questions: QuizQuestionState[];
  index: number;
  /** Chosen option per question; null = timed out. */
  answers: (number | null)[];
  timePerQuestionMs: number[];
  questionStartedAt: number;
  limitMs: number;
  correctAnswers: number;
  streak: number;
  bestStreak: number;
  score: number;
  elapsedMs: number;
}

export type QuizAction = RulesAction<'ANSWER', { qIndex: number; choice: number }>;

function parseCustomQuestions(raw: unknown): QuizCustomQuestion[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new ConfigError('config.questions must be an array');
  if (raw.length > MAX_CUSTOM_QUESTIONS) throw new ConfigError(`config.questions allows at most ${MAX_CUSTOM_QUESTIONS} questions`);

  return raw.map((q, i) => {
    const where = `config.questions[${i}]`;
    if (!isRecord(q)) throw new ConfigError(`${where} must be an object`);
    const text = (v: unknown, field: string) => {
      if (typeof v !== 'string' || v.trim() === '') throw new ConfigError(`${where}.${field} must be a non-empty string`);
      return v.trim().slice(0, 300);
    };
    const question = text(q.question, 'question');
    const answer = text(q.answer, 'answer');
    if (!Array.isArray(q.wrong) || q.wrong.length < 1 || q.wrong.length > 5) {
      throw new ConfigError(`${where}.wrong must have 1 to 5 answers`);
    }
    const wrong = Array.from(new Set(q.wrong.map((w, j) => text(w, `wrong[${j}]`)))).filter((w) => w !== answer);
    if (wrong.length === 0) throw new ConfigError(`${where}.wrong must differ from the answer`);
    const difficulty = ['easy', 'medium', 'hard'].includes(q.difficulty as string) ? (q.difficulty as QuizDifficulty) : undefined;
    return {
      id: typeof q.id === 'string' ? q.id.slice(0, 64) : `custom_${i + 1}`,
      question,
      answer,
      wrong,
      category: typeof q.category === 'string' ? q.category.slice(0, 40) : 'custom',
      difficulty,
    };
  });
}

function buildPool(config: QuizRulesConfig): BankQuestion[] {
  const custom: BankQuestion[] = (config.questions ?? []).map((q) => ({
    id: q.id ?? '',
    category: q.category ?? 'custom',
    difficulty: q.difficulty ?? 'medium',
    question: q.question,
    answer: q.answer,
    wrong: q.wrong,
  }));

  if (config.questions && !config.includeDefaultQuestions) {
    return custom; // host questions are used as-is, without difficulty/category filters
  }

  const bank = DEFAULT_QUESTION_BANK.filter(
    (q) =>
      (config.categories.length === 0 || config.categories.includes(q.category)) &&
      (config.difficulty === 'mixed' || q.difficulty === config.difficulty)
  );
  // Widen the filters when they leave too few questions.
  const pool = bank.length >= config.questionCount ? bank : DEFAULT_QUESTION_BANK.slice();
  return [...custom, ...pool];
}

export const quizMasterRules: GameRules<QuizRulesConfig, QuizState, QuizAction, QuizGameResult> = {
  gameId: QUIZ_MASTER_GAME_ID,
  rulesVersion: 1,

  parseConfig(input) {
    const config = asConfigRecord(input);
    const categories = Array.isArray(config.categories)
      ? config.categories.filter((c): c is string => typeof c === 'string').slice(0, 20)
      : [];
    return {
      questionCount: readInt(config, 'questionCount', 10, 1, 50),
      difficulty: readEnum(config, 'difficulty', ['easy', 'medium', 'hard', 'mixed'] as const, 'mixed'),
      categories,
      timePerQuestionSec: readInt(config, 'timePerQuestionSec', 20, 5, 120),
      questions: parseCustomQuestions(config.questions),
      includeDefaultQuestions: config.includeDefaultQuestions === true,
    };
  },

  init(seed, config) {
    const rng = createRng(seed).fork('quiz');
    const selected = rng.shuffle(buildPool(config)).slice(0, config.questionCount);

    const questions = selected.map((q) => {
      const options = [q.answer, ...q.wrong];
      const order = rng.shuffle(options.map((_, i) => i));
      return {
        id: q.id,
        question: q.question,
        category: q.category,
        options: order.map((i) => options[i]),
        correctIndex: order.indexOf(0),
      };
    });

    return {
      questions,
      index: 0,
      answers: [],
      timePerQuestionMs: [],
      questionStartedAt: 0,
      limitMs: config.timePerQuestionSec * 1000,
      correctAnswers: 0,
      streak: 0,
      bestStreak: 0,
      score: 0,
      elapsedMs: 0,
    };
  },

  parseAction(type, payload) {
    if (type !== 'ANSWER' || !isRecord(payload)) return null;
    const { qIndex, choice } = payload;
    if (!isNonNegativeInt(qIndex) || !isNonNegativeInt(choice)) return null;
    return { type: 'ANSWER', payload: { qIndex, choice } };
  },

  // Unanswered questions time out one after another; each timeout starts the next question's clock.
  advance(state, tMs) {
    if (tMs <= state.elapsedMs) return state;
    let { index, questionStartedAt, streak } = state;
    const answers = state.answers.slice();
    const times = state.timePerQuestionMs.slice();
    while (index < state.questions.length && tMs >= questionStartedAt + state.limitMs) {
      answers.push(null);
      times.push(state.limitMs);
      questionStartedAt += state.limitMs;
      streak = 0;
      index++;
    }
    return { ...state, index, questionStartedAt, streak, answers, timePerQuestionMs: times, elapsedMs: tMs };
  },

  reduce(state, action, tMs) {
    const { qIndex, choice } = action.payload;
    const current = state.questions[state.index];
    // Answers for a question that is not current (already answered or timed out) are ignored.
    if (!current || qIndex !== state.index || choice >= current.options.length) return state;

    const taken = Math.max(0, tMs - state.questionStartedAt);
    const correct = choice === current.correctIndex;
    const streak = correct ? state.streak + 1 : 0;
    const points = correct
      ? 100 + Math.floor((50 * Math.max(0, state.limitMs - taken)) / state.limitMs) + Math.min(state.streak, 5) * 10
      : 0;

    return {
      ...state,
      index: state.index + 1,
      answers: [...state.answers, choice],
      timePerQuestionMs: [...state.timePerQuestionMs, taken],
      questionStartedAt: tMs,
      correctAnswers: state.correctAnswers + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      score: state.score + points,
    };
  },

  isOver: (state) => state.index >= state.questions.length,
  score: (state) => state.score,
  progress: (state) => (state.questions.length === 0 ? 1 : state.index / state.questions.length),

  result: (state) => ({
    correctAnswers: state.correctAnswers,
    totalQuestions: state.questions.length,
    accuracy: state.questions.length > 0 ? (state.correctAnswers / state.questions.length) * 100 : 0,
    timePerQuestionMs: state.timePerQuestionMs,
  }),

  limits: {
    maxActions: 200,
    maxDurationMs: (config) => config.questionCount * config.timePerQuestionSec * 1000,
    minActionIntervalMs: 300,
    // Pausing would stop the question timer while the question stays readable.
    allowPause: false,
  },

  race: { ranking: 'score_then_time' },

  // Answered questions show their answer; the current one hides it; later ones are hidden entirely.
  view: (state) => ({
    ...state,
    questions: state.questions.map((q, i) =>
      i < state.index ? q : i === state.index ? { ...q, correctIndex: -1 } : { id: '', question: '', category: '', options: [], correctIndex: -1 }
    ),
    elapsedMs: 0,
  }),

  plausibility(state) {
    const answered = state.timePerQuestionMs.filter((_, i) => state.answers[i] !== null);
    if (answered.length < 5 || state.correctAnswers < answered.length) return [];
    const average = answered.reduce((a, b) => a + b, 0) / answered.length;
    return average < 800 ? ['quiz_perfect_and_too_fast'] : [];
  },
};
