import { ActionLog, ActionLogEndReason, ActionTuple } from '@sagegames/types';
import { ReplayRejected } from './errors';
import { isNonNegativeInt, isRecord } from './util';

const END_REASONS: readonly ActionLogEndReason[] = ['completed', 'quit', 'timeout'];
const MAX_TYPE_LENGTH = 32;

/** Validate the shape of an untrusted action log. Throws ReplayRejected('malformed_log'). */
export function parseActionLog(raw: unknown): ActionLog {
  const fail = (detail: string): never => {
    throw new ReplayRejected('malformed_log', detail);
  };

  if (!isRecord(raw)) return fail('log must be an object');
  if (raw.v !== 1) fail('unsupported log version');
  if (typeof raw.gameId !== 'string') fail('gameId must be a string');
  if (!isNonNegativeInt(raw.rulesVersion)) fail('rulesVersion must be an integer');
  if (!Array.isArray(raw.actions)) fail('actions must be an array');
  if (!isNonNegativeInt(raw.endT)) fail('endT must be a non-negative integer');
  if (typeof raw.reason !== 'string' || !END_REASONS.includes(raw.reason as ActionLogEndReason)) {
    fail('reason must be completed, quit or timeout');
  }
  if (raw.clientScore !== undefined && typeof raw.clientScore !== 'number') {
    fail('clientScore must be a number');
  }

  const actions: ActionTuple[] = (raw.actions as unknown[]).map((entry, i) => {
    if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) {
      return fail(`actions[${i}] must be [t, type, payload?]`);
    }
    const [t, type, payload] = entry;
    if (!isNonNegativeInt(t)) return fail(`actions[${i}].t must be a non-negative integer`);
    if (typeof type !== 'string' || type.length === 0 || type.length > MAX_TYPE_LENGTH) {
      return fail(`actions[${i}].type must be a short string`);
    }
    return entry.length === 3 ? [t, type, payload] : [t, type];
  });

  return {
    v: 1,
    gameId: raw.gameId as string,
    rulesVersion: raw.rulesVersion as number,
    actions,
    endT: raw.endT as number,
    reason: raw.reason as ActionLogEndReason,
    clientScore: raw.clientScore as number | undefined,
  };
}
