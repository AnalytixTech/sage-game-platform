/**
 * Portal accounts, built into the API.
 *
 * - Access tokens: short-lived JWTs (HS256, AUTH_JWT_SECRET) sent as a bearer token. They carry the
 *   account's token epoch; changing the password or signing out everywhere bumps it, so older
 *   access tokens stop working at once.
 * - Refresh tokens: random, stored hashed, rotated on every use and sent in an httpOnly cookie.
 *   Reusing a spent refresh token revokes its whole family (a stolen token gets everyone signed out).
 * - Email verification, password reset and email change use single-use random tokens, stored
 *   hashed, that expire (24 hours for verification, 1 hour for reset).
 */
import crypto from 'crypto';
import { jwtVerify, SignJWT } from 'jose';
import { sha256Hex } from './keys';
import { hashPassword, passwordProblem, verifyPassword } from './passwords';
import { AppConfig } from '../config';
import { Db } from '../db/db';
import { AuthTokenPurpose } from '../db/types';
import { Mailer } from '../email/mailer';
import * as templates from '../email/templates';
import { HttpError } from '../http/errors';
import { Logger } from '../observability/logger';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 3600_000;
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
const AUDIENCE = 'sagegames-portal';

export interface PortalUser {
  id: string;
  email: string;
}

export interface AccountDeps {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
  logger: Logger;
  now: () => Date;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PortalUser;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const randomToken = (prefix: string) => `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
const secret = (config: AppConfig) => new TextEncoder().encode(config.authJwtSecret);

// ---------------------------------------------------------------- Access tokens

export async function signAccessToken(config: AppConfig, user: { id: string; email: string; token_epoch: number }, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ email: user.email, ep: user.token_epoch })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(config.publicBaseUrl)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SEC)
    .sign(secret(config));
}

/** The signed-in user for an access token, or null (bad, expired or revoked by an epoch bump). */
export async function verifyAccessToken(deps: Pick<AccountDeps, 'db' | 'config' | 'now'>, token: string): Promise<PortalUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret(deps.config), {
      issuer: deps.config.publicBaseUrl,
      audience: AUDIENCE,
      currentDate: deps.now(),
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.ep !== 'number') return null;
    const user = await deps.db.selectFrom('sagegames_users').select(['id', 'email', 'token_epoch']).where('id', '=', payload.sub).executeTakeFirst();
    if (!user || Number(user.token_epoch) !== payload.ep) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Sessions (refresh tokens)

async function issueSession(deps: AccountDeps, user: { id: string; email: string; token_epoch: number }, familyId?: string): Promise<IssuedSession> {
  const now = deps.now();
  const refreshToken = randomToken('rt');
  await deps.db
    .insertInto('sagegames_refresh_tokens')
    .values({
      id: crypto.randomUUID(),
      user_id: user.id,
      family_id: familyId ?? crypto.randomUUID(),
      token_hash: sha256Hex(refreshToken),
      expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      created_at: now,
    })
    .execute();
  return {
    accessToken: await signAccessToken(deps.config, user, now),
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshToken,
    user: { id: user.id, email: user.email },
  };
}

const unauthorized = () => new HttpError(401, 'Please sign in again', 'unauthorized');

/** Rotate a refresh token: the old one is spent, a new one in the same family is issued. */
export async function refreshSession(deps: AccountDeps, refreshToken: string | undefined): Promise<IssuedSession> {
  if (!refreshToken) throw unauthorized();
  const now = deps.now();
  const row = await deps.db.selectFrom('sagegames_refresh_tokens').selectAll().where('token_hash', '=', sha256Hex(refreshToken)).executeTakeFirst();
  if (!row) throw unauthorized();
  if (row.revoked_at) {
    // A spent token came back: someone has a copy. Sign the whole family out.
    await deps.db.updateTable('sagegames_refresh_tokens').set({ revoked_at: now }).where('family_id', '=', row.family_id).where('revoked_at', 'is', null).execute();
    deps.logger.warn('refresh token reused; signed the session out', { component: 'auth', userId: row.user_id });
    throw unauthorized();
  }
  if (row.expires_at.getTime() <= now.getTime()) throw unauthorized();
  const spent = await deps.db
    .updateTable('sagegames_refresh_tokens')
    .set({ revoked_at: now })
    .where('id', '=', row.id)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (Number(spent.numUpdatedRows) === 0) throw unauthorized(); // used concurrently
  const user = await deps.db.selectFrom('sagegames_users').select(['id', 'email', 'token_epoch', 'email_verified_at']).where('id', '=', row.user_id).executeTakeFirst();
  if (!user || !user.email_verified_at) throw unauthorized();
  return issueSession(deps, { ...user, token_epoch: Number(user.token_epoch) }, row.family_id);
}

export async function logout(deps: AccountDeps, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await deps.db.updateTable('sagegames_refresh_tokens').set({ revoked_at: deps.now() }).where('token_hash', '=', sha256Hex(refreshToken)).where('revoked_at', 'is', null).execute();
}

/** Sign out everywhere: revoke every refresh token and invalidate issued access tokens. */
export async function signOutEverywhere(deps: AccountDeps, userId: string): Promise<void> {
  const now = deps.now();
  await deps.db
    .updateTable('sagegames_users')
    .set((eb) => ({ token_epoch: eb('token_epoch', '+', 1), updated_at: now }))
    .where('id', '=', userId)
    .execute();
  await deps.db.updateTable('sagegames_refresh_tokens').set({ revoked_at: now }).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
}

// ---------------------------------------------------------------- One-time email tokens

async function createEmailToken(deps: AccountDeps, userId: string, purpose: AuthTokenPurpose, ttlMs: number, email: string | null = null): Promise<string> {
  const now = deps.now();
  const token = randomToken(purpose === 'reset_password' ? 'rst' : 'vfy');
  // One live token per purpose: a new email replaces the previous link.
  await deps.db.deleteFrom('sagegames_auth_tokens').where('user_id', '=', userId).where('purpose', '=', purpose).where('used_at', 'is', null).execute();
  await deps.db
    .insertInto('sagegames_auth_tokens')
    .values({ token_hash: sha256Hex(token), user_id: userId, purpose, email, expires_at: new Date(now.getTime() + ttlMs), created_at: now })
    .execute();
  return token;
}

/** Use a one-time token (once). Throws if unknown, used or expired. */
async function consumeEmailToken(deps: AccountDeps, token: string, purposes: AuthTokenPurpose[]) {
  const now = deps.now();
  const row = await deps.db.selectFrom('sagegames_auth_tokens').selectAll().where('token_hash', '=', sha256Hex(token)).executeTakeFirst();
  const invalid = new HttpError(400, 'This link is invalid or has expired. Ask for a new one.', 'invalid_token');
  if (!row || !purposes.includes(row.purpose) || row.used_at || row.expires_at.getTime() <= now.getTime()) throw invalid;
  const used = await deps.db
    .updateTable('sagegames_auth_tokens')
    .set({ used_at: now })
    .where('token_hash', '=', row.token_hash)
    .where('used_at', 'is', null)
    .executeTakeFirst();
  if (Number(used.numUpdatedRows) === 0) throw invalid;
  return row;
}

const portalUrl = (config: AppConfig, path: string, token?: string) =>
  `${config.publicBaseUrl}/portal/${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

/** Send an email without making the request wait (or revealing, by timing, whether it was sent). */
function sendLater(deps: AccountDeps, to: string, content: templates.EmailContent) {
  deps.mailer.send({ to, ...content }).catch((err) => deps.logger.error('account email failed', { component: 'email', err }));
}

async function sendNow(deps: AccountDeps, to: string, content: templates.EmailContent) {
  try {
    await deps.mailer.send({ to, ...content });
  } catch (err) {
    deps.logger.error('account email failed', { component: 'email', err });
    throw new HttpError(503, "We couldn't send the email. Try again in a few minutes.", 'email_unavailable');
  }
}

// ---------------------------------------------------------------- Flows

function checkPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem, 'weak_password');
}

async function findByEmail(db: Db, email: string) {
  return db.selectFrom('sagegames_users').selectAll().where('email', '=', normalizeEmail(email)).executeTakeFirst();
}

/**
 * Sign up. The answer is the same whether or not the address already has an account; an existing
 * verified account gets a "you already have an account" email instead.
 */
export async function signup(deps: AccountDeps, input: { email: string; password: string }): Promise<void> {
  const email = normalizeEmail(input.email);
  checkPassword(input.password);
  const now = deps.now();
  // Hash first, so answering takes as long whether or not the address has an account.
  const passwordHash = await hashPassword(input.password, deps.config.passwordCost);
  const existing = await findByEmail(deps.db, email);
  if (existing) {
    if (existing.email_verified_at) {
      sendLater(deps, email, templates.accountExists(email, portalUrl(deps.config, 'signin')));
    } else {
      // Not verified yet: the new password wins (the first sign-up may have had a typo), and a fresh link goes out.
      await deps.db
        .updateTable('sagegames_users')
        .set({ password_hash: passwordHash, updated_at: now })
        .where('id', '=', existing.id)
        .execute();
      const token = await createEmailToken(deps, existing.id, 'verify_email', VERIFY_TTL_MS);
      sendLater(deps, email, templates.confirmSignup(email, portalUrl(deps.config, 'verify-email', token)));
    }
    return;
  }
  const id = crypto.randomUUID();
  await deps.db
    .insertInto('sagegames_users')
    .values({ id, email, password_hash: passwordHash, email_verified_at: null, created_at: now, updated_at: now })
    .execute();
  const token = await createEmailToken(deps, id, 'verify_email', VERIFY_TTL_MS);
  await sendNow(deps, email, templates.confirmSignup(email, portalUrl(deps.config, 'verify-email', token)));
}

/** Send a new verification link (same answer whether or not the account exists). */
export async function resendVerification(deps: AccountDeps, rawEmail: string): Promise<void> {
  const user = await findByEmail(deps.db, rawEmail);
  if (!user || user.email_verified_at) return;
  const token = await createEmailToken(deps, user.id, 'verify_email', VERIFY_TTL_MS);
  sendLater(deps, user.email, templates.confirmSignup(user.email, portalUrl(deps.config, 'verify-email', token)));
}

/** Confirm a sign-up or an email change from the emailed link, and sign in. */
export async function verifyEmail(deps: AccountDeps, token: string): Promise<IssuedSession> {
  const row = await consumeEmailToken(deps, token, ['verify_email', 'change_email']);
  const now = deps.now();
  const user = await deps.db.selectFrom('sagegames_users').selectAll().where('id', '=', row.user_id).executeTakeFirstOrThrow();

  if (row.purpose === 'change_email') {
    const newEmail = normalizeEmail(row.email ?? '');
    const taken = await findByEmail(deps.db, newEmail);
    if (taken && taken.id !== user.id) throw new HttpError(409, 'That email is already used by another account', 'email_taken');
    await deps.db.updateTable('sagegames_users').set({ email: newEmail, email_verified_at: now, updated_at: now }).where('id', '=', user.id).execute();
    sendLater(deps, user.email, templates.genericNotice(user.email, `sign-in email changed to ${newEmail}`));
    return issueSession(deps, { id: user.id, email: newEmail, token_epoch: Number(user.token_epoch) });
  }

  if (!user.email_verified_at) {
    await deps.db.updateTable('sagegames_users').set({ email_verified_at: now, updated_at: now }).where('id', '=', user.id).execute();
  }
  return issueSession(deps, { id: user.id, email: user.email, token_epoch: Number(user.token_epoch) });
}

export async function login(deps: AccountDeps, input: { email: string; password: string }): Promise<IssuedSession> {
  const user = await findByEmail(deps.db, input.email);
  const invalid = new HttpError(401, 'Wrong email or password', 'invalid_credentials');
  if (!user) {
    await verifyPassword(input.password, null); // same timing as a wrong password
    throw invalid;
  }
  if (user.password_hash === null) {
    // Moved from the old platform without a password: email a link to set one.
    const token = await createEmailToken(deps, user.id, 'reset_password', RESET_TTL_MS);
    await sendNow(deps, user.email, templates.setPassword(user.email, portalUrl(deps.config, 'reset-password', token)));
    throw new HttpError(409, "We've emailed you a link to set a password for the new sign-in.", 'password_setup_required');
  }
  if (!(await verifyPassword(input.password, user.password_hash))) throw invalid;
  if (!user.email_verified_at) {
    throw new HttpError(403, 'Confirm your email first. We can send the link again.', 'email_not_verified');
  }
  return issueSession(deps, { id: user.id, email: user.email, token_epoch: Number(user.token_epoch) });
}

/** Start a password reset. Always the same answer, whether or not the account exists. */
export async function forgotPassword(deps: AccountDeps, rawEmail: string): Promise<void> {
  const user = await findByEmail(deps.db, rawEmail);
  if (!user) return;
  const token = await createEmailToken(deps, user.id, 'reset_password', RESET_TTL_MS);
  const content = user.password_hash === null ? templates.setPassword : templates.resetPassword;
  sendLater(deps, user.email, content(user.email, portalUrl(deps.config, 'reset-password', token)));
}

/** Set a new password from an emailed link. Signs out every other session, then signs in. */
export async function resetPassword(deps: AccountDeps, input: { token: string; password: string }): Promise<IssuedSession> {
  checkPassword(input.password);
  const row = await consumeEmailToken(deps, input.token, ['reset_password']);
  const now = deps.now();
  const user = await deps.db.selectFrom('sagegames_users').selectAll().where('id', '=', row.user_id).executeTakeFirstOrThrow();
  await signOutEverywhere(deps, user.id);
  await deps.db
    .updateTable('sagegames_users')
    .set({
      password_hash: await hashPassword(input.password, deps.config.passwordCost),
      // Following the emailed link proves the address.
      email_verified_at: user.email_verified_at ?? now,
      updated_at: now,
    })
    .where('id', '=', user.id)
    .execute();
  sendLater(deps, user.email, templates.passwordChanged(user.email));
  return issueSession(deps, { id: user.id, email: user.email, token_epoch: Number(user.token_epoch) + 1 });
}

/** Change the password while signed in. Every session is signed out; this one gets a new session. */
export async function changePassword(deps: AccountDeps, userId: string, input: { currentPassword: string; newPassword: string }): Promise<IssuedSession> {
  checkPassword(input.newPassword);
  const user = await deps.db.selectFrom('sagegames_users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
  if (!(await verifyPassword(input.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'Your current password is wrong', 'invalid_credentials');
  }
  await signOutEverywhere(deps, user.id);
  await deps.db
    .updateTable('sagegames_users')
    .set({ password_hash: await hashPassword(input.newPassword, deps.config.passwordCost), updated_at: deps.now() })
    .where('id', '=', user.id)
    .execute();
  sendLater(deps, user.email, templates.passwordChanged(user.email));
  return issueSession(deps, { id: user.id, email: user.email, token_epoch: Number(user.token_epoch) + 1 });
}

/** Ask to change the sign-in email: the new address must confirm through an emailed link. */
export async function requestEmailChange(deps: AccountDeps, userId: string, input: { newEmail: string; password: string }): Promise<void> {
  const newEmail = normalizeEmail(input.newEmail);
  const user = await deps.db.selectFrom('sagegames_users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
  if (!(await verifyPassword(input.password, user.password_hash))) {
    throw new HttpError(400, 'Your password is wrong', 'invalid_credentials');
  }
  if (newEmail === user.email) throw new HttpError(400, 'That is already your email', 'same_email');
  const taken = await findByEmail(deps.db, newEmail);
  if (taken) throw new HttpError(409, 'That email is already used by another account', 'email_taken');
  const token = await createEmailToken(deps, user.id, 'change_email', VERIFY_TTL_MS, newEmail);
  await sendNow(deps, newEmail, templates.confirmEmailChange(user.email, newEmail, portalUrl(deps.config, 'verify-email', token)));
  sendLater(deps, user.email, templates.genericNotice(user.email, `email change to ${newEmail} requested`));
}

/** Delete the account. Apps the user owns must be deleted (or handed over) first. */
export async function deleteAccount(deps: AccountDeps, userId: string, password: string): Promise<void> {
  const user = await deps.db.selectFrom('sagegames_users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
  if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(400, 'Your password is wrong', 'invalid_credentials');
  const owned = await deps.db
    .selectFrom('sagegames_tenant_members')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .executeTakeFirst();
  if (Number(owned?.n ?? 0) > 0) throw new HttpError(409, 'Delete your apps first', 'owns_apps');
  await deps.db.deleteFrom('sagegames_users').where('id', '=', userId).execute();
}

/** Create a verified account directly (first owner on a fresh install, scripts, tests). */
export async function createVerifiedUser(deps: Pick<AccountDeps, 'db' | 'config' | 'now'>, email: string, password: string): Promise<PortalUser> {
  checkPassword(password);
  const now = deps.now();
  const id = crypto.randomUUID();
  const normalized = normalizeEmail(email);
  if (await findByEmail(deps.db, normalized)) throw new HttpError(409, `${normalized} already has an account`, 'email_taken');
  await deps.db
    .insertInto('sagegames_users')
    .values({ id, email: normalized, password_hash: await hashPassword(password, deps.config.passwordCost), email_verified_at: now, created_at: now, updated_at: now })
    .execute();
  return { id, email: normalized };
}
