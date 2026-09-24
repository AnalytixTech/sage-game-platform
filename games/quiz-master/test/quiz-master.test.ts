import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ConfigError } from '@sagegames/engine';
import { DEFAULT_QUESTION_BANK, quizMasterRules } from '@sagegames/game-quiz-master';
import { expectReplayMatches, startGame } from '../../../test/support/harness';

describe('quiz bank', () => {
  it('has unique questions and four distinct options each', () => {
    expect(new Set(DEFAULT_QUESTION_BANK.map((q) => q.question)).size).toBe(DEFAULT_QUESTION_BANK.length);
    for (const q of DEFAULT_QUESTION_BANK) {
      expect(new Set([q.answer, ...q.wrong]).size).toBe(4);
    }
  });
});

describe('quiz master', () => {
  it('picks questions and option order from the seed', () => {
    const config = quizMasterRules.parseConfig({ questionCount: 10 });
    const a = quizMasterRules.init('q', config);
    expect(a).toEqual(quizMasterRules.init('q', config));
    expect(a.questions.map((q) => q.id)).not.toEqual(quizMasterRules.init('other', config).questions.map((q) => q.id));
    expect(quizMasterRules.init('fixture-seed', config).questions.map((q) => [q.id, q.correctIndex])).toMatchSnapshot();
  });

  it('regression: the correct option is not always in the same position', () => {
    const s = quizMasterRules.init('positions', quizMasterRules.parseConfig({ questionCount: 20 }));
    expect(new Set(s.questions.map((q) => q.correctIndex)).size).toBeGreaterThan(1);
    s.questions.forEach((q) => {
      const bank = DEFAULT_QUESTION_BANK.find((b) => b.id === q.id)!;
      expect(q.options[q.correctIndex]).toBe(bank.answer);
    });
  });

  it('filters by category and difficulty', () => {
    const s = quizMasterRules.init('filter', quizMasterRules.parseConfig({ categories: ['science'], difficulty: 'easy', questionCount: 5 }));
    s.questions.forEach((q) => expect(q.category).toBe('science'));
  });

  it('uses host questions when supplied', () => {
    const questions = [
      { question: 'Capital of Japabudz?', answer: 'Abroad', wrong: ['Home', 'Nowhere'] },
      { question: 'Best travel doc?', answer: 'Passport', wrong: ['Receipt'] },
    ];
    const s = quizMasterRules.init('custom', quizMasterRules.parseConfig({ questions, questionCount: 5 }));
    expect(s.questions.map((q) => q.question).sort()).toEqual(['Best travel doc?', 'Capital of Japabudz?']);
  });

  it('rejects malformed host questions', () => {
    expect(() => quizMasterRules.parseConfig({ questions: [{ question: 'x', answer: 'y', wrong: [] }] })).toThrow(ConfigError);
    expect(() => quizMasterRules.parseConfig({ questions: [{ question: 'x', answer: 'y', wrong: ['y'] }] })).toThrow(ConfigError);
  });

  it('scores correct answers with speed and streak bonuses and replays identically', () => {
    const { runtime, clock, config } = startGame(quizMasterRules, 'play', { questionCount: 5, timePerQuestionSec: 20 });
    for (let i = 0; i < 5; i++) {
      const s = runtime.getSnapshot().state;
      clock.wait(10_000); // half the time left: +25 speed bonus
      runtime.dispatch('ANSWER', { qIndex: s.index, choice: s.questions[s.index].correctIndex });
    }
    const snap = runtime.getSnapshot();
    expect(snap.over).toBe(true);
    // 5 x (100 + 25) + streak bonuses 0 + 10 + 20 + 30 + 40
    expect(snap.score).toBe(5 * 125 + 100);
    expect(expectReplayMatches(runtime, 'play', config).result.correctAnswers).toBe(5);
  });

  it('regression: unanswered questions time out and the game ends on its own', () => {
    const { runtime, clock, config } = startGame(quizMasterRules, 'timeout', { questionCount: 3, timePerQuestionSec: 10 });
    clock.wait(15_000);
    runtime.tick();
    expect(runtime.getSnapshot().state.index).toBe(1);
    clock.wait(20_000);
    runtime.tick();
    const snap = runtime.getSnapshot();
    expect(snap.over).toBe(true);
    expect(snap.ended).toBe(true);
    expect(snap.state.answers).toEqual([null, null, null]);
    expectReplayMatches(runtime, 'timeout', config);
  });

  it('regression: a quiz that timed out while the app was backgrounded still verifies', () => {
    const { runtime, clock, config } = startGame(quizMasterRules, 'backgrounded', { questionCount: 3, timePerQuestionSec: 10 });
    clock.wait(5 * 60_000); // no ticks for five minutes
    expect(runtime.dispatch('ANSWER', { qIndex: 0, choice: 0 })).toBe('ignored');
    expect(runtime.getSnapshot().ended).toBe(true);
    const out = expectReplayMatches(runtime, 'backgrounded', config);
    expect(out.over).toBe(true);
    expect(out.activeMs).toBe(30_000);
  });

  it('ignores answers for a question that is not current', () => {
    const { runtime } = startGame(quizMasterRules, 'stale', { questionCount: 3 });
    const q0 = runtime.getSnapshot().state.questions[0];
    runtime.dispatch('ANSWER', { qIndex: 0, choice: q0.correctIndex });
    runtime.dispatch('ANSWER', { qIndex: 0, choice: q0.correctIndex });
    expect(runtime.getSnapshot().state.correctAnswers).toBe(1);
  });

  it('does not allow pausing (it would freeze the question timer)', () => {
    const { runtime } = startGame(quizMasterRules, 'pause');
    expect(runtime.pause()).toBe(false);
  });

  it('property: random answers and client ticks replay identically', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(25_000), fc.nat(12), fc.nat(5), fc.boolean()), { maxLength: 30 }), (steps) => {
        const { runtime, clock, config } = startGame(quizMasterRules, 'prop', { questionCount: 8 });
        for (const [wait, qIndex, choice, tickFirst] of steps) {
          // Ticks are never logged; replay must still reach the same state.
          if (tickFirst) {
            clock.wait(Math.floor(wait / 2));
            runtime.tick();
          }
          clock.wait(tickFirst ? Math.ceil(wait / 2) : wait);
          runtime.dispatch('ANSWER', { qIndex, choice });
        }
        expect(expectReplayMatches(runtime, 'prop', config).score).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 80 }
    );
  });
});

describe('quiz master: battle view (hidden information)', () => {
  const config = quizMasterRules.parseConfig({ questionCount: 5 });
  const view = quizMasterRules.view!;

  it('hides the current answer and every later question', () => {
    const s = quizMasterRules.init('hidden', config);
    const v = view(s);
    expect(v.questions).toHaveLength(5);
    expect(v.questions[0].question).toBe(s.questions[0].question);
    expect(v.questions[0].options).toEqual(s.questions[0].options);
    expect(v.questions[0].correctIndex).toBe(-1);
    for (const q of v.questions.slice(1)) expect(q).toEqual({ id: '', question: '', category: '', options: [], correctIndex: -1 });
  });

  it('reveals an answer once the question is answered or timed out', () => {
    let s = quizMasterRules.init('hidden', config);
    s = quizMasterRules.reduce(s, { type: 'ANSWER', payload: { qIndex: 0, choice: 0 } }, 1000);
    s = quizMasterRules.advance(s, 1000 + s.limitMs); // question 2 times out
    const v = view(s);
    expect(v.questions[0].correctIndex).toBe(s.questions[0].correctIndex);
    expect(v.questions[1].correctIndex).toBe(s.questions[1].correctIndex);
    expect(v.questions[2].correctIndex).toBe(-1);
    expect(quizMasterRules.score(v)).toBe(quizMasterRules.score(s));
  });
});
