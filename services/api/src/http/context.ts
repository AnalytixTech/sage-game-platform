import { AppConfig } from '../config';
import { Db } from '../db/db';
import { PortalTokenVerifier } from '../auth/portalAuth';

export interface AppContext {
  db: Db;
  config: AppConfig;
  verifyPortalToken: PortalTokenVerifier;
  /** Injectable clock for tests. */
  now: () => Date;
  log: (message: string, extra?: unknown) => void;
}

export interface HostAuth {
  tenantId: string;
  isTest: boolean;
  keyId: string | null;
}
