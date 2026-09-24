import { LogFields, redact, redactText } from './logger';

export interface ErrorReporter {
  capture(err: unknown, msg: string, fields: LogFields): void;
  /** Send anything queued (before the process exits). */
  flush(timeoutMs?: number): Promise<void>;
}

/**
 * Report unexpected errors to Sentry when SENTRY_DSN is set. Collection is locked down: no
 * headers, cookies, bodies, query strings, user info, database query data or local variables,
 * so tokens, keys and player data never leave the server. Only the error, its stack and the
 * already-redacted log fields are sent.
 */
export async function createSentryReporter(options: { dsn: string; environment: string; release?: string }): Promise<ErrorReporter> {
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      // Belt and braces: scrub anything credential-shaped that still got in.
      delete event.request;
      delete event.user;
      if (event.message) event.message = redactText(event.message);
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = redactText(ex.value);
      if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
      return event;
    },
  });

  return {
    capture(err, msg, fields) {
      Sentry.withScope((scope) => {
        scope.setExtras({ msg, ...fields, err: undefined });
        for (const tag of ['component', 'requestId', 'matchId', 'tenantId'] as const) {
          if (typeof fields[tag] === 'string') scope.setTag(tag, fields[tag] as string);
        }
        Sentry.captureException(err instanceof Error ? err : new Error(redactText(String(err))));
      });
    },
    async flush(timeoutMs = 2000) {
      await Sentry.flush(timeoutMs);
    },
  };
}
