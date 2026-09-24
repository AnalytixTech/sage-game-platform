import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { ServerMessage } from '@sagegames/types';
import { sha256Hex } from '../auth/keys';
import { one } from '../db/db';
import { SessionRow } from '../http/auth';
import { AppContext } from '../http/context';
import { MatchHub, parseClientMessage, RoomSocket } from './MatchRoom';

export const WS_PATH = '/v2/ws';
const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15_000;
/** More than this many messages in one second closes the connection. */
const MAX_MESSAGES_PER_SECOND = 40;

/**
 * Battle connections on /v2/ws. The first message must be { type: 'auth', token } with a match
 * seat token (never in the URL, so it doesn't end up in logs).
 */
export function attachRealtime(server: http.Server, ctx: AppContext, hub: MatchHub) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    const socket: RoomSocket = {
      send: (message: ServerMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(message)),
      close: (code, reason) => ws.close(code, reason),
    };
    const fail = (code: string, message: string, closeCode = 4001) => {
      socket.send({ type: 'error', code, message });
      ws.close(closeCode, code);
    };

    let seat: { sessionId: string; matchId: string } | null = null;
    let authenticating = false;
    const authTimer = setTimeout(() => !seat && fail('auth_timeout', 'Authenticate within 5 seconds'), AUTH_TIMEOUT_MS);
    let windowStart = Date.now();
    let count = 0;

    ws.on('message', async (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MESSAGES_PER_SECOND) return fail('rate_limited', 'Too many messages', 4008);

      const msg = parseClientMessage(data.toString());
      if (!msg) return socket.send({ type: 'error', code: 'malformed', message: 'Unrecognised message' });

      if (!seat) {
        if (msg.type !== 'auth' || authenticating) return fail('unauthenticated', 'Send { type: "auth", token } first');
        authenticating = true;
        const session = await one<SessionRow>(ctx.db, 'SELECT * FROM game_sessions WHERE session_token_hash = $1', [sha256Hex(msg.token)]);
        if (!session || session.mode !== 'match' || !session.match_id) return fail('invalid_token', 'Invalid match token');
        if (new Date(session.expires_at).getTime() <= ctx.now().getTime()) return fail('token_expired', 'This match seat has expired');
        const room = await hub.room(session.match_id);
        if (!room) return fail('match_closed', 'This match is no longer running', 4004);
        clearTimeout(authTimer);
        seat = { sessionId: session.id, matchId: session.match_id };
        room.attach(seat.sessionId, socket);
        return;
      }

      const room = await hub.room(seat.matchId);
      room?.handle(seat.sessionId, socket, msg);
    });

    ws.on('close', async () => {
      clearTimeout(authTimer);
      if (!seat) return;
      const room = await hub.loadedRoom(seat.matchId);
      room?.detach(seat.sessionId, socket);
    });

    ws.on('error', (err) => ctx.logger.warn('websocket error', { component: 'ws', err }));
  });

  return {
    close: async () => {
      clearInterval(heartbeat);
      await hub.shutdown();
      wss.close();
    },
  };
}
