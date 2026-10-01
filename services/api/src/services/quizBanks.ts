import { z } from 'zod';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { ConfigError } from '@sagegames/engine';
import { Db, json, onConflictUpdate } from '../db/db';
import { HttpError } from '../http/errors';

/** Bank ids are used in session config (`bankId`), so keep them URL- and JSON-friendly. */
export const QUIZ_BANK_ID = /^[a-zA-Z0-9_-]{1,64}$/;

/** Request body for creating or replacing a bank (host API and portal). */
export const quizBankBody = z.object({ name: z.string().max(120).optional(), questions: z.array(z.unknown()).min(1).max(200) });

export interface QuizBankSummary {
  bankId: string;
  name: string;
  questionCount: number;
  updatedAt: string;
}

export interface QuizBank {
  bankId: string;
  name: string;
  questions: unknown[];
}

export async function listQuizBanks(db: Db, tenantId: string): Promise<QuizBankSummary[]> {
  const rows = await db
    .selectFrom('sagegames_quiz_banks')
    .select(['bank_id', 'name', 'questions', 'updated_at'])
    .where('tenant_id', '=', tenantId)
    .orderBy('bank_id')
    .execute();
  return rows.map((r) => ({
    bankId: r.bank_id,
    name: r.name,
    questionCount: Array.isArray(r.questions) ? r.questions.length : 0,
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getQuizBank(db: Db, tenantId: string, bankId: string): Promise<QuizBank> {
  const row = await db
    .selectFrom('sagegames_quiz_banks')
    .select(['bank_id', 'name', 'questions'])
    .where('tenant_id', '=', tenantId)
    .where('bank_id', '=', bankId)
    .executeTakeFirst();
  if (!row) throw new HttpError(404, 'Quiz bank not found', 'quiz_bank_not_found');
  return { bankId: row.bank_id, name: row.name, questions: row.questions };
}

/** Create or replace a bank. Questions are checked with the quiz's own config rules. */
export async function saveQuizBank(
  db: Db,
  tenantId: string,
  bankId: string,
  input: { name?: string; questions: unknown[] },
  now: Date,
  createdBy: string | null = null
): Promise<QuizBankSummary> {
  if (!QUIZ_BANK_ID.test(bankId)) {
    throw new HttpError(400, 'Bank id may use letters, digits, - and _ (up to 64)', 'invalid_bank_id');
  }
  let questions: unknown[];
  try {
    questions = quizMasterRules.parseConfig({ questions: input.questions }).questions ?? [];
  } catch (err) {
    if (err instanceof ConfigError) {
      // "config.questions[3].wrong must…" → "Question 4: wrong must…"
      const message = err.message.replace(/^config\.questions\[(\d+)\]\.?/, (_m, i) => `Question ${Number(i) + 1}: `).replace(/^config\.questions/, 'Questions');
      throw new HttpError(400, message, 'invalid_questions');
    }
    throw err;
  }
  if (questions.length === 0) throw new HttpError(400, 'A bank needs at least one question', 'invalid_questions');
  const name = (input.name ?? '').trim().slice(0, 120);
  await onConflictUpdate(
    db,
    db.insertInto('sagegames_quiz_banks').values({ tenant_id: tenantId, bank_id: bankId, name, questions: json(questions), created_by: createdBy, updated_at: now }),
    ['tenant_id', 'bank_id'],
    { name, questions: json(questions), updated_at: now }
  ).execute();
  return { bankId, name, questionCount: questions.length, updatedAt: now.toISOString() };
}

export async function deleteQuizBank(db: Db, tenantId: string, bankId: string): Promise<void> {
  await db.deleteFrom('sagegames_quiz_banks').where('tenant_id', '=', tenantId).where('bank_id', '=', bankId).execute();
}
