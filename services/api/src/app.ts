import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { BootstrapKey, createAuth } from './http/auth';
import { AppContext } from './http/context';
import { errorMiddleware, HttpError } from './http/errors';
import { requestLog } from './observability/requestLog';
import { MatchHub, RealtimeOptions, DEFAULT_REALTIME } from './realtime/MatchRoom';
import { matchRoutes } from './routes/matches';
import { portalRoutes } from './routes/portal';
import { v1Routes } from './routes/v1';
import { v2Routes } from './routes/v2';

export interface AppOptions {
  bootstrapKeys?: BootstrapKey[];
  /** Built developer portal (services/portal/dist). Served at /portal when present. */
  portalDir?: string;
  /** Battle timings (tests shorten them). */
  realtime?: Partial<RealtimeOptions>;
}

/** Game API: bearer tokens only (no cookies), so any origin may call it. */
function cors(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export function createApp(ctx: AppContext, options: AppOptions = {}) {
  const app = express();
  const auth = createAuth(ctx, options.bootstrapKeys ?? []);
  const hub = new MatchHub(ctx.db, () => ctx.now().getTime(), ctx.logger.child({ component: 'matches' }), {
    ...DEFAULT_REALTIME,
    ...options.realtime,
  });
  // server.ts attaches the WebSocket endpoint to the same hub.
  app.locals.matchHub = hub;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", ctx.config.supabaseUrl],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(requestLog(ctx.logger.child({ component: 'http' })));
  app.use(express.json({ limit: '256kb' }));

  app.get(
    '/healthz',
    (_req, res, next) => {
      ctx.db
        .query('SELECT 1')
        .then(() => res.json({ ok: true }))
        .catch(next);
    }
  );

  app.use('/v1', cors, v1Routes(ctx, auth));
  app.use('/v2/matches', cors, matchRoutes(ctx, auth, hub));
  app.use('/v2', cors, v2Routes(ctx, auth));
  app.use('/portal/api', portalRoutes(ctx, auth));

  const portalDir = options.portalDir;
  if (portalDir && fs.existsSync(path.join(portalDir, 'index.html'))) {
    app.use('/portal', express.static(portalDir, { index: 'index.html', maxAge: '1h' }));
    // Single-page app: unknown /portal paths load the app shell.
    app.get(/^\/portal(\/.*)?$/, (_req, res) => res.sendFile(path.join(portalDir, 'index.html')));
  }
  app.get('/', (_req, res) => res.redirect('/portal/'));

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found')));
  app.use(errorMiddleware(ctx.logger));
  return app;
}
