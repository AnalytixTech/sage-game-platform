import { describe, expect, it } from 'vitest';
import { emptyRow, parsePastedRows, problems, toQuestion, toRow } from '../src/quizRows';

describe('quiz bank editor rows', () => {
  it('reads rows pasted from a spreadsheet, skipping the header and blank lines', () => {
    const rows = parsePastedRows(
      'Question\tCorrect answer\tWrong 1\tWrong 2\tWrong 3\r\n' +
        'What does BRP stand for?\tBiometric Residence Permit\tBritish Rail Pass\tBorder Return Paper\t\n' +
        '\n' +
        'What is a CAS?\tConfirmation of Acceptance for Studies\tCampus Access Slip\n'
    );
    expect(rows.map(toQuestion)).toEqual([
      { question: 'What does BRP stand for?', answer: 'Biometric Residence Permit', wrong: ['British Rail Pass', 'Border Return Paper'] },
      { question: 'What is a CAS?', answer: 'Confirmation of Acceptance for Studies', wrong: ['Campus Access Slip'] },
    ]);
    // Always at least three wrong-answer boxes to fill in.
    expect(rows[1].wrong).toHaveLength(3);
  });

  it('keeps up to five wrong answers', () => {
    const [row] = parsePastedRows('Q\tA\t1\t2\t3\t4\t5\t6');
    expect(row.wrong).toEqual(['1', '2', '3', '4', '5']);
  });

  it('round-trips a stored question', () => {
    const q = { question: 'Q?', answer: 'A', wrong: ['B', 'C', 'D', 'E'], category: 'visa', difficulty: 'hard' as const };
    expect(toQuestion(toRow(q))).toEqual(q);
    // The default "custom" category isn't shown as if the host had typed it.
    expect(toRow({ question: 'Q', answer: 'A', wrong: ['B'], category: 'custom' }).category).toBe('');
  });

  it('explains what is missing before saving', () => {
    expect(problems([emptyRow()])).toBe('Add at least one question.');
    expect(problems([{ ...emptyRow(), question: 'Q?' }])).toBe('Question 1: add the correct answer.');
    expect(problems([{ ...emptyRow(), question: 'Q?', answer: 'A', wrong: ['A', '', ''] }])).toBe('Question 1: add at least one wrong answer.');
    expect(problems([{ ...emptyRow(), question: 'Q?', answer: 'A', wrong: ['B', '', ''] }, emptyRow()])).toBeNull();
  });
});
