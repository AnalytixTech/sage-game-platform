/** Quiz bank editor rows: conversion, spreadsheet paste and checks (no React, so it's unit-tested). */
import type { QuizQuestion } from './api';

export const MAX_QUESTIONS = 200;
export const BANK_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface Row {
  question: string;
  answer: string;
  wrong: string[];
  category: string;
  difficulty: '' | 'easy' | 'medium' | 'hard';
}

export const emptyRow = (): Row => ({ question: '', answer: '', wrong: ['', '', ''], category: '', difficulty: '' });

export const toRow = (q: QuizQuestion): Row => ({
  question: q.question,
  answer: q.answer,
  wrong: [...q.wrong, '', '', ''].slice(0, Math.max(3, q.wrong.length)),
  category: q.category && q.category !== 'custom' ? q.category : '',
  difficulty: q.difficulty ?? '',
});

export const toQuestion = (r: Row): QuizQuestion => ({
  question: r.question.trim(),
  answer: r.answer.trim(),
  wrong: r.wrong.map((w) => w.trim()).filter(Boolean),
  ...(r.category.trim() ? { category: r.category.trim() } : {}),
  ...(r.difficulty ? { difficulty: r.difficulty } : {}),
});

export const isBlank = (r: Row) => !r.question.trim() && !r.answer.trim() && r.wrong.every((w) => !w.trim());

/** Rows pasted from a spreadsheet: Question, Correct answer, Wrong 1, Wrong 2, Wrong 3 (tab-separated). */
export function parsePastedRows(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells, i) => !(i === 0 && cells[0].toLowerCase() === 'question'))
    .map(([question = '', answer = '', ...wrong]) => ({
      ...emptyRow(),
      question,
      answer,
      wrong: [...wrong.filter(Boolean), '', '', ''].slice(0, Math.max(3, wrong.filter(Boolean).length)).slice(0, 5),
    }));
}

/** Local check before saving, so most mistakes are caught without a round trip. */
export function problems(rows: Row[]): string | null {
  const filled = rows.filter((r) => !isBlank(r));
  if (filled.length === 0) return 'Add at least one question.';
  if (filled.length > MAX_QUESTIONS) return `A bank can hold at most ${MAX_QUESTIONS} questions.`;
  for (const [i, r] of filled.entries()) {
    const q = toQuestion(r);
    if (!q.question) return `Question ${i + 1}: the question is empty.`;
    if (!q.answer) return `Question ${i + 1}: add the correct answer.`;
    if (q.wrong.filter((w) => w !== q.answer).length === 0) return `Question ${i + 1}: add at least one wrong answer.`;
  }
  return null;
}
