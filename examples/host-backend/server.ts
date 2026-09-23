import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const SAGEGAME_API_URL = process.env.SAGEGAME_API_URL || 'http://localhost:4000';
const HOST_SECRET_KEY = process.env.HOST_SECRET_KEY || 'sec_campus_secret_123';

/**
 * Host Application Endpoint called by React or Mobile App
 * POST /api/play-game
 */
app.post('/api/play-game', async (req: Request, res: Response) => {
  const { gameId } = req.body;

  // 1. Host App authenticates user in its own system
  const loggedInUser = {
    id: 'user_123',
    name: 'John Doe',
    email: 'john@campus.edu',
  };

  try {
    // 2. Host Backend requests game session token from SageGame Platform API
    const response = await fetch(`${SAGEGAME_API_URL}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HOST_SECRET_KEY}`,
      },
      body: JSON.stringify({
        gameId: gameId || 'game_quiz_001',
        externalUserId: loggedInUser.id,
        metadata: {
          name: loggedInUser.name,
          email: loggedInUser.email,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `SageGame Session Error: ${errText}` });
    }

    const sessionData = await response.json();

    // 3. Return session token to host client app
    res.json({
      sessionId: sessionData.sessionId,
      sessionToken: sessionData.sessionToken,
      gameId: sessionData.gameId,
      expiresAt: sessionData.expiresAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`CampusApp Host Backend listening on http://localhost:${PORT}`);
});
