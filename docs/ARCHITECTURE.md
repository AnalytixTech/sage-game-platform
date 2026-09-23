# SageGame Platform Architecture & Deliverables Documentation

SageGame is a type-safe multi-tenant, multi-game Game-as-a-Service (GaaS) platform allowing third-party host applications to embed games seamlessly into React Web, React Native, and Expo applications.

---

## 1. Complete System Architecture

```text
                               SAGEGAME PLATFORM
                                       │
                              ┌────────┴────────┐
                              │   Platform API  │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
          Game Engine              Game Engine              Game Engine
              │                        │                        │
          Quiz Master              Word Rush               Memory Match
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
                                SDK Core / Types
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                         │
            React SDK (@sagegame/react)          React Native SDK (@sagegame/react-native)
                  │                                         │
             Web Applications                         Mobile / Expo Apps
```

---

## 2. Multi-Tenant Architecture

- **Host App Ownership**: The Host Application owns user identity and authentication.
- **Platform Ownership**: SageGame Platform owns game execution, game state, scoring, and leaderboards.
- **Tenant Isolation**: Every API request and session token is bound to a specific `tenantId`. A host application can only query games enabled for its tenant (`tenant_game_access`).

---

## 3. Multi-Game Architecture

SageGame supports adding new games without modifying the SDK. Games are decoupled from core platform logic and implement the universal `GameModule` interface.

Supported game categories:
- Quiz games (`Quiz Master`)
- Word games (`Word Rush`)
- Memory games (`Memory Match`)
- Puzzle, Arcade, Multiplayer, and future games.

---

## 4. Monorepo Structure

```text
sage-game-platform/
├── package.json
├── tsconfig.json
├── packages/
│   ├── types/               # @sagegame/types (TypeScript Interfaces & Contracts)
│   ├── core/                # @sagegame/core (Client, Event Emitter, Session Engine, Registry)
│   ├── react/               # @sagegame/react (Web React SDK, Components, Hooks)
│   └── react-native/        # @sagegame/react-native (Mobile RN & Expo SDK)
├── games/
│   ├── quiz-master/         # @sagegame/game-quiz-master
│   ├── word-rush/           # @sagegame/game-word-rush
│   └── memory-match/        # @sagegame/game-memory-match
├── services/
│   └── api/                 # @sagegame/api-service (Express REST API Server & DB Schema)
├── examples/
│   ├── host-backend/        # Host Server acquiring session tokens with Host Secret
│   ├── react-web-app/       # React Web App integration example
│   └── react-native-app/    # React Native / Expo App integration example
└── docs/
    └── ARCHITECTURE.md      # Comprehensive Architectural Specs
```

---

## 5. SDK Package Structure

- `@sagegame/types`: Complete type declarations.
- `@sagegame/core`: Platform HTTP client, typed event emitter, game lifecycle state machine.
- `@sagegame/react`: Context provider, React components (`<GameCatalog />`, `<GameLauncher />`, `<Game />`), custom hooks (`useGames()`, `useGame()`, `useGameSession()`, `useGameState()`, `useGameResult()`).
- `@sagegame/react-native`: Cross-platform mobile UI adapters for React Native and Expo.

---

## 6. Game Registry Design

`GameRegistry` maintains game metadata:

```ts
export interface Game<TConfig = Record<string, unknown>> {
  id: string;
  slug: string;
  name: string;
  description?: string;
  version: string;
  category: GameCategory;
  status: GameStatus;
  deliveryModel: GameDeliveryModel; // 'sdk_rendered' | 'remote_embedded'
  supportedPlatforms: Platform[];   // 'web' | 'ios' | 'android'
  configuration?: TConfig;
}
```

---

## 7. Game Module Contract

Every game module implements `GameModule`:

```ts
export interface GameModule<
  TConfig = Record<string, unknown>,
  TAction = GameAction,
  TState = GameState,
  TResult = GameResult
> {
  id: string;
  initialize(context: GameContext<TConfig>): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  submitAction(action: TAction): Promise<void>;
  getState(): TState;
  complete(): Promise<TResult>;
  destroy(): Promise<void>;
}
```

---

## 8. React SDK API

```tsx
import { SageGameProvider, GameCatalog, Game } from '@sagegame/react';

function App() {
  return (
    <SageGameProvider sessionToken={token}>
      <GameCatalog onSelectGame={handleSelect} />
      <Game gameId="game_quiz_001" onComplete={handleComplete} />
    </SageGameProvider>
  );
}
```

Hooks:
- `useGames({ category })`
- `useGame(gameId)`
- `useGameSession(sessionId)`
- `useGameState()`
- `useGameResult()`

---

## 9. React Native SDK API

```tsx
import { SageGameProvider, GameCatalog, Game } from '@sagegame/react-native';

function MobileApp() {
  return (
    <SageGameProvider sessionToken={token}>
      <GameCatalog onSelectGame={handleSelect} />
      <Game gameId="game_quiz_001" onComplete={handleComplete} />
    </SageGameProvider>
  );
}
```

---

## 10. Authentication Flow

```text
Host App User ──> Host Backend ──[POST /v1/sessions (Secret Key)]──> SageGame API
                      │                                                   │
                      └──────────── Session Token (Short-lived) ──────────┘
                                                │
                                                ▼
                                         Client SDK
```

1. Host Backend calls `POST /v1/sessions` with `Authorization: Bearer HOST_APPLICATION_SECRET`.
2. SageGame API returns short-lived `sessionToken`.
3. Client app passes `sessionToken` to `<SageGameProvider sessionToken={token}>`.
4. Permanent secrets are **NEVER** embedded in client code.

---

## 11. Session Lifecycle

Session States:
`created` ──> `active` ──> `paused` ──> `completed` / `expired` / `terminated`

- Heartbeats monitor token expiration.
- Upon completion, final scores are submitted to `POST /v1/sessions/:sessionId/complete`.

---

## 12. API Specification

- `GET /v1/games`: Retrieve available games catalog.
- `GET /v1/games/:gameId`: Retrieve game details.
- `POST /v1/sessions`: Create game session (Host secret required).
- `GET /v1/sessions/:sessionId`: Get session details.
- `POST /v1/sessions/:sessionId/start|pause|resume|events`: Lifecycle operations.
- `POST /v1/sessions/:sessionId/complete`: Complete session & submit score.
- `GET /v1/games/:gameId/leaderboard`: Fetch leaderboards.
- `GET /v1/users/:externalUserId/stats`: Fetch player statistics.

---

## 13. Database Schema

Defined in [`services/api/src/db/schema.sql`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/services/api/src/db/schema.sql). Covers `tenants`, `applications`, `api_keys`, `external_users`, `games`, `game_versions`, `tenant_game_access`, `game_sessions`, `game_events`, `game_results`, `player_stats`, `leaderboards`, `leaderboard_entries`, and `webhooks`.

---

## 14. Security Architecture

- **Zero Trust Client**: All client scores are validated server-side against physical limits and timing metrics.
- **Short-Lived Tokens**: Session tokens expire automatically after 1 hour.
- **Tenant Isolation**: Multi-tenant authorization check enforced on every query.
- **HMAC Signatures**: Server-to-server webhooks signed with HMAC SHA-256 using `webhook_secret`.

---

## 15. Event Architecture

Type-safe event system:

```ts
type GameEvent =
  | GameStartedEvent
  | GamePausedEvent
  | GameResumedEvent
  | GameProgressEvent
  | GameScoreUpdatedEvent
  | GameCompletedEvent
  | GameErrorEvent
  | CustomGameEvent;
```

---

## 16. Leaderboard Architecture

Supports:
- Global Leaderboards
- Per-Game Leaderboards
- Per-Tenant Leaderboards
- Time Periods: `all_time`, `daily`, `weekly`, `monthly`.

---

## 17. Player Statistics Architecture

Tracks overall user metrics and per-game performance:
- `gamesPlayed`, `gamesCompleted`
- `totalScore`, `highestScore`, `averageScore`
- `totalPlayTimeSeconds`

---

## 18. Webhook Architecture

SageGame dispatches server-to-server webhooks to Host Backends:
- `game.session.created`
- `game.session.started`
- `game.session.completed`
- `game.result.created`
- `game.session.expired`

Payload contains HMAC signature header `X-SageGame-Signature`.

---

## 19-21. Example Integrations

- **React Web App**: Located in [`examples/react-web-app/src/App.tsx`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/examples/react-web-app/src/App.tsx).
- **React Native App**: Located in [`examples/react-native-app/App.tsx`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/examples/react-native-app/App.tsx).
- **Host Backend**: Located in [`examples/host-backend/server.ts`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/examples/host-backend/server.ts).

---

## 22. Testing Architecture

- Unit tests for core SDK classes using Node test runner / Vitest.
- Integration tests verifying API session creation, lifecycle transitions, score validation, and leaderboard calculation.

---

## 23. Developer Documentation & Deployment Structure

- **Developer Guide**: Comprehensive guide for host app developers and platform game module creators in [`docs/DEVELOPER_GUIDE.md`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/docs/DEVELOPER_GUIDE.md).
- **Deployment Guide**: Complete guide for PostgreSQL database setup, API server cloud deployment, Docker containerization, NPM package publishing, and CI/CD pipelines in [`docs/DEPLOYMENT.md`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/docs/DEPLOYMENT.md).

- Quickstart Guide: Integrating `@sagegame/react` & `@sagegame/react-native`.
- Game Developer Guide: Creating new custom game modules implementing `GameModule`.
- Backend Integration Guide: Authenticating host servers and handling webhooks.
