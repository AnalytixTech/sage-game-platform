/** Host-supplied game config is invalid. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type ReplayRejectCode =
  | 'malformed_log'
  | 'game_mismatch'
  | 'rules_version_mismatch'
  | 'too_many_actions'
  | 'bad_timestamp'
  | 'invalid_action'
  | 'time_exceeds_server';

/** The action log cannot have been produced by an honest client; the result must be rejected. */
export class ReplayRejected extends Error {
  constructor(public readonly code: ReplayRejectCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ReplayRejected';
  }
}
