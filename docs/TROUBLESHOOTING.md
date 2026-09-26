# Troubleshooting and FAQ

## Starting games

| Symptom | Cause and fix |
| --- | --- |
| `403 invalid_api_key` from `/v2/sessions` | The key is wrong or revoked. Check `SAGEGAMES_API_KEY` on your server; create a new key in the portal if needed. |
| `403 game_not_enabled` | The game is switched off for this app. Enable it in the portal's **Games** section. |
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
