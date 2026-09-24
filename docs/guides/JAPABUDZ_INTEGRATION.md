# Integrating SageGames 2.0 into Japabudz

This guide replaces the current SageGames integration in **Japabudz-App** and adds the pieces it was missing in **japabudz-server**. When it's done:

- Players in a DM or a group chat open a game, actually play it, and get a **score verified by the server**. There are no more tap-for-points buttons or random scores.
- The SageGames API key lives only in japabudz-server. It's no longer inside the mobile app.
- Each chat and group gets its own leaderboard.
- japabudz-server gets a signed webhook for every finished game, so it can post results into the chat or award rewards.

Allow about half a day. Steps 1–3 are on the server and steps 4–7 are in the app.

## Why the current integration doesn't work

| Problem today | Where | Fixed by |
| --- | --- | --- |
| The host key `sec_campus_secret_123` ships inside the app, and the platform now rejects it | `lib/api/sage-game.ts` | Steps 1–2: the key moves to japabudz-server |
| A failed session request silently falls back to a fake token | `fetchSageGameSessionToken` | Step 5: errors are shown instead |
| The game screen is a mock: taps add +150/+250/+300, and "Complete" awards a random 1200–2000 | `components/sage-game/SageGameModal.tsx` | Step 6: the real game screens from the SDK |
| `@sagegames/react-native@1.0.0` rendered web `<div>`s, which can't draw on a phone | package | Step 4: version 2 is built on React Native components |
| IMMIGRATION and SCHOLARSHIP never appeared in Word Search (11 letters on a 10-wide grid) | word-search config | Fixed in the game: the grid grows to fit |

---

## 1. Get an API key

1. Open the SageGames developer portal at `https://sage-game-platform.onrender.com/portal/` and create an account. Confirm your email, then sign in.
2. Click **New app**, name it **Japabudz**, and tick the games Japabudz uses (all five).
3. On **API keys**, create:
   - a **Live** key labelled `japabudz-server production`
   - a **Test** key labelled `japabudz-server staging`. Scores from a test key never reach leaderboards.
4. Copy each key when it's shown. It's only displayed once.
5. On **Webhook**, set `https://<japabudz-server>/api/webhooks/sagegames` and copy the signing secret (`whsec_…`).

Add these to japabudz-server's environment (`.env` locally, the hosting dashboard in production). Never add them to the app or to any `EXPO_PUBLIC_*` variable:

```env
SAGEGAMES_API_URL=https://sage-game-platform.onrender.com
SAGEGAMES_API_KEY=sk_live_…
SAGEGAMES_WEBHOOK_SECRET=whsec_…
```

## 2. japabudz-server: an endpoint that starts a game

Create `src/routes/v2/games.routes.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/prisma';
import { authenticateToken, requireApprovedUser } from '../../middleware/auth.middleware';

const router = Router();

const SAGEGAMES_API_URL = process.env.SAGEGAMES_API_URL ?? 'https://sage-game-platform.onrender.com';

/** Word Search terms used across Japabudz (sent with every Word Search session). */
const WORD_SEARCH_CONFIG = {
  categoryName: 'Japa Terms',
  wordSelectionMode: 'custom_only',
  words: [
    { token: 'PASSPORT', display: 'Passport', definition: 'Travel document' },
    { token: 'VISA', display: 'Visa', definition: 'Entry authorization' },
    { token: 'IMMIGRATION', display: 'Immigration', definition: 'Relocating to another country' },
    { token: 'CAMPUS', display: 'Campus', definition: 'University grounds' },
    { token: 'SCHOLARSHIP', display: 'Scholarship', definition: 'Financial grant for education' },
  ],
  difficulty: 'medium',
};

const GAME_CONFIG: Record<string, Record<string, unknown>> = {
  game_word_search_001: WORD_SEARCH_CONFIG,
  game_sudoku_001: { variant: '7x7_irregular', difficulty: 'medium' },
};

const body = z
  .object({
    gameId: z.string().min(1).max(64),
    conversationId: z.string().optional(),
    groupId: z.string().optional(),
  })
  .refine((b) => !(b.conversationId && b.groupId), 'Send conversationId or groupId, not both');

/**
 * POST /api/v2/games/sessions
 * Starts a SageGames session for the signed-in user and returns { sessionId, sessionToken }.
 * With a conversationId/groupId the user must belong to that chat, and scores go on that
 * chat's leaderboard.
 */
router.post('/sessions', authenticateToken, requireApprovedUser, async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  const { gameId, conversationId, groupId } = parsed.data;
  const user = req.user!;

  let contextId: string | undefined;
  if (conversationId) {
    const convo = await prisma.conversation.findFirst({
      where: { id: conversationId, participants: { has: user.id } },
      select: { id: true },
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    contextId = `dm:${convo.id}`;
  } else if (groupId) {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
      select: { groupId: true },
    });
    if (!membership) return res.status(404).json({ error: 'Group not found' });
    contextId = `group:${groupId}`;
  }

  const response = await fetch(`${SAGEGAMES_API_URL}/v2/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SAGEGAMES_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      externalUserId: user.id,
      displayName: user.firstName || user.username,
      contextId,
      config: GAME_CONFIG[gameId],
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error('[sagegames] session failed', response.status, result);
    return res.status(response.status === 403 ? 403 : 502).json({ error: 'Could not start the game. Please try again.' });
  }

  // Only the session credentials go to the app.
  res.json({ sessionId: result.sessionId, sessionToken: result.sessionToken });
});

export default router;
```

Mount it in `src/routes/v2/index.ts`:

```ts
import gameRoutes from './games.routes';
// …
router.use('/games', gameRoutes);
```

**Japa quiz questions.** To ask players your own questions (visas, relocation, study abroad), open the portal's **Quiz banks** tab, create a bank with id `japa`, and paste the questions in from a spreadsheet. Then add `game_quiz_001: { bankId: 'japa', questionCount: 10 }` to `GAME_CONFIG`. In battles the answers stay on the server until each question is answered, so they can't be read out of the app.

> The platform checks the game config (for example, a Word Search word longer than 15 letters is reported back), so a bad config fails loudly with `400 invalid_config` instead of producing a broken game.

## 3. japabudz-server: receive verified results

The signature covers the exact bytes SageGames sends, so this route needs the **raw** body. In `src/app.ts`, register it **before** `app.use(express.json(...))` (currently line 60):

```ts
import crypto from 'crypto';

app.post('/api/webhooks/sagegames', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verifySageSignature(process.env.SAGEGAMES_WEBHOOK_SECRET!, raw, req.header('Sage-Signature') ?? '')) {
    return res.status(400).send('invalid signature');
  }
  const event = JSON.parse(raw);
  res.sendStatus(200); // acknowledge fast; failures are retried with backoff

  if (event.type === 'session.completed' && event.data.valid) {
    const { externalUserId, contextId, gameId, score } = event.data;
    // e.g. post "Ada scored 1,250 in Word Search 🎉" into the chat named by contextId
    // ("dm:<conversationId>" or "group:<groupId>"), or award rewards to externalUserId.
  }
});

/** Sage-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> */
function verifySageSignature(secret: string, body: string, header: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300 || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

The event body looks like this:

```json
{
  "id": "evt_42",
  "type": "session.completed",
  "tenantId": "app_…",
  "createdAt": "2026-09-24T12:00:05.000Z",
  "data": {
    "sessionId": "sess_…", "gameId": "game_word_search_001",
    "externalUserId": "<japabudz user id>", "displayName": "Ada", "contextId": "group:abc",
    "status": "verified", "valid": true, "score": 1250, "durationMs": 84000,
    "result": { "wordsFound": 5, "totalWords": 5 }, "flags": [], "rejectCode": null,
    "completedAt": "2026-09-24T12:00:04.000Z"
  }
}
```

Only act on `valid: true`. Results flagged as implausible, rejected, or made with a test key arrive with `valid: false`.

---

## 4. Japabudz-App: install SDK 2.0

```bash
npm install @sagegames/react-native@^2.1.0
npm uninstall @sagegames/types     # it now comes with the SDK
```

The SDK uses only core React Native components (`View`, `Text`, `Pressable`, `Animated`, `PanResponder`). There are no native modules and no config plugin, so no rebuild or `expo prebuild` is needed. `@react-native-async-storage/async-storage` is already in the app and is used to keep unsent results.

## 5. Japabudz-App: replace `lib/api/sage-game.ts`

Delete the whole file's contents (including `SAGE_GAME_SECRET_KEY`, the fallback tokens and the local game configs; the configs now live on the server) and replace them with:

```ts
import apiClient from './client';

export const SAGE_GAME_API_URL = 'https://sage-game-platform.onrender.com';

export interface GameChat {
  conversationId?: string;
  groupId?: string;
}

/** Ask japabudz-server to start a game. Throws if it can't: no fake fallback tokens. */
export async function createGameSession(gameId: string, chat: GameChat = {}) {
  const { data } = await apiClient.post<{ sessionId: string; sessionToken: string }>('/v2/games/sessions', {
    gameId,
    ...chat,
  });
  return data;
}
```

`apiClient` already adds the user's auth token, so the server knows who is playing.

## 6. Japabudz-App: provider and theme

In `app/_layout.tsx`, replace the current `<SageGameProvider baseUrl={SAGE_GAME_BASE_URL}>` with:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allGames, darkNavyTheme, SageGameProvider } from '@sagegames/react-native';
import { SAGE_GAME_API_URL } from '@/lib/api/sage-game';
import { PALETTE } from '@/constants/design-tokens';
import { FONTS } from '@/constants/fonts';

const SAGE_THEME = {
  colors: { primary: PALETTE.primary, background: '#000B21', surface: '#0F1B38' },
  fonts: { regular: FONTS.Regular, medium: FONTS.SemiBold, bold: FONTS.Bold },
};

// …
<SageGameProvider
  games={allGames}
  baseUrl={SAGE_GAME_API_URL}
  theme={darkNavyTheme}
  themeOverrides={SAGE_THEME}
  pendingStore={AsyncStorage}
>
```

Define `SAGE_THEME` outside the component, as shown, so it isn't recreated on every render. Every colour, radius, spacing value, font and label can be overridden. See [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md#theming-and-labels).

## 7. Japabudz-App: rewrite `SageGameModal`

Replace `components/sage-game/SageGameModal.tsx` with this much smaller version. It uses the SDK's catalog, launcher, results and leaderboard instead of the mock player:

```tsx
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StatusBar, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Game, GameCatalog, GameLauncher, useSage } from '@sagegames/react-native';
import { createGameSession, GameChat } from '@/lib/api/sage-game';
import { FONTS } from '@/constants/fonts';

export interface SageGameModalProps extends GameChat {
  visible: boolean;
  onClose: () => void;
  /** Open straight into one game (e.g. from a game invite in chat). */
  initialGameId?: string;
  contextTitle?: string;
}

export function SageGameModal({ visible, onClose, initialGameId, contextTitle = 'Games', conversationId, groupId }: SageGameModalProps) {
  const { theme } = useSage();
  const [gameId, setGameId] = useState<string | null>(initialGameId ?? null);

  useEffect(() => {
    if (visible) setGameId(initialGameId ?? null);
  }, [visible, initialGameId]);

  const close = () => {
    setGameId(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Pressable onPress={gameId && !initialGameId ? () => setGameId(null) : close} hitSlop={12}>
            <Ionicons name={gameId && !initialGameId ? 'chevron-back' : 'close'} size={24} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 18, fontFamily: FONTS.Bold }}>{contextTitle}</Text>
        </View>

        {gameId ? (
          <GameLauncher
            key={gameId}
            getSession={() => createGameSession(gameId, { conversationId, groupId })}
            onClose={close}
          />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <GameCatalog onSelectGame={(g: Game) => setGameId(g.id)} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
```

Then pass the chat to it, so sessions are checked against membership and scores land on the right leaderboard:

- `app/conversation.tsx`: `<SageGameModal … conversationId={<this conversation's id>} />`
- `app/group-chat.tsx`: `<SageGameModal … groupId={<this group's id>} />`
- `app/game-center.tsx` and `app/(tabs)/index.tsx` (outside any chat): leave both out. Scores then count on the app-wide leaderboard.

What players get:

1. The game list. On picking a game, the app asks japabudz-server for a session.
2. An intro card with the rules and a **Play** button.
3. The real game. Pause and End game are in the header, and the game pauses automatically when the app goes to the background.
4. "Checking your score…" while the server replays the game. If the connection drops, it retries, and the result is kept (in AsyncStorage) until it gets through, even across app restarts.
5. The verified score, their rank, and the leaderboard for that DM or group, with **Play again** (a fresh session) and **Close**.

---

## 8. Battles: challenge a friend or the whole group (SDK 2.1)

In a battle everyone gets the same puzzle and races it live, with each other's progress on screen. How it flows in Japabudz:

1. In a DM or group, a player taps **Challenge** and picks a game.
2. japabudz-server creates a SageGames match and posts a `GAME_INVITE` message in the chat.
3. Anyone who taps **Join** on the invite asks japabudz-server for a seat, and the app opens `MatchLauncher`.
4. When everyone in the lobby is ready, a 3-second countdown starts the race. Results arrive in the `match.finished` webhook, and the server posts the standings in the chat.

A DM battle is invite-only for the two people in it. A group battle is open to any member until the lobby closes (2 minutes); it starts early once everyone who joined is ready, and needs at least 2 players.

### 8a. japabudz-server: create a battle and post the invite

Add to `src/routes/v2/games.routes.ts`:

```ts
import prisma from '../../config/prisma';
import { encrypt } from '../../utils/encryption';
import { emitConversationEvent, emitGroupEvent } from '../../services/socket.service';

async function sage(method: 'GET' | 'POST', path: string, payload?: unknown) {
  const r = await fetch(`${SAGEGAMES_API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.SAGEGAMES_API_KEY}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error ?? 'SageGames request failed'), { status: r.status, code: data.code });
  return data;
}

/** The chat a user may battle in, as a SageGames contextId (or null if they're not in it). */
async function chatContext(userId: string, chat: { conversationId?: string; groupId?: string }) {
  if (chat.conversationId) {
    const convo = await prisma.conversation.findFirst({
      where: { id: chat.conversationId, participants: { has: userId } },
      select: { id: true, participants: true },
    });
    return convo ? { contextId: `dm:${convo.id}`, participants: convo.participants } : null;
  }
  if (chat.groupId) {
    const member = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId: chat.groupId } },
      select: { groupId: true },
    });
    return member ? { contextId: `group:${chat.groupId}`, participants: null } : null;
  }
  return null;
}

const displayName = (u: { firstName?: string | null; username?: string | null }) => u.firstName || u.username || 'Player';

/** POST /api/v2/games/battles  { gameId, conversationId | groupId } */
router.post('/battles', authenticateToken, requireApprovedUser, async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  const { gameId, conversationId, groupId } = parsed.data;
  const user = req.user!;
  const chat = await chatContext(user.id, { conversationId, groupId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  let players = [{ externalUserId: user.id, displayName: displayName(user) }];
  if (chat.participants) {
    const others = await prisma.user.findMany({
      where: { id: { in: chat.participants.filter((id) => id !== user.id) } },
      select: { id: true, firstName: true, username: true },
    });
    players = [...players, ...others.map((o) => ({ externalUserId: o.id, displayName: displayName(o) }))];
  }

  let match;
  try {
    match = await sage('POST', '/v2/matches', {
      gameId,
      players,
      allowJoin: !!groupId,        // groups: members join from the invite
      maxPlayers: groupId ? 8 : 2,
      lobbyTimeoutSec: 120,
      contextId: chat.contextId,
      config: GAME_CONFIG[gameId],
    });
  } catch (e) {
    console.error('[sagegames] match failed', e);
    return res.status(502).json({ error: 'Could not start the battle. Please try again.' });
  }

  // The invite: an ordinary chat message the app renders as a card with a Join button.
  const text = `${displayName(user)} started a battle. Tap to join!`;
  const invite = { matchId: match.matchId, gameId, lobbyExpiresAt: match.lobbyExpiresAt };
  if (conversationId) {
    const message = await prisma.message.create({
      data: { conversationId, senderId: user.id, content: encrypt(text), messageType: 'GAME_INVITE', attachments: invite },
    });
    emitConversationEvent(conversationId, 'new_message', { ...message, content: text });
  } else {
    const message = await prisma.groupMessage.create({
      data: { groupId: groupId!, senderId: user.id, content: encrypt(text), messageType: 'GAME_INVITE', attachments: invite },
    });
    emitGroupEvent(groupId!, 'new_group_message', { ...message, content: text });
  }

  res.status(201).json({ matchId: match.matchId });
});
```

### 8b. japabudz-server: hand out seats

The app calls this when a player taps **Join** (and again whenever it reconnects). The match's `contextId` says which chat it belongs to, so membership is checked against the chat, not trusted from the request:

```ts
/** POST /api/v2/games/battles/:matchId/seat → { matchId, playerToken } */
router.post('/battles/:matchId/seat', authenticateToken, requireApprovedUser, async (req, res) => {
  const user = req.user!;
  try {
    const match = await sage('GET', `/v2/matches/${encodeURIComponent(req.params.matchId)}`);
    const [kind, id] = String(match.contextId ?? '').split(':');
    const chat = await chatContext(user.id, kind === 'dm' ? { conversationId: id } : kind === 'group' ? { groupId: id } : {});
    if (!chat) return res.status(404).json({ error: 'Battle not found' });

    const seated = match.players.some((p: { externalUserId: string }) => p.externalUserId === user.id);
    const seat = seated
      ? await sage('POST', `/v2/matches/${match.matchId}/tokens`, { externalUserId: user.id })
      : await sage('POST', `/v2/matches/${match.matchId}/players`, { externalUserId: user.id, displayName: displayName(user) });
    res.json({ matchId: seat.matchId, playerToken: seat.playerToken });
  } catch (e: any) {
    const messages: Record<string, string> = {
      match_started: 'This battle has already started.',
      match_full: 'This battle is full.',
      match_closed: 'This battle is over.',
      invite_only: 'This battle is invite-only.',
    };
    res.status(e.status === 404 ? 404 : 409).json({ error: messages[e.code] ?? 'Could not join the battle.' });
  }
});
```

### 8c. japabudz-server: post the standings

Extend the webhook handler from step 3:

```ts
if (event.type === 'match.finished') {
  const { contextId, gameId, standings } = event.data;
  const medal = ['🥇', '🥈', '🥉'];
  const lines = standings.map((s: any) =>
    `${medal[s.rank - 1] ?? `${s.rank}.`} ${s.displayName} (${s.status === 'forfeited' ? 'left' : s.score})`);
  const text = `Battle results\n${lines.join('\n')}`;
  // Post `text` into the chat named by contextId ("dm:<id>" or "group:<id>") as a system message,
  // like the sponsored-jobs cron does, and award rewards to standings[0].externalUserId.
}
```

Each player's score also arrives separately as a `session.completed` event, with `data.matchId` set. If you already post solo scores from that event, skip the ones that have a `matchId`, so a battle isn't announced twice.

### 8d. Japabudz-App: the invite card and the battle screen

```ts
// lib/api/sage-game.ts
export async function createBattle(gameId: string, chat: GameChat) {
  const { data } = await apiClient.post<{ matchId: string }>('/v2/games/battles', { gameId, ...chat });
  return data;
}

export async function getBattleSeat(matchId: string) {
  const { data } = await apiClient.post<{ matchId: string; playerToken: string }>(`/v2/games/battles/${matchId}/seat`);
  return data;
}
```

`components/sage-game/BattleModal.tsx`:

```tsx
import React from 'react';
import { Modal, SafeAreaView } from 'react-native';
import { MatchLauncher, useSage } from '@sagegames/react-native';
import { getBattleSeat } from '@/lib/api/sage-game';

export function BattleModal({ matchId, onClose }: { matchId: string | null; onClose: () => void }) {
  const { theme } = useSage();
  return (
    <Modal visible={!!matchId} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {matchId && <MatchLauncher key={matchId} getSeat={() => getBattleSeat(matchId)} onClose={onClose} />}
      </SafeAreaView>
    </Modal>
  );
}
```

In the chat message list (`conversation.tsx` and `group-chat.tsx`), render messages with `messageType === 'GAME_INVITE'` as a card with the game's name and a **Join** button that opens `<BattleModal matchId={message.attachments.matchId} />`. Hide the button once `lobbyExpiresAt` has passed. To start a battle, add a **Challenge** action next to the existing games entry that calls `createBattle(gameId, { conversationId })` or `createBattle(gameId, { groupId })` and then opens the modal with the returned `matchId`. The player who started the battle joins the same way as everyone else.

`MatchLauncher` shows the lobby with a **ready** button, the countdown, the game with a live progress bar for each player, a waiting screen once you finish, and the final standings. If the phone loses its connection, it reconnects and carries on. Players who stay away for more than 30 seconds, or who leave, forfeit.

> Battles need the API on a paid Render plan. A sleeping free instance drops every connection, and a restart aborts any battle in progress.

---

## Checklist

- [ ] `SAGEGAMES_API_KEY`, `SAGEGAMES_API_URL` and `SAGEGAMES_WEBHOOK_SECRET` are set on japabudz-server (and nowhere in the app)
- [ ] `grep -r "sec_campus_secret_123\|SAGE_GAME_SECRET_KEY" .` finds nothing in Japabudz-App
- [ ] `POST /api/v2/games/sessions` returns `{ sessionId, sessionToken }` for a member, and 404 for someone outside the chat
- [ ] Each of the five games opens from a DM and from a group, is playable with touch, and ends on a verified score
- [ ] Word Search shows all five Japa terms, including Immigration and Scholarship
- [ ] Airplane mode at the end of a game → "retrying" → turn it off → the score arrives. Closing and reopening the app also sends it.
- [ ] The webhook receives `session.completed`, and a request with a tampered body is rejected (400)
- [ ] The portal's **Usage** tab shows sessions, and its **Webhook** tab shows deliveries
- [ ] Battles: a DM challenge posts an invite, both phones join, race, and see the same standings; the results message appears in the chat
- [ ] Battles: in a group, three members join from one invite; someone outside the group gets 404 from `/battles/:matchId/seat`
- [ ] Battles: switching one phone to airplane mode for a few seconds mid-race resumes where it left off; staying offline for over 30 seconds forfeits

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Could not start the game" | japabudz-server's call to `/v2/sessions` failed. Check its logs: `403 invalid_api_key` means the key is wrong or revoked, and `403 game_not_enabled` means the game is off on the portal's Games tab. |
| "This game has been updated. Please update the app to play it." | The server runs newer game rules than the app's SDK. Update `@sagegames/react-native`. |
| First game after a quiet period takes a while to load | The API is on Render's free plan, which sleeps after 15 minutes. Use a paid plan in production. |
| Battle stuck on "Connecting…" | The WebSocket can't reach `wss://<api-host>/v2/ws`. Check that the API is awake and that no proxy strips the `Upgrade` header. |
| "Not enough players were ready, so this battle was cancelled." | The lobby closed (2 minutes) before at least 2 players were ready. |
| Score shows "This score is not ranked." | It was flagged as implausible (for example, answers faster than a human could give them), or it came from a test key. |
