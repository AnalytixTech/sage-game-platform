# Troubleshooting and FAQ

## Starting games

| Symptom | Cause and fix |
| --- | --- |
| `403 invalid_api_key` from `/v2/sessions` | The key is wrong or revoked. Check `SAGEGAMES_API_KEY` on your server; create a new key in the portal if needed. |
| `403 game_not_enabled` | The game is switched off for this app. Enable it in the portal's **Games** section. |
| Existing keys stop working after moving to a new deployment | The new deployment needs the same `API_KEY_PEPPER` as the old one. Keys are hashed with it. |
| `400 invalid_config` | A config option is out of range or misspelt. The response names the field. See [Games](GAMES.md). |
| "Please update the app to play it" | The server runs newer game rules than your app's SDK. Update `@sagegames/react-native` / `@sagegames/react`. |
| The first game after a quiet period is slow | The API host was asleep (e.g. a free hosting plan). Use an always-on plan in production. |

## Scores

| Symptom | Cause |
| --- | --- |
| "This score is not ranked." | The result was flagged as implausible (for example, answers faster than a person could give them), or it was made with a **test** key. It's stored with `valid: false` and stays off leaderboards. |
| "We couldn't verify this game" | The recorded moves didn't replay (for example, a tampered or truncated log). Nothing is stored for the leaderboard. |
| The score shown differs from what I expected | Scores are always the server's replay of the moves. See the scoring rules on [Games](GAMES.md). |
| The network dropped at the end of a game | The launcher retries with backoff. With a `pendingStore`, an unsent result survives the app closing and is sent the next time. |

## Battles

| Symptom | Cause |
| --- | --- |
| Stuck on "Connecting…" | The WebSocket can't reach `wss://<api-host>/v2/ws`. Check the API is awake and nothing strips the `Upgrade` header. |
| "Not enough players were ready…" | The lobby closed before `minPlayers` were ready. Create a new match. |
| A player was marked "Left" | They left, or stayed disconnected for more than 30 seconds. |
| "The game server restarted" | Battles run in memory; a restart aborts battles in progress. Lobbies survive. |

## Webhooks

| Symptom | Cause |
| --- | --- |
| Signature check fails | Compute the HMAC over the **raw** body, before JSON parsing, and use the current secret (rotating it changes the signature immediately). See [Webhooks](WEBHOOKS.md). |
| No deliveries | Test keys never send webhooks. Check the URL in the portal and the **Recent deliveries** list for errors. |
| The same event twice | Retries can repeat a delivery. Make your handler idempotent on `data.sessionId` / `data.matchId`. |

## Self-hosting and the portal

| Symptom | Cause and fix |
| --- | --- |
| The server won't start: "Database migrations are pending" | Apply them: `npm run db:migrate` (or `node services/api/dist/scripts/migrate.js`), or start with `--migrate`. On Railway the pre-deploy command does it. |
| `/healthz` answers 503 with `"migrations": "pending"` | Same as above. |
| "Unsupported DATABASE_URL scheme" | Use `postgres://`, `postgresql://`, `mysql://`, `mariadb://`, `sqlite:` or `file:`. |
| Postgres or MySQL "self-signed certificate" / TLS errors | Set `DATABASE_SSL=true` for hosted databases, or `false` for private networks without TLS. `auto` turns TLS on for public hostnames only. |
| "another API instance is using this database" in the logs | Two API processes share the database. Run one replica (battles live in memory). A short warning during a deploy is normal. |
| No sign-up or reset emails | Set `BREVO_API_KEY` and `EMAIL_FROM`, and authenticate the sending domain in Brevo. In development without a key, the server logs each email's link. |
| "We've emailed you a link to set a password" when signing in | The account was moved from the old platform without a password. Open the emailed link and choose one. |
| Signed out on every reload | The portal's refresh cookie is `Secure`: serve the portal over HTTPS (and set `PUBLIC_BASE_URL` to the https address). |
| SQLite: "database is locked" | Only one process may write the file. Don't run two servers (or a script and a server) on the same file at once for long jobs; back up with `sqlite3 .backup`. |

## Design

| Question | Answer |
| --- | --- |
| Gradients or shadows are missing on some phones | They use React Native 0.76+ with the New Architecture. Older versions get classic shadows and a flat colour. |
| My font doesn't show | In React Native, use the font's registered name (from `expo-font` or your native setup), per weight: `{ regular, medium, bold }`. |
| Animations are off | The OS "reduce motion" setting is on, or `reduceMotion`/`theme.motion.scale = 0` is set. |
| How do I get the old (2.1) look? | `theme={darkNavyTheme}` for navy and gold, or `theme={lightTheme}`. |

## Security

- **Can I put the API key in my app?** No. It can create sessions for any user. Keep it on your backend and pass only `sessionId` + `sessionToken` to the app.
- **Can a modified app fake a score?** No: the server replays the moves and computes the score itself. It can't stop a bot from playing well in solo games; plausibility flags catch obvious cases, and in battles the answers to Memory and Quiz stay on the server.
