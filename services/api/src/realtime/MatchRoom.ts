import {
  ActionTuple,
  AnyGameRules,
  ClientMessage,
  MatchPlayerStatus,
  MatchStanding,
  MatchStatus,
  MatchView,
  RaceRanking,
  ServerMessage,
} from '@sagegames/types';
import { isNonNegativeInt, isRecord, Play } from '@sagegames/engine';
import { rulesFor } from '../catalog';
import { Db } from '../db/db';
import {
  FinalPlayer,
  finalizeMatch,
  loadMatch,
  loadPlayers,
  MatchPlayerRow,
  MatchRow,
  saveMatchStatus,
  savePlayerStatus,
  toView,
} from '../services/matches';

export interface RoomSocket {
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

export interface RealtimeOptions {
  /** Countdown between everyone being ready and the race starting. */
  countdownMs: number;
  /** How long a disconnected player has to come back before forfeiting. */
  graceMs: number;
  /** Server tick for timers and progress broadcasts. */
  tickMs: number;
  /** How long a finished room stays in memory (so late reconnects get the standings). */
  lingerMs: number;
}

/** How early (ms) a move may arrive before the server's countdown ends and still start the race. */
const START_TOLERANCE_MS = 250;

export const DEFAULT_REALTIME: RealtimeOptions = { countdownMs: 3000, graceMs: 30_000, tickMs: 250, lingerMs: 60_000 };

interface Slot {
  sessionId: string;
  externalUserId: string;
  displayName: string | null;
  status: MatchPlayerStatus;
  socket: RoomSocket | null;
  play: Play<unknown, unknown, never, unknown> | null;
  actions: ActionTuple[];
  lastSeq: number;
  finishedMs: number | null;
  completed: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface RoomDeps {
  db: Db;
  now: () => number;
  options: RealtimeOptions;
  log: (message: string, extra?: unknown) => void;
  onDisposed: (matchId: string) => void;
}

/** Order players by the game's race rule. Exported for tests. */
export function computeStandings(
  ranking: RaceRanking,
  players: {
    playerId: string;
    externalUserId: string;
    displayName: string | null;
    status: MatchPlayerStatus;
    score: number;
    progress: number;
    completed: boolean;
    finishedMs: number | null;
  }[]
): MatchStanding[] {
  const forfeited = (p: (typeof players)[number]) => p.status === 'forfeited';
  const sorted = players
    .filter((p) => p.status !== 'absent')
    .sort((a, b) => {
      if (forfeited(a) !== forfeited(b)) return forfeited(a) ? 1 : -1;
      if (ranking === 'time_then_score') {
        if (a.completed !== b.completed) return a.completed ? -1 : 1;
        if (a.completed && b.completed && a.finishedMs !== b.finishedMs) return (a.finishedMs ?? 0) - (b.finishedMs ?? 0);
        if (a.score !== b.score) return b.score - a.score;
        return b.progress - a.progress;
      }
      if (a.score !== b.score) return b.score - a.score;
      return (a.finishedMs ?? Infinity) - (b.finishedMs ?? Infinity);
    });
  return sorted.map((p, i) => ({ rank: i + 1, ...p }));
}

export class MatchRoom {
  public status: MatchStatus;
  private startAt: number | null = null;
  private readonly slots = new Map<string, Slot>();
  private readonly rules: AnyGameRules;
  private lobbyTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private lastProgress = '';
  private finalizing = false;
  private standings: MatchStanding[] | null;

  constructor(
    private readonly match: MatchRow,
    players: MatchPlayerRow[],
    private readonly deps: RoomDeps
  ) {
    this.status = match.status;
    this.standings = match.standings;
    this.rules = rulesFor(match.game_id)!;
    players.forEach((p) => this.addSlot(p));

    if (this.status === 'lobby') {
      const wait = Math.max(0, new Date(match.lobby_expires_at).getTime() - deps.now());
      this.lobbyTimer = setTimeout(() => this.onLobbyExpired(), wait);
    }
  }

  get matchId(): string {
    return this.match.id;
  }

  private addSlot(p: MatchPlayerRow) {
    this.slots.set(p.session_id, {
      sessionId: p.session_id,
      externalUserId: p.external_user_id,
      displayName: p.display_name,
      status: p.status,
      socket: null,
      play: null,
      actions: [],
      lastSeq: 0,
      finishedMs: p.finished_ms,
      completed: false,
      graceTimer: null,
    });
  }

  /** A player joined the lobby through the host API. */
  addPlayer(p: MatchPlayerRow) {
    if (this.slots.has(p.session_id) || this.status !== 'lobby') return;
    this.addSlot(p);
    this.broadcastMatch();
  }

  view(): MatchView {
    const live = new Map(
      [...this.slots.values()].map((s) => [
        s.sessionId,
        { connected: !!s.socket, progress: this.progressOf(s), score: this.scoreOf(s) },
      ])
    );
    const view = toView(
      { ...this.match, status: this.status, standings: this.standings },
      [...this.slots.values()].map((s) => ({
        match_id: this.match.id,
        external_user_id: s.externalUserId,
        session_id: s.sessionId,
        display_name: s.displayName,
        status: s.status,
        rank: null,
        score: null,
        finished_ms: s.finishedMs,
        joined_at: new Date(0),
      })),
      live
    );
    return { ...view, startAt: this.startAt };
  }

  // ---------------------------------------------------------------- connections

  attach(sessionId: string, socket: RoomSocket) {
    const slot = this.slots.get(sessionId);
    if (!slot) {
      socket.send({ type: 'error', code: 'not_a_player', message: 'You are not in this match' });
      return socket.close(4003, 'not_a_player');
    }
    if (slot.socket && slot.socket !== socket) slot.socket.close(4000, 'replaced by a newer connection');
    slot.socket = socket;
    if (slot.graceTimer) {
      clearTimeout(slot.graceTimer);
      slot.graceTimer = null;
    }

    socket.send({
      type: 'welcome',
      you: sessionId,
      match: this.view(),
      play: {
        gameId: this.match.game_id,
        rulesVersion: this.match.rules_version,
        seed: this.match.seed,
        config: this.match.resolved_config,
      },
      actions: slot.actions,
      serverNow: this.deps.now(),
    });
    if (this.status === 'finished' && this.standings) socket.send({ type: 'finished', standings: this.standings });
    this.broadcastMatch();
  }

  detach(sessionId: string, socket: RoomSocket) {
    const slot = this.slots.get(sessionId);
    if (!slot || slot.socket !== socket) return;
    slot.socket = null;
    const racing = this.status === 'countdown' || this.status === 'in_progress';
    if (racing && (slot.status === 'ready' || slot.status === 'playing')) {
      slot.graceTimer = setTimeout(() => this.forfeit(slot), this.deps.options.graceMs);
    }
    this.broadcastMatch();
  }

  handle(sessionId: string, socket: RoomSocket, msg: ClientMessage) {
    const slot = this.slots.get(sessionId);
    if (!slot || slot.socket !== socket) return;
    switch (msg.type) {
      case 'ping':
        return socket.send({ type: 'pong', t: msg.t, serverNow: this.deps.now() });
      case 'ready':
        if (this.status !== 'lobby' || slot.status !== 'invited') return;
        slot.status = 'ready';
        this.persistPlayer(slot);
        this.broadcastMatch();
        return this.maybeStart();
      case 'forfeit':
        return this.forfeit(slot);
      case 'action':
        return this.onAction(slot, socket, msg);
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- lifecycle

  private participants(): Slot[] {
    return [...this.slots.values()].filter((s) => s.status !== 'absent');
  }

  private maybeStart() {
    if (this.status !== 'lobby') return;
    const players = this.participants();
    if (players.length >= this.match.min_players && players.every((s) => s.status === 'ready')) this.startCountdown();
  }

  private onLobbyExpired() {
    if (this.status !== 'lobby') return;
    const ready = this.participants().filter((s) => s.status === 'ready');
    if (ready.length >= this.match.min_players) {
      // Start with whoever is ready; the rest sit this one out.
      this.participants()
        .filter((s) => s.status !== 'ready')
        .forEach((s) => {
          s.status = 'absent';
          this.persistPlayer(s);
        });
      return this.startCountdown();
    }
    this.status = 'cancelled';
    this.persistMatch();
    this.broadcastMatch();
    this.scheduleDispose();
  }

  private startCountdown() {
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.status = 'countdown';
    this.startAt = this.deps.now() + this.deps.options.countdownMs;
    this.persistMatch();
    this.broadcast({ type: 'countdown', startAt: this.startAt, serverNow: this.deps.now() });
    this.broadcastMatch();
    this.countdownTimer = setTimeout(() => this.begin(), this.deps.options.countdownMs);
  }

  private begin() {
    if (this.status !== 'countdown') return;
    this.status = 'in_progress';
    for (const slot of this.participants()) {
      if (slot.status !== 'ready') continue; // forfeited during the countdown
      slot.play = new Play(this.rules, this.match.seed, this.match.resolved_config) as Slot['play'];
      slot.status = 'playing';
      this.persistPlayer(slot);
    }
    this.persistMatch(new Date(this.startAt!));
    this.broadcast({ type: 'started', startAt: this.startAt!, serverNow: this.deps.now() });
    this.broadcastMatch();
    this.ticker = setInterval(() => this.tick(), this.deps.options.tickMs);
    if (!this.participants().some((s) => s.status === 'playing')) void this.finalize();
  }

  private raceTime(): number {
    return Math.max(0, this.deps.now() - (this.startAt ?? this.deps.now()));
  }

  private tick() {
    if (this.status !== 'in_progress') return;
    const t = this.raceTime();
    for (const slot of this.slots.values()) {
      if (slot.status !== 'playing' || !slot.play) continue;
      slot.play.advanceTo(t);
      if (slot.play.over) this.finishSlot(slot, t, 'finished');
    }
    this.broadcastProgress();
    if (!this.participants().some((s) => s.status === 'playing')) void this.finalize();
  }

  private onAction(slot: Slot, socket: RoomSocket, msg: Extract<ClientMessage, { type: 'action' }>) {
    const { seq, t, a } = msg;
    if (!isNonNegativeInt(seq) || !isNonNegativeInt(t) || !Array.isArray(a) || typeof a[0] !== 'string') {
      return socket.send({ type: 'reject', seq: Number(seq) || 0, code: 'malformed' });
    }
    if (seq <= slot.lastSeq) return socket.send({ type: 'ack', seq, t: slot.play?.lastT ?? 0 }); // resent after reconnect
    // A client's synced clock can start the race a few ms before our countdown timer fires;
    // start now rather than drop the move (race time is clamped at 0, so this is harmless).
    if (this.status === 'countdown' && this.startAt !== null && this.deps.now() >= this.startAt - START_TOLERANCE_MS) {
      if (this.countdownTimer) clearTimeout(this.countdownTimer);
      this.begin();
    }
    if (this.status !== 'in_progress' || slot.status !== 'playing' || !slot.play) {
      return socket.send({ type: 'reject', seq, code: 'not_playing' });
    }
    if (a[0].startsWith('$')) return socket.send({ type: 'reject', seq, code: 'pause_not_allowed' });
    if (slot.actions.length >= this.rules.limits.maxActions) return socket.send({ type: 'reject', seq, code: 'too_many_actions' });

    // The server's clock decides when a move happened: never in the future, never before the last one.
    const serverT = this.raceTime();
    const tEff = Math.min(Math.max(t, slot.play.lastT), serverT);
    const outcome = slot.play.apply(tEff, a[0], a[1]);
    slot.lastSeq = seq;
    if (outcome === 'invalid' || outcome === 'bad_time') return socket.send({ type: 'reject', seq, code: outcome });
    if (outcome === 'applied') slot.actions.push(a.length > 1 ? [tEff, a[0], a[1]] : [tEff, a[0]]);
    socket.send({ type: 'ack', seq, t: tEff });

    if (slot.play.over) this.finishSlot(slot, tEff, 'finished');
    this.broadcastProgress();
    if (!this.participants().some((s) => s.status === 'playing')) void this.finalize();
  }

  private forfeit(slot: Slot) {
    if (slot.graceTimer) {
      clearTimeout(slot.graceTimer);
      slot.graceTimer = null;
    }
    if (this.status === 'lobby') {
      slot.status = 'absent';
      this.persistPlayer(slot);
      this.broadcastMatch();
      return this.maybeStart();
    }
    if (this.status === 'countdown' && slot.status === 'ready') {
      slot.status = 'forfeited';
      this.persistPlayer(slot);
      return this.broadcastMatch();
    }
    if (this.status === 'in_progress' && slot.status === 'playing') {
      this.finishSlot(slot, this.raceTime(), 'forfeited');
      this.broadcastProgress();
      if (!this.participants().some((s) => s.status === 'playing')) void this.finalize();
    }
  }

  private finishSlot(slot: Slot, t: number, status: 'finished' | 'forfeited') {
    if (slot.play && !slot.play.ended) {
      slot.play.finish(Math.max(t, slot.play.lastT));
      slot.finishedMs = Math.round(slot.play.activeMs);
      slot.completed = status === 'finished' && this.rules.isOver(slot.play.state);
    }
    slot.status = status;
    this.persistPlayer(slot);
  }

  private async finalize() {
    if (this.finalizing) return;
    this.finalizing = true;
    if (this.ticker) clearInterval(this.ticker);
    const t = this.raceTime();
    for (const slot of this.slots.values()) if (slot.status === 'playing') this.finishSlot(slot, t, 'finished');

    const standings = computeStandings(
      this.rules.race.ranking,
      [...this.slots.values()].map((s) => ({
        playerId: s.sessionId,
        externalUserId: s.externalUserId,
        displayName: s.displayName,
        status: s.status,
        score: this.scoreOf(s),
        progress: this.progressOf(s),
        completed: s.completed,
        finishedMs: s.finishedMs,
      }))
    );

    const finals: FinalPlayer[] = [...this.slots.values()].map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      finishedMs: s.finishedMs,
      log: s.play
        ? {
            v: 1,
            gameId: this.match.game_id,
            rulesVersion: this.match.rules_version,
            actions: s.actions,
            endT: s.play.endT ?? t,
            reason: s.completed ? 'completed' : s.status === 'forfeited' ? 'quit' : 'timeout',
          }
        : null,
    }));

    try {
      await finalizeMatch(this.deps.db, this.match.id, standings, finals, t, new Date(this.deps.now()));
    } catch (err) {
      this.deps.log('match finalize failed', err);
    }
    this.status = 'finished';
    this.standings = standings;
    this.broadcast({ type: 'finished', standings });
    this.broadcastMatch();
    this.scheduleDispose();
  }

  // ---------------------------------------------------------------- helpers

  private scoreOf(s: Slot): number {
    return s.play ? this.rules.score(s.play.state) : 0;
  }

  private progressOf(s: Slot): number {
    if (!s.play) return 0;
    return s.completed ? 1 : this.rules.progress(s.play.state);
  }

  private broadcast(message: ServerMessage) {
    for (const s of this.slots.values()) s.socket?.send(message);
  }

  private broadcastMatch() {
    this.broadcast({ type: 'match', match: this.view(), serverNow: this.deps.now() });
  }

  private broadcastProgress() {
    const players = [...this.slots.values()].map((s) => ({
      playerId: s.sessionId,
      progress: Math.round(this.progressOf(s) * 1000) / 1000,
      score: this.scoreOf(s),
      status: s.status,
      finishedMs: s.finishedMs,
      connected: !!s.socket,
    }));
    const key = JSON.stringify(players);
    if (key === this.lastProgress) return;
    this.lastProgress = key;
    this.broadcast({ type: 'progress', players });
  }

  private persistMatch(startedAt?: Date) {
    saveMatchStatus(this.deps.db, this.match.id, this.status, startedAt).catch((err) => this.deps.log('match save failed', err));
  }

  private persistPlayer(slot: Slot) {
    savePlayerStatus(this.deps.db, this.match.id, slot.sessionId, slot.status).catch((err) => this.deps.log('player save failed', err));
  }

  private scheduleDispose() {
    setTimeout(() => this.dispose(), this.deps.options.lingerMs).unref?.();
  }

  /** Close every connection and forget the room. */
  dispose(reason?: { code: string; message: string }) {
    [this.lobbyTimer, this.countdownTimer].forEach((t) => t && clearTimeout(t));
    if (this.ticker) clearInterval(this.ticker);
    for (const s of this.slots.values()) {
      if (s.graceTimer) clearTimeout(s.graceTimer);
      if (reason) s.socket?.send({ type: 'error', ...reason });
      s.socket?.close(1001, reason?.code ?? 'match over');
      s.socket = null;
    }
    this.deps.onDisposed(this.match.id);
  }
}

/** Keeps one room per live match and loads rooms on demand. */
export class MatchHub {
  private readonly rooms = new Map<string, Promise<MatchRoom | null>>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number,
    private readonly log: (message: string, extra?: unknown) => void,
    private readonly options: RealtimeOptions = DEFAULT_REALTIME
  ) {}

  room(matchId: string): Promise<MatchRoom | null> {
    let room = this.rooms.get(matchId);
    if (!room) {
      room = this.load(matchId);
      this.rooms.set(matchId, room);
    }
    return room;
  }

  /** Only rooms already in memory (for pushing lobby changes). */
  async loadedRoom(matchId: string): Promise<MatchRoom | null> {
    return this.rooms.has(matchId) ? this.rooms.get(matchId)! : null;
  }

  private async load(matchId: string): Promise<MatchRoom | null> {
    const match = await loadMatch(this.db, null, matchId);
    // Only lobbies can be picked up from the database; a live race lives in memory only.
    if (!match || match.status !== 'lobby') {
      this.rooms.delete(matchId);
      return null;
    }
    return new MatchRoom(match, await loadPlayers(this.db, matchId), {
      db: this.db,
      now: this.now,
      options: this.options,
      log: this.log,
      onDisposed: (id) => this.rooms.delete(id),
    });
  }

  async shutdown() {
    const rooms = await Promise.all(this.rooms.values());
    rooms.forEach((r) => r?.dispose({ code: 'server_restarting', message: 'The game server is restarting' }));
  }
}

/** Parse and validate a raw client message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(msg) || typeof msg.type !== 'string') return null;
  switch (msg.type) {
    case 'auth':
      return typeof msg.token === 'string' && msg.token.length < 200 ? { type: 'auth', token: msg.token } : null;
    case 'ready':
    case 'forfeit':
      return { type: msg.type };
    case 'ping':
      return typeof msg.t === 'number' ? { type: 'ping', t: msg.t } : null;
    case 'action':
      return typeof msg.seq === 'number' && typeof msg.t === 'number' && Array.isArray(msg.a)
        ? { type: 'action', seq: msg.seq, t: msg.t, a: msg.a as [string, unknown?] }
        : null;
    default:
      return null;
  }
}
