import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from '../src/auth/passwords';
import { createTestEnv, TestEnv } from './support/setup';

const PASSWORD = 'Sage-games-2026';
const AJAX = { 'X-Requested-With': 'sagegames-portal' };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The sg_refresh cookie from a response, as a Cookie header value. */
function refreshCookie(res: { headers: Record<string, unknown> }): string {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((c) => c.startsWith('sg_refresh='));
  if (!cookie) throw new Error('no refresh cookie');
  return cookie.split(';')[0];
}

const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!;

describe('portal accounts', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  const settle = () => new Promise((r) => setTimeout(r, 20)); // emails sent in the background
  const lastLink = (to: string) => env.mail.linkIn(env.mail.last(to));

  async function signUpAndVerify(email = 'dev@example.com') {
    expect((await env.api.post('/portal/api/auth/signup').send({ email, password: PASSWORD })).status).toBe(202);
    const verified = await env.api.post('/portal/api/auth/verify-email').send({ token: tokenFrom(lastLink(email)) });
    expect(verified.status).toBe(200);
    return verified;
  }

  it('signs up, confirms the email from the link, and signs in', async () => {
    const res = await env.api.post('/portal/api/auth/signup').send({ email: 'Dev@Example.com', password: PASSWORD });
    expect(res.status).toBe(202);
    const email = env.mail.last('dev@example.com')!;
    expect(email.subject).toBe('Confirm your SageGames developer account');
    expect(email.html).toContain('Confirm email');
    const link = env.mail.linkIn(email);
    expect(link).toMatch(/^http:\/\/localhost:4000\/portal\/verify-email\?token=vfy_/);

    // Not before confirming.
    const early = await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD });
    expect(early.body.code).toBe('email_not_verified');

    const verified = await env.api.post('/portal/api/auth/verify-email').send({ token: tokenFrom(link) });
    expect(verified.status).toBe(200);
    expect(verified.body.user.email).toBe('dev@example.com');
    expect(refreshCookie(verified)).toMatch(/^sg_refresh=rt_/);
    const setCookie = (verified.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Path=\/portal/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    // The link works once.
    expect((await env.api.post('/portal/api/auth/verify-email').send({ token: tokenFrom(link) })).body.code).toBe('invalid_token');

    const login = await env.api.post('/portal/api/auth/login').send({ email: 'DEV@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const me = await env.api.get('/portal/api/me').set(bearer(login.body.accessToken));
    expect(me.body.user.email).toBe('dev@example.com');
    expect(me.body.apps).toEqual([]);
    expect((await env.api.get('/portal/api/auth/me').set(bearer(login.body.accessToken))).body.user.email).toBe('dev@example.com');
  });

  it('keeps the password rule and never stores the password', async () => {
    const weak = await env.api.post('/portal/api/auth/signup').send({ email: 'a@example.com', password: 'short' });
    expect(weak.body.code).toBe('weak_password');
    expect(passwordProblem('alllowercase1')).toMatch(/upper/);
    expect(passwordProblem('Long-enough-1')).toBeNull();

    await env.api.post('/portal/api/auth/signup').send({ email: 'a@example.com', password: PASSWORD });
    const user = await env.db.selectFrom('sagegames_users').selectAll().where('email', '=', 'a@example.com').executeTakeFirstOrThrow();
    expect(user.password_hash).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(user.password_hash).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, user.password_hash)).toBe(true);
    expect(await verifyPassword('Sage-games-2025', user.password_hash)).toBe(false);
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD, 2 ** 10))).toBe(true);
  });

  it('answers sign-up and forgot-password the same way whether or not the account exists', async () => {
    await signUpAndVerify('taken@example.com');
    const sent = env.mail.sent.length;

    const again = await env.api.post('/portal/api/auth/signup').send({ email: 'taken@example.com', password: 'Other-pass-77' });
    const fresh = await env.api.post('/portal/api/auth/signup').send({ email: 'fresh@example.com', password: 'Other-pass-77' });
    expect([again.status, again.body]).toEqual([fresh.status, fresh.body]);
    await settle();
    expect(env.mail.sent.slice(sent).map((m) => [m.to, m.subject])).toEqual(
      expect.arrayContaining([
        ['taken@example.com', 'You already have a SageGames account'],
        ['fresh@example.com', 'Confirm your SageGames developer account'],
      ])
    );
    // The existing account's password didn't change.
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'taken@example.com', password: PASSWORD })).status).toBe(200);

    const known = await env.api.post('/portal/api/auth/forgot-password').send({ email: 'taken@example.com' });
    const unknown = await env.api.post('/portal/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect([known.status, known.body]).toEqual([unknown.status, unknown.body]);
    await settle();
    expect(env.mail.last('nobody@example.com')).toBeUndefined();
    expect(env.mail.last('taken@example.com')!.subject).toBe('Reset your SageGames password');

    const wrong = await env.api.post('/portal/api/auth/login').send({ email: 'taken@example.com', password: 'Wrong-pass-123' });
    const missing = await env.api.post('/portal/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong-pass-123' });
    expect([wrong.status, wrong.body]).toEqual([missing.status, missing.body]);
  });

  it('rotates refresh tokens and signs the family out when a spent one comes back', async () => {
    const first = await signUpAndVerify();
    const cookie1 = refreshCookie(first);

    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', cookie1)).body.code).toBe('csrf'); // header required
    const second = await env.api.post('/portal/api/auth/refresh').set('Cookie', cookie1).set(AJAX);
    expect(second.status).toBe(200);
    const cookie2 = refreshCookie(second);
    expect(cookie2).not.toBe(cookie1);

    // Replaying the spent token revokes the newer one too.
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', cookie1).set(AJAX)).status).toBe(401);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', cookie2).set(AJAX)).status).toBe(401);
    expect(env.logs.some((l) => l.msg === 'refresh token reused; signed the session out')).toBe(true);
  });

  it('expires access tokens and refresh tokens', async () => {
    const session = await signUpAndVerify();
    env.clock.advance(16 * 60_000);
    expect((await env.api.get('/portal/api/me').set(bearer(session.body.accessToken))).status).toBe(401);
    const refreshed = await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(session)).set(AJAX);
    expect(refreshed.status).toBe(200);
    expect((await env.api.get('/portal/api/me').set(bearer(refreshed.body.accessToken))).status).toBe(200);
    env.clock.advance(31 * 24 * 3600_000);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(refreshed)).set(AJAX)).status).toBe(401);
  });

  it('logs out one session, or every session', async () => {
    const a = await signUpAndVerify();
    const b = await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD });

    expect((await env.api.post('/portal/api/auth/logout').set('Cookie', refreshCookie(a)).set(AJAX)).status).toBe(204);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(a)).set(AJAX)).status).toBe(401);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(b)).set(AJAX)).status).toBe(200);

    const c = await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD });
    await env.api.post('/portal/api/auth/logout').set(bearer(c.body.accessToken)).set(AJAX).send({ everywhere: true });
    expect((await env.api.get('/portal/api/me').set(bearer(c.body.accessToken))).status).toBe(401);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(c)).set(AJAX)).status).toBe(401);
  });

  it('resets a forgotten password from the emailed link and signs out every other session', async () => {
    const old = await signUpAndVerify();
    await env.api.post('/portal/api/auth/forgot-password').send({ email: 'dev@example.com' });
    await settle();
    const link = lastLink('dev@example.com');
    expect(link).toMatch(/\/portal\/reset-password\?token=rst_/);

    const reset = await env.api.post('/portal/api/auth/reset-password').send({ token: tokenFrom(link), password: 'Brand-new-pass-1' });
    expect(reset.status).toBe(200);
    expect((await env.api.get('/portal/api/me').set(bearer(old.body.accessToken))).status).toBe(401);
    expect((await env.api.get('/portal/api/me').set(bearer(reset.body.accessToken))).status).toBe(200);
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: 'Brand-new-pass-1' })).status).toBe(200);
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD })).status).toBe(401);
    await settle();
    expect(env.mail.last('dev@example.com')!.subject).toBe('Your SageGames password was changed');

    // Reset links expire after an hour.
    await env.api.post('/portal/api/auth/forgot-password').send({ email: 'dev@example.com' });
    await settle();
    const late = lastLink('dev@example.com');
    env.clock.advance(61 * 60_000);
    expect((await env.api.post('/portal/api/auth/reset-password').send({ token: tokenFrom(late), password: 'Another-pass-2' })).body.code).toBe('invalid_token');
  });

  it('changes the password (others signed out, this session continues)', async () => {
    const a = await signUpAndVerify();
    const b = await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD });
    const bad = await env.api.post('/portal/api/auth/change-password').set(bearer(a.body.accessToken)).send({ currentPassword: 'nope', newPassword: 'Changed-pass-9' });
    expect(bad.body.code).toBe('invalid_credentials');

    const changed = await env.api.post('/portal/api/auth/change-password').set(bearer(a.body.accessToken)).send({ currentPassword: PASSWORD, newPassword: 'Changed-pass-9' });
    expect(changed.status).toBe(200);
    expect((await env.api.get('/portal/api/me').set(bearer(b.body.accessToken))).status).toBe(401);
    expect((await env.api.post('/portal/api/auth/refresh').set('Cookie', refreshCookie(b)).set(AJAX)).status).toBe(401);
    expect((await env.api.get('/portal/api/me').set(bearer(changed.body.accessToken))).status).toBe(200);
  });

  it('changes the email after the new address confirms', async () => {
    const a = await signUpAndVerify();
    await signUpAndVerify('other@example.com');
    const taken = await env.api.post('/portal/api/auth/change-email').set(bearer(a.body.accessToken)).send({ newEmail: 'other@example.com', password: PASSWORD });
    expect(taken.body.code).toBe('email_taken');

    const req = await env.api.post('/portal/api/auth/change-email').set(bearer(a.body.accessToken)).send({ newEmail: 'New@Example.com', password: PASSWORD });
    expect(req.status).toBe(202);
    const email = env.mail.last('new@example.com')!;
    expect(email.subject).toBe('Confirm your new email for SageGames');
    // Nothing changes until the link is used.
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD })).status).toBe(200);

    const confirmed = await env.api.post('/portal/api/auth/verify-email').send({ token: tokenFrom(env.mail.linkIn(email)) });
    expect(confirmed.body.user.email).toBe('new@example.com');
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'new@example.com', password: PASSWORD })).status).toBe(200);
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD })).status).toBe(401);
  });

  it('asks accounts moved from the old platform to set a password by email', async () => {
    const now = env.clock.now();
    await env.db
      .insertInto('sagegames_users')
      .values({ id: 'moved-user', email: 'moved@example.com', password_hash: null, email_verified_at: now, created_at: now, updated_at: now })
      .execute();
    const login = await env.api.post('/portal/api/auth/login').send({ email: 'moved@example.com', password: 'Anything-123' });
    expect(login.status).toBe(409);
    expect(login.body.code).toBe('password_setup_required');
    const email = env.mail.last('moved@example.com')!;
    expect(email.subject).toBe('Set a password for SageGames');

    const set = await env.api.post('/portal/api/auth/reset-password').send({ token: tokenFrom(env.mail.linkIn(email)), password: 'Fresh-start-42' });
    expect(set.status).toBe(200);
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'moved@example.com', password: 'Fresh-start-42' })).status).toBe(200);
  });

  it('rate-limits sign-in attempts per email', async () => {
    await signUpAndVerify();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: `Wrong-pass-${i}0` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // Another address from the same IP is still allowed.
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'else@example.com', password: 'Wrong-pass-00' })).status).toBe(401);
  });

  it('deletes an account (apps must go first)', async () => {
    const a = await signUpAndVerify();
    const app = await env.api.post('/portal/api/apps').set(bearer(a.body.accessToken)).send({ name: 'Mine' });
    const blocked = await env.api.post('/portal/api/auth/delete-account').set(bearer(a.body.accessToken)).send({ password: PASSWORD });
    expect(blocked.body.code).toBe('owns_apps');
    await env.api.delete(`/portal/api/apps/${app.body.id}`).set(bearer(a.body.accessToken));
    expect((await env.api.post('/portal/api/auth/delete-account').set(bearer(a.body.accessToken)).send({ password: PASSWORD })).status).toBe(204);
    expect((await env.api.get('/portal/api/me').set(bearer(a.body.accessToken))).status).toBe(401);
    expect((await env.api.post('/portal/api/auth/login').send({ email: 'dev@example.com', password: PASSWORD })).status).toBe(401);
  });
});
