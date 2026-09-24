import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { Logger } from './logger';

const INCOMING_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

/**
 * Give every request an id (kept from X-Request-Id when a proxy sets a sane one), echo it back,
 * and log one line when the response is sent. Query strings are left out of the log.
 */
export function requestLog(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : crypto.randomBytes(8).toString('hex');
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (req.path === '/healthz') return next();

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const fields = {
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        tenantId: (res.locals.host as { tenantId?: string } | undefined)?.tenantId,
        code: res.locals.errorCode,
      };
      if (res.statusCode >= 500) logger.warn('request failed', fields);
      else logger.info('request', fields);
    });
    next();
  };
}
