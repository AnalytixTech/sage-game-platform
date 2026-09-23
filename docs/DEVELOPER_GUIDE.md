# SageGame Developer Guide

Welcome to the **SageGame Platform Developer Guide**. This guide is split into two sections:
1. **Host Developer Integration Guide**: How to integrate SageGame into third-party React Web, React Native, or Expo applications.
2. **Game Platform Developer Guide**: How to create and register new game modules on the SageGame Platform.

---

# Part 1: Host Developer Integration Guide

## 1. Installation

Install the SageGame SDK for your target platform:

### For React Web:
```bash
npm install @sagegame/react @sagegame/types
```

### For React Native & Expo:
```bash
npm install @sagegame/react-native @sagegame/types
```

---

## 2. Server-to-Server Authentication

Host applications own their users; SageGame owns game execution.

Your Host Application Backend must request a short-lived **Game Session Token** for your authenticated user before launching a game on the client.

### Host Backend Endpoint (`server.ts`):

```ts
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const SAGEGAME_API_URL = 'https://api.sagegame.com';
const HOST_SECRET_KEY = 'sec_your_host_secret_here';

app.post('/api/create-game-session', async (req: Request, res: Response) => {
  const { gameId } = req.body;
  const loggedInUser = { id: 'user_123', name: 'John Doe' };

  const response = await fetch(`${SAGEGAME_API_URL}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HOST_SECRET_KEY}`,
    },
    body: JSON.stringify({
      gameId: gameId || 'game_quiz_001',
      externalUserId: loggedInUser.id,
      metadata: { name: loggedInUser.name },
    }),
  });

  const sessionData = await response.json();
  res.json(sessionData); // Returns { sessionId, sessionToken, gameId, expiresAt }
});
```

---

## 3. Client Integration (React Web & React Native)

Wrap your application tree with `<SageGameProvider />` and pass the `sessionToken`:

```tsx
import React, { useState, useEffect } from 'react';
import { SageGameProvider, GameCatalog, Game } from '@sagegame/react';
import { Game as GameMetadata, GameResult } from '@sagegame/types';

export function HostApp() {
  const [sessionToken, setSessionToken] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<GameMetadata | null>(null);

  const fetchSession = async (gameId: string) => {
    const res = await fetch('/api/create-game-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    const data = await res.json();
    setSessionToken(data.sessionToken);
  };

  const handleSelectGame = (game: GameMetadata) => {
    setSelectedGame(game);
    fetchSession(game.id);
  };

  const handleGameComplete = (result: GameResult) => {
    console.log('Game finished! Score:', result.score);
    alert(`Congratulations! You scored ${result.score} points.`);
    setSelectedGame(null);
  };

  return (
    <SageGameProvider baseUrl="https://api.sagegame.com" sessionToken={sessionToken}>
      {!selectedGame ? (
        <GameCatalog onSelectGame={handleSelectGame} />
      ) : (
        <Game gameId={selectedGame.id} onComplete={handleGameComplete} />
      )}
    </SageGameProvider>
  );
}
```

---

## 4. Configuring Word Search & Custom Categories

For **Word Search** (`game_word_search_001`), host applications can dynamically configure categories, custom word tokens, definitions, and word selection modes via `config`:

```tsx
<Game
  gameId="game_word_search_001"
  config={{
    categoryName: "Immigration & Legal Terms",
    difficulty: "medium", // 'easy' | 'medium' | 'hard'
    gridSize: 12,
    wordSelectionMode: "combine", // 'custom_only' | 'default_only' | 'combine'
    words: [
      { token: "VISA", display: "Visa", definition: "Conditional authorization document" },
      { token: "PERMIT", display: "Permit", definition: "Official permit document" },
      { token: "RIGHTS", display: "Rights", definition: "Legal entitlements" },
      { token: "STATUTE", display: "Statute", definition: "Written law" }
    ]
  }}
  onComplete={(result) => {
    console.log('Word Search Result:', result.data);
    // result.data contains { wordsFound, totalWords, accuracy, categoryName }
  }}
/>
```

---

## 5. Configuring Sudoku & Variants

For **Sudoku** (`game_sudoku_001`), host applications can choose grid variants and difficulty presets:

```tsx
<Game
  gameId="game_sudoku_001"
  config={{
    variant: "7x7_irregular", // '4x4' | '6x6' | '5x5_irregular' | '7x7_irregular' | '9x9'
    difficulty: "medium"       // 'easy' | 'medium' | 'hard'
  }}
  onComplete={(result) => {
    console.log('Sudoku Completed in:', result.duration, 'seconds');
  }}
/>
```

---

# Part 2: Game Platform Developer Guide

This section explains how platform developers build and register **new game modules** on SageGame.

## 1. Implementing the `GameModule` Contract

Every game module in `games/<game-name>` must implement `GameModule<TConfig, TAction, TState, TResult>`:

```ts
import {
  GameAction,
  GameContext,
  GameModule,
  GameResult,
  GameState
} from '@sagegame/types';

export interface MyGameConfig {
  difficulty?: string;
}

export interface MyGameResultData {
  customScoreMultiplier: number;
}

export class MyCustomGameModule
  implements GameModule<MyGameConfig, GameAction, GameState, GameResult<MyGameResultData>>
{
  public readonly id = 'game_custom_001';
  private context?: GameContext<MyGameConfig>;
  private status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private score = 0;

  public async initialize(context: GameContext<MyGameConfig>): Promise<void> {
    this.context = context;
    this.status = 'idle';
    this.score = 0;
  }

  public async start(): Promise<void> {
    this.status = 'running';
  }

  public async pause(): Promise<void> {
    this.status = 'paused';
  }

  public async resume(): Promise<void> {
    this.status = 'running';
  }

  public async submitAction(action: GameAction): Promise<void> {
    if (this.status !== 'running') return;

    if (action.type === 'PLAYER_MOVE') {
      this.score += 100;
      this.context?.onEvent({
        type: 'game_score_updated',
        sessionId: this.context.sessionId,
        gameId: this.id,
        timestamp: new Date().toISOString(),
        currentScore: this.score,
        delta: 100,
      });
    }
  }

  public getState(): GameState {
    return {
      sessionId: this.context?.sessionId || '',
      status: this.status,
      currentScore: this.score,
      elapsedSeconds: 0,
      data: {},
    };
  }

  public async complete(): Promise<GameResult<MyGameResultData>> {
    this.status = 'ended';
    return {
      sessionId: this.context?.sessionId || '',
      gameId: this.id,
      externalUserId: this.context?.externalUserId || '',
      score: this.score,
      duration: 30,
      completedAt: new Date().toISOString(),
      data: { customScoreMultiplier: 1.5 },
    };
  }

  public async destroy(): Promise<void> {
    this.status = 'ended';
  }
}
```

---

## 2. Registering New Games in Platform API

Add your game metadata to `mockGames` in [`services/api/src/server.ts`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/services/api/src/server.ts):

```ts
{
  id: 'game_custom_001',
  slug: 'my-custom-game',
  name: 'My Custom Game',
  description: 'An exciting new interactive game on SageGame platform.',
  version: '1.0.0',
  category: 'puzzle',
  status: 'published',
  deliveryModel: 'sdk_rendered',
  supportedPlatforms: ['web', 'ios', 'android'],
  thumbnail: 'https://example.com/thumb.jpg',
}
```

Register the module instance in `<SageGameProvider modules={[new MyCustomGameModule()]} />` or client module map.
