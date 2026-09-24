import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { Logger } from '../observability/logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

/** Wrap an async route so rejected promises reach the error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Parse a request part with a zod schema, answering 400 with the issues on failure. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'Invalid request', 'invalid_request', details);
  }
  return result.data;
}

export function errorMiddleware(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.locals.errorCode = err.code;
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large', code: 'too_large' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON body', code: 'invalid_json' });
    }
    logger.error('unhandled error', {
      component: 'http',
      err,
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
    });
    res.status(500).json({ error: 'Internal server error', code: 'internal' });
  };
}
