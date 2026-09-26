# SageGames

Casual games for your app (Quiz Master, Memory Match, Sudoku Arena, Word Search and Word Rush), with scores the server verifies, live battles, per-chat leaderboards, webhooks and a theme that matches your app. Works in React Native / Expo and on the web.

The same docs are built into the developer portal at `/portal/docs`, with search and an API reference.

- **Start here:** [docs/QUICKSTART.md](docs/QUICKSTART.md)
- **Add games to an app:** [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- **Make it look like your app:** [docs/DESIGN_GUIDE.md](docs/DESIGN_GUIDE.md)
- **Battles, webhooks, quiz banks:** [docs/BATTLES.md](docs/BATTLES.md), [docs/WEBHOOKS.md](docs/WEBHOOKS.md), [docs/QUIZ_BANKS.md](docs/QUIZ_BANKS.md)
- **API keys and the developer portal:** [docs/KEYS_SETUP.md](docs/KEYS_SETUP.md)
- **API reference:** [docs/openapi.yaml](docs/openapi.yaml)
- **What changed:** [CHANGELOG.md](CHANGELOG.md)
- **Deploying (Supabase + Render):** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **How it works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

```bash
npm install --include=dev --legacy-peer-deps
npm run build        # packages, API and portal
npm test             # all tests, offline
npm run playground   # the real game screens in a browser: http://localhost:5199
```

| Package | |
| --- | --- |
| `@sagegames/react-native` | React Native / Expo SDK |
| `@sagegames/react` | React web SDK |
| `@sagegames/react-headless` | Shared provider, launcher and game hooks |
| `@sagegames/core` | API client and game runtime |
| `@sagegames/engine` | Deterministic engine and server-side replay |
| `@sagegames/game-*` | The five games' rules |
