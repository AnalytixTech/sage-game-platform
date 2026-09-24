/**
 * Structured logging: one JSON object per line in production (Render collects stdout), readable
 * lines in development, nothing in tests unless asked. Secrets are redacted before anything is
 * written or reported.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  /** Put the error in `fields.err`; it is serialised and passed to the error reporter. */
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds `bindings` to every line (e.g. { component: 'webhooks' }). */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel | 'silent';
  format?: 'json' | 'pretty';
  /** Where lines go (stdout by default). */
  write?: (line: string) => void;
  /** Called for every error-level entry with an `err` (e.g. to send it to Sentry). */
  onError?: (err: unknown, msg: string, fields: LogFields) => void;
  bindings?: LogFields;
}

/** Field names whose values are never logged. */
const SECRET_FIELD = /^(authorization|cookie|set-cookie|password|secret|token|key|apikey|api_key|sessiontoken|playertoken|webhooksecret|webhook_secret|pepper|access_token|refresh_token)$/i;
/** Credentials this platform issues, wherever they appear in text. */
const SECRET_VALUE = /\b(sk_(?:live|test)_[A-Za-z0-9_]+|stk_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._~+/=-]+)/g;

/** The password in a connection string (a driver error can echo DATABASE_URL). */
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:)[^@\s]+@/gi;

export function redactText(text: string): string {
  return text
    .replace(SECRET_VALUE, (m) => (m.startsWith('Bearer') ? 'Bearer [redacted]' : `${m.slice(0, m.indexOf('_', 3) + 1)}[redacted]`))
    .replace(URL_PASSWORD, '$1[redacted]@');
}

/** Deep copy with secrets removed; errors become plain objects. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redactText(value);
  if (value instanceof Error) return serializeError(value, depth);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out: LogFields = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELD.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function serializeError(err: Error, depth: number): LogFields {
  const extra = err as Error & { code?: unknown; status?: unknown; cause?: unknown };
  return {
    type: err.name,
    message: redactText(err.message),
    ...(extra.code !== undefined ? { code: extra.code } : {}),
    ...(extra.status !== undefined ? { status: extra.status } : {}),
    ...(err.stack ? { stack: redactText(err.stack) } : {}),
    ...(extra.cause !== undefined ? { cause: redact(extra.cause, depth + 1) } : {}),
  };
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = LEVELS[options.level ?? 'info'];
  const format = options.format ?? 'json';
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const bindings = options.bindings ?? {};

  const emit = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    if (level === 'error' && fields.err !== undefined) {
      try {
        options.onError?.(fields.err, msg, { ...bindings, ...(redact(fields) as LogFields) });
      } catch {
        // Reporting must never break the request that failed.
      }
    }
    if (LEVELS[level] < threshold) return;
    const entry = redact({ level, time: new Date().toISOString(), msg, ...bindings, ...fields }) as LogFields;
    write(format === 'json' ? JSON.stringify(entry) : pretty(entry));
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (more) => createLogger({ ...options, bindings: { ...bindings, ...more } }),
  };
}

function pretty(entry: LogFields): string {
  const { level, time, msg, err, ...rest } = entry;
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  const error = err && typeof err === 'object' ? `\n  ${(err as { stack?: string; message?: string }).stack ?? (err as { message?: string }).message}` : '';
  return `${String(time).slice(11, 23)} ${String(level).toUpperCase().padEnd(5)} ${msg}${extras}${error}`;
}

/** A logger that writes nothing (tests). */
export const silentLogger: Logger = createLogger({ level: 'silent' });
