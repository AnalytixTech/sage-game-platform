# Webhooks

SageGames can POST every verified result, and every finished battle, to your server. Use them to award rewards, post results into a chat, or keep your own history.

## Set up

1. In the portal, open your app's **Webhook** section and enter an HTTPS URL on your server.
2. Copy the **signing secret** (`whsec_…`) into your server's environment, for example `SAGEGAMES_WEBHOOK_SECRET`.
3. Verify every request's signature (below) before trusting it.

Test keys never send webhooks, so staging traffic can't trigger real rewards.

## Events

| Event | When | `data` |
| --- | --- | --- |
| `session.completed` | A game (solo or a battle seat) was verified or rejected | `sessionId`, `gameId`, `externalUserId`, `displayName`, `contextId`, `status`, `valid`, `score`, `durationMs`, `result`, `flags`, `rejectCode`, `completedAt`, `matchId` (for battle seats) |
| `match.finished` | A battle ended | `matchId`, `gameId`, `contextId`, `standings[]` (`rank`, `externalUserId`, `displayName`, `status`, `score`, `completed`, `finishedMs`), `finishedAt` |

Every request body is an envelope:

```json
{
  "id": "evt_42",
  "type": "session.completed",
  "tenantId": "app_…",
  "createdAt": "2026-09-24T12:00:05.000Z",
  "data": {
    "sessionId": "sess_…", "gameId": "game_word_search_001",
    "externalUserId": "user_1", "displayName": "Ada", "contextId": "group:abc",
    "status": "verified", "valid": true, "score": 1250, "durationMs": 84000,
    "result": { "wordsFound": 5, "totalWords": 5 }, "flags": [], "rejectCode": null,
    "completedAt": "2026-09-24T12:00:04.000Z", "matchId": null
  }
}
```

Only act on `valid: true`. Results that were flagged as implausible, rejected, or made with a test key arrive with `valid: false`.

Headers: `Sage-Event` (the event type), `Sage-Delivery` (a delivery id, the same on retries), `Sage-Signature`, and `User-Agent: SageGames-Webhooks/1`.

## Verify the signature

`Sage-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with your secret>`

Compute the HMAC over the **raw** request body (before JSON parsing), compare in constant time, and reject timestamps more than 5 minutes old.

<!-- tabs -->

```ts Node (Express)
import crypto from 'crypto';

// Register before express.json(), so the raw body is available.
app.post('/webhooks/sagegames', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verify(process.env.SAGEGAMES_WEBHOOK_SECRET!, raw, req.header('Sage-Signature') ?? '')) {
    return res.status(400).send('invalid signature');
  }
  res.sendStatus(200); // acknowledge quickly; do the work afterwards
  const event = JSON.parse(raw);
  if (event.type === 'session.completed' && event.data.valid) {
    // award points, post to the chat named by event.data.contextId, …
  }
});

function verify(secret: string, body: string, header: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300 || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

```python Python (Flask)
import hashlib, hmac, os, time
from flask import Flask, request, abort

app = Flask(__name__)

@app.post("/webhooks/sagegames")
def sagegames():
    raw = request.get_data()  # raw bytes, before any JSON parsing
    parts = dict(p.split("=", 1) for p in request.headers.get("Sage-Signature", "").split(",") if "=" in p)
    t = int(parts.get("t", "0"))
    expected = hmac.new(os.environ["SAGEGAMES_WEBHOOK_SECRET"].encode(), f"{t}.".encode() + raw, hashlib.sha256).hexdigest()
    if abs(time.time() - t) > 300 or not hmac.compare_digest(expected, parts.get("v1", "")):
        abort(400)
    event = request.get_json()
    if event["type"] == "session.completed" and event["data"]["valid"]:
        pass  # award points, …
    return "", 200
```

<!-- /tabs -->

## Delivery and retries

- A delivery succeeds when your endpoint answers **2xx** within 10 seconds.
- Failures are retried with backoff: after 30 seconds, then 1, 2, 4 minutes… up to 6 hours between tries, for up to 10 attempts.
- Deliveries can arrive more than once and out of order. Use `data.sessionId` (or `data.matchId`) to make your handler idempotent.
- The portal's **Webhook** section lists recent deliveries with their status, attempts and last error.

## Rotate the secret

Click **Rotate** in the portal. Deploy the new secret to your server straight away: deliveries are signed with the new secret from then on.
