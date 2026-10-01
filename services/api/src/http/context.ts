import { AppConfig } from '../config';
import { Db } from '../db/db';
import { Mailer } from '../email/mailer';
import { Logger } from '../observability/logger';

export interface AppContext {
  db: Db;
  config: AppConfig;
  /** Account emails (Brevo, or logged in development). */
  mailer: Mailer;
  /** Injectable clock for tests. */
  now: () => Date;
  /** Structured, redacting logger; error-level entries with `err` also go to the error reporter. */
  logger: Logger;
}

export interface HostAuth {
  tenantId: string;
  isTest: boolean;
  keyId: string | null;
}
