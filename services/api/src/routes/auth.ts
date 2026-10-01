/**
 * Portal accounts: /portal/api/auth/*. Access tokens go in the JSON body (the portal keeps them in
 * memory); the refresh token lives in an httpOnly, SameSite=Lax cookie scoped to /portal. Routes
 * that read the cookie also require the X-Requested-With header, which a cross-site form can't send.
 */
import { Request, Response, Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import {
  AccountDeps,
  changePassword,
  deleteAccount,
  forgotPassword,
  IssuedSession,
  login,
  logout,
  normalizeEmail,
  PortalUser,
  refreshSession,
  REFRESH_TOKEN_TTL_MS,
  requestEmailChange,
  resendVerification,
  resetPassword,
  signOutEverywhere,
  signup,
  verifyEmail,
} from '../auth/accounts';
import { createAuth } from '../http/auth';
import { AppContext } from '../http/context';
import { asyncHandler, HttpError, parse } from '../http/errors';

export const REFRESH_COOKIE = 'sg_refresh';
export const CSRF_HEADER = 'x-requested-with';

const email = z.string().trim().email().max(320);
const password = z.string().min(1).max(200);

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function authRoutes(ctx: AppContext, auth: ReturnType<typeof createAuth>): Router {
  const router = Router();
  const deps: AccountDeps = { db: ctx.db, config: ctx.config, mailer: ctx.mailer, logger: ctx.logger.child({ component: 'auth' }), now: ctx.now };
  const secureCookie = ctx.config.env === 'production' || ctx.config.publicBaseUrl.startsWith('https:');

  const limited = (name: string, windowMs: number, limit: number, by: 'ip' | 'email') =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      identifier: name,
      keyGenerator: (req) =>
        by === 'email' && typeof req.body?.email === 'string' ? `${name}:email:${normalizeEmail(req.body.email)}` : `${name}:ip:${ipKeyGenerator(req.ip ?? '')}`,
      skip: (req) => by === 'email' && typeof req.body?.email !== 'string',
      message: { error: 'Too many attempts. Wait a few minutes and try again.', code: 'rate_limited' },
    });
  const perIp = (name: string, windowMs: number, limit: number) => limited(name, windowMs, limit, 'ip');
  const perEmail = (name: string, windowMs: number, limit: number) => limited(name, windowMs, limit, 'email');
  const QUARTER_HOUR = 15 * 60_000;
  const HOUR = 60 * 60_000;

  const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/portal', maxAge: REFRESH_TOKEN_TTL_MS });
  const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/portal' });

  /** Answer with the access token; the refresh token only ever travels in the cookie. */
  const signedIn = (res: Response, session: IssuedSession) => {
    setRefreshCookie(res, session.refreshToken);
    res.json({ accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user });
  };

  const requireCsrfHeader = (req: Request) => {
    if (!req.headers[CSRF_HEADER]) throw new HttpError(403, 'Missing X-Requested-With header', 'csrf');
  };

  const user = (res: Response) => res.locals.user as PortalUser;

  router.post(
    '/signup',
    perIp('signup', HOUR, 20),
    perEmail('signup', HOUR, 5),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ email, password }), req.body);
      await signup(deps, body);
      res.status(202).json({ ok: true, message: 'Check your inbox for a link to confirm your email.' });
    })
  );

  router.post(
    '/resend-verification',
    perIp('resend', HOUR, 20),
    perEmail('resend', HOUR, 5),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ email }), req.body);
      await resendVerification(deps, body.email);
      res.status(202).json({ ok: true, message: 'If that account needs confirming, a new link is on its way.' });
    })
  );

  router.post(
    '/verify-email',
    perIp('verify', QUARTER_HOUR, 30),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
      signedIn(res, await verifyEmail(deps, body.token));
    })
  );

  router.post(
    '/login',
    perIp('login', QUARTER_HOUR, 30),
    perEmail('login', QUARTER_HOUR, 10),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ email, password }), req.body);
      signedIn(res, await login(deps, body));
    })
  );

  router.post(
    '/refresh',
    perIp('refresh', QUARTER_HOUR, 120),
    asyncHandler(async (req, res) => {
      requireCsrfHeader(req);
      try {
        signedIn(res, await refreshSession(deps, readCookie(req, REFRESH_COOKIE)));
      } catch (err) {
        clearRefreshCookie(res);
        throw err;
      }
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      requireCsrfHeader(req);
      const body = parse(z.object({ everywhere: z.boolean().optional() }).optional(), req.body);
      if (body?.everywhere) {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        const u = token ? await auth.portalUserFor(token) : null;
        if (!u) throw new HttpError(401, 'Please sign in again', 'unauthorized');
        await signOutEverywhere(deps, u.id);
      } else {
        await logout(deps, readCookie(req, REFRESH_COOKIE));
      }
      clearRefreshCookie(res);
      res.status(204).end();
    })
  );

  router.post(
    '/forgot-password',
    perIp('forgot', HOUR, 20),
    perEmail('forgot', HOUR, 5),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ email }), req.body);
      await forgotPassword(deps, body.email);
      res.status(202).json({ ok: true, message: 'If an account uses that email, a reset link is on its way.' });
    })
  );

  router.post(
    '/reset-password',
    perIp('reset', QUARTER_HOUR, 20),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ token: z.string().min(10).max(200), password }), req.body);
      signedIn(res, await resetPassword(deps, body));
    })
  );

  // ---- Signed in

  router.get(
    '/me',
    auth.requirePortalUser,
    asyncHandler(async (_req, res) => {
      res.json({ user: user(res) });
    })
  );

  router.post(
    '/change-password',
    auth.requirePortalUser,
    perIp('change-password', QUARTER_HOUR, 10),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ currentPassword: password, newPassword: password }), req.body);
      signedIn(res, await changePassword(deps, user(res).id, body));
    })
  );

  router.post(
    '/change-email',
    auth.requirePortalUser,
    perIp('change-email', HOUR, 10),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ newEmail: email, password }), req.body);
      await requestEmailChange(deps, user(res).id, body);
      res.status(202).json({ ok: true, message: 'Check the new inbox for a confirmation link.' });
    })
  );

  router.post(
    '/delete-account',
    auth.requirePortalUser,
    perIp('delete-account', HOUR, 10),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ password }), req.body);
      await deleteAccount(deps, user(res).id, body.password);
      clearRefreshCookie(res);
      res.status(204).end();
    })
  );

  return router;
}
