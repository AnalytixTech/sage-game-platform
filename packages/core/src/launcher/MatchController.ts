import {
  AnyGameRules,
  ClientMessage,
  MatchStanding,
  MatchView,
  ServerMessage,
  WelcomeMessage,
} from '@sagegames/types';
import { GameRuntime } from '../runtime/GameRuntime';
import { PlayableRuntime, RemoteRuntime } from '../runtime/RemoteRuntime';

export type MatchPhase =
  | 'connecting'
  | 'lobby'
  | 'countdown'
  | 'playing'
  /** You're done (finished or forfeited); others are still racing. */
  | 'waiting'
  | 'finished'
  | 'cancelled'
  | 'error';

export interface MatchSeat {
  matchId: string;
  playerToken: string;
}

export interface MatchError {
  message: string;
  code?: string;
  retryable: boolean;
}

export interface MatchState {
  phase: MatchPhase;
  match: MatchView | null;
  /** Your player id. */
  you: string | null;
  rules: AnyGameRules | null;
  /** Local play, or (games with hidden information) the server's view of your game. */
  runtime: PlayableRuntime | null;
  /** Local time (ms) the race starts, for the countdown. */
  startsAtLocal: number | null;
  standings: MatchStanding[] | null;
  connected: boolean;
  reconnecting: boolean;
  error: MatchError | null;
}

/** Minimal WebSocket surface (browser, React Native and the `ws` package all fit). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface MatchControllerOptions {
  /** API origin (http/https); the socket connects to <origin>/v2/ws. */
  baseUrl: string;
  resolveRules: (gameId: string) => AnyGameRules | undefined;
  /** Your seat: from your backend, which calls POST /v2/matches/:id/tokens or /players. */
  seat?: MatchSeat;
  getSeat?: () => Promise<MatchSeat>;
  createSocket?: (url: string) => WebSocketLike;
  now?: () => number;
  onStandings?: (standings: MatchStanding[]) => void;
  /** Delays between reconnect attempts. */
  reconnectDelaysMs?: number[];
}

const OPEN = 1;
/** Close codes after which reconnecting is pointless. */
const FINAL_CLOSE = new Set([4001, 4003, 4004, 4008]);

/**
 * Drives one online battle: connect → lobby → countdown → race → standings.
 * Moves are applied locally for instant feedback and streamed to the server, which is
 * authoritative. React bindings subscribe via subscribe/getSnapshot.
 */
export class MatchController {
  private state: MatchState = {
    phase: 'connecting',
    match: null,
    you: null,
    rules: null,
    runtime: null,
    startsAtLocal: null,
    standings: null,
    connected: false,
    reconnecting: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private socket: WebSocketLike | null = null;
  private seat: MatchSeat | null = null;
  private play: WelcomeMessage['play'] | null = null;
  /** Hidden-information games: the latest view of your game from the server. */
  private view: { state: unknown; t: number } | null = null;
  /** Server time the race started, once it has. */
  private raceStartAt: number | null = null;
  /** Server clock minus local clock, from the best (lowest round-trip) ping. */
  private offset = 0;
  private bestRtt = Infinity;
  private seq = 0;
  private attempt = 0;
  private disposed = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: MatchControllerOptions) {
    if (!options.seat && !options.getSeat) throw new Error('MatchController needs `seat` or `getSeat`');
    this.now = options.now ?? Date.now;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): MatchState => this.state;

  public async connect(): Promise<void> {
    if (this.disposed) return;
    try {
      this.seat = this.seat ?? this.options.seat ?? (await this.options.getSeat!());
    } catch (err) {
      return this.fail({ message: err instanceof Error ? err.message : 'Could not join the match', retryable: true });
    }
    this.open();
  }

  /** Mark yourself ready in the lobby. */
  public ready(): void {
    this.send({ type: 'ready' });
  }

  /** Leave the lobby, or give up the race (your score so far still counts). */
  public forfeit(): void {
    this.send({ type: 'forfeit' });
    this.state.runtime?.finish('quit');
    if (this.state.phase === 'playing') this.set({ phase: 'waiting' });
  }

  /** Advance local timers (call on an interval while racing). */
  public tick(): void {
    if (this.state.phase === 'playing') this.state.runtime?.tick();
  }

  public async retry(): Promise<void> {
    if (!this.state.error?.retryable) return;
    this.attempt = 0;
    this.set({ error: null, phase: this.state.match ? this.phaseFor(this.state.match) : 'connecting' });
    if (!this.seat) return this.connect();
    this.open();
  }

  public dispose(): void {
    this.disposed = true;
    [this.startTimer, this.reconnectTimer].forEach((t) => t && clearTimeout(t));
    if (this.pingTimer) clearInterval(this.pingTimer);
    const s = this.socket;
    this.socket = null;
    s?.close(1000, 'left');
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- socket

  private wsUrl(): string {
    return `${this.options.baseUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/v2/ws`;
  }

  private open() {
    const create = this.options.createSocket ?? ((url: string) => new (globalThis as unknown as { WebSocket: new (u: string) => WebSocketLike }).WebSocket(url));
    const socket = create(this.wsUrl());
    this.socket = socket;

    socket.onopen = () => {
      if (socket !== this.socket) return;
      socket.send(JSON.stringify({ type: 'auth', token: this.seat!.playerToken } satisfies ClientMessage));
    };
    socket.onmessage = (ev) => {
      if (socket !== this.socket) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    socket.onclose = (ev) => {
      if (socket !== this.socket || this.disposed) return;
      this.socket = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.set({ connected: false });
      const { phase } = this.state;
      if (phase === 'finished' || phase === 'cancelled' || phase === 'error') return;
      if (ev.code !== undefined && FINAL_CLOSE.has(ev.code)) return; // an 'error' message explains it
      this.scheduleReconnect();
    };
    socket.onerror = () => undefined; // onclose follows
  }

  private scheduleReconnect() {
    const delays = this.options.reconnectDelaysMs ?? [500, 1000, 2000, 4000, 8000, 8000];
    if (this.attempt >= delays.length) {
      return this.fail({ message: 'Lost connection to the match.', code: 'connection_lost', retryable: true });
    }
    this.set({ reconnecting: true });
    this.reconnectTimer = setTimeout(() => this.open(), delays[this.attempt++]);
  }

  private send(msg: ClientMessage) {
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  private startPings() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = () => this.send({ type: 'ping', t: this.now() });
    ping();
    this.pingTimer = setInterval(ping, 5000);
  }

  // ---------------------------------------------------------------- messages

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'welcome':
        return this.onWelcome(msg);
      case 'match':
        this.syncClock(msg.serverNow);
        return this.set({ match: msg.match, phase: this.phaseFor(msg.match) });
      case 'countdown':
        return this.scheduleStart(msg.startAt, msg.serverNow);
      case 'started':
        this.syncClock(msg.serverNow);
        return this.beginRace(msg.startAt);
      case 'progress':
        return this.onProgress(msg.players);
      case 'state': {
        this.view = { state: msg.state, t: msg.t };
        const runtime = this.state.runtime;
        if (runtime instanceof RemoteRuntime) return runtime.receive(msg.state, msg.t);
        if (!runtime && this.raceStartAt !== null) this.beginRace(this.raceStartAt);
        return;
      }
      case 'finished':
        this.state.runtime?.finish('completed');
        this.set({ phase: 'finished', standings: msg.standings });
        this.options.onStandings?.(msg.standings);
        return;
      case 'pong': {
        const rtt = this.now() - msg.t;
        if (rtt < this.bestRtt) {
          this.bestRtt = rtt;
          this.offset = msg.serverNow - (msg.t + rtt / 2);
        }
        return;
      }
      case 'error': {
        const final = ['invalid_token', 'not_a_player', 'match_closed', 'token_expired', 'auth_timeout', 'unauthenticated'].includes(msg.code);
        if (final || msg.code === 'server_restarting') {
          return this.fail({ message: friendlyError(msg.code, msg.message), code: msg.code, retryable: !final });
        }
        return;
      }
      default:
        return; // ack / reject: the server's state arrives in progress messages
    }
  }

  private onWelcome(msg: WelcomeMessage) {
    this.attempt = 0;
    this.syncClock(msg.serverNow);
    this.play = msg.play;
    this.view = msg.state !== undefined ? { state: msg.state, t: 0 } : null;
    const rules = this.options.resolveRules(msg.play.gameId);
    if (!rules) return this.fail({ message: `This app cannot render game ${msg.play.gameId}`, code: 'game_not_supported', retryable: false });
    if (rules.rulesVersion !== msg.play.rulesVersion) {
      return this.fail({ message: 'This game has been updated. Please update the app to play it.', code: 'sdk_update_required', retryable: false });
    }
    this.set({ you: msg.you, match: msg.match, rules, connected: true, reconnecting: false, phase: this.phaseFor(msg.match) });
    this.startPings();

    const startAt = msg.match.startAt;
    if (msg.match.status === 'countdown' && startAt) this.scheduleStart(startAt, msg.serverNow);
    if (msg.match.status === 'in_progress' && startAt) {
      // Reconnected mid-race: rebuild the board from the moves the server already applied.
      this.state.runtime = null;
      this.beginRace(startAt, msg.actions);
    }
  }

  private syncClock(serverNow: number) {
    if (this.bestRtt === Infinity) this.offset = serverNow - this.now();
  }

  private scheduleStart(startAt: number, serverNow: number) {
    this.syncClock(serverNow);
    const startsAtLocal = startAt - this.offset;
    this.set({ phase: 'countdown', startsAtLocal });
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => this.beginRace(startAt), Math.max(0, startsAtLocal - this.now()));
  }

  private sendAction(t: number, type: string, payload?: unknown) {
    this.send({ type: 'action', seq: ++this.seq, t, a: payload === undefined ? [type] : [type, payload] });
  }

  private beginRace(startAt: number, restore?: WelcomeMessage['actions']) {
    if (this.state.runtime || !this.state.rules || !this.play) return;
    this.raceStartAt = startAt;
    const rules = this.state.rules;
    let runtime: PlayableRuntime;

    if (this.play.hidden) {
      // The board appears with the server's first view of it (sent as the race starts).
      if (!this.view) return this.set({ phase: 'playing', startsAtLocal: startAt - this.offset });
      const remote = new RemoteRuntime({
        rules,
        state: this.view.state,
        startedAt: startAt - this.offset,
        now: this.now,
        send: (t, type, payload) => this.sendAction(t, type, payload),
      });
      remote.receive(this.view.state, this.view.t);
      runtime = remote;
    } else {
      const local = new GameRuntime({
        rules,
        seed: this.play.seed!,
        config: this.play.config ?? {},
        now: this.now,
        onAction: ([t, type, payload]) => this.sendAction(t, type, payload),
      });
      local.start(startAt - this.offset);
      if (restore?.length) local.restore(restore);
      runtime = local;
    }

    runtime.subscribe(() => {
      if (runtime.getSnapshot().ended && this.state.phase === 'playing') this.set({ phase: 'waiting' });
    });
    const mine = this.state.match?.players.find((p) => p.playerId === this.state.you);
    const done = runtime.getSnapshot().ended || (mine && (mine.status === 'finished' || mine.status === 'forfeited'));
    this.set({ runtime, phase: done ? 'waiting' : 'playing', startsAtLocal: startAt - this.offset });
  }

  private onProgress(players: Extract<ServerMessage, { type: 'progress' }>['players']) {
    const match = this.state.match;
    if (!match) return;
    const byId = new Map(players.map((p) => [p.playerId, p]));
    const next: MatchView = {
      ...match,
      players: match.players.map((p) => ({ ...p, ...(byId.get(p.playerId) ?? {}) })),
    };
    const mine = byId.get(this.state.you ?? '');
    // The server decides when you're done (e.g. its timer ran out first).
    if (mine && (mine.status === 'finished' || mine.status === 'forfeited') && this.state.phase === 'playing') {
      this.state.runtime?.finish(mine.status === 'forfeited' ? 'quit' : 'completed');
      return this.set({ match: next, phase: 'waiting' });
    }
    this.set({ match: next });
  }

  private phaseFor(match: MatchView): MatchPhase {
    if (this.state.phase === 'error') return 'error';
    switch (match.status) {
      case 'lobby':
        return 'lobby';
      case 'countdown':
        return 'countdown';
      case 'in_progress': {
        const mine = match.players.find((p) => p.playerId === this.state.you);
        if (mine && (mine.status === 'finished' || mine.status === 'forfeited' || mine.status === 'absent')) return 'waiting';
        return this.state.runtime ? (this.state.runtime.getSnapshot().ended ? 'waiting' : 'playing') : this.state.phase;
      }
      case 'finished':
        return 'finished';
      case 'cancelled':
      case 'aborted':
        return 'cancelled';
    }
  }

  private fail(error: MatchError) {
    this.set({ phase: 'error', error, reconnecting: false });
  }

  private set(patch: Partial<MatchState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}

function friendlyError(code: string, fallback: string): string {
  switch (code) {
    case 'invalid_token':
    case 'token_expired':
      return 'This match invite is no longer valid.';
    case 'match_closed':
      return 'This match has already ended.';
    case 'not_a_player':
      return "You're not in this match.";
    case 'server_restarting':
      return 'The game server restarted. Try again in a moment.';
    default:
      return fallback;
  }
}
