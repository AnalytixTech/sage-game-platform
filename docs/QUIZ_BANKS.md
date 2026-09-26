# Quiz banks: your own questions

Quiz Master ships with a bank of general-knowledge questions. A **quiz bank** is your own set (up to 200 questions) that sessions and battles can draw from, for example onboarding questions, product trivia, or topics your community cares about.

## Create a bank in the portal

1. Open your app's **Quiz banks** section and click **New quiz bank**.
2. Give it an id (letters, digits, `-` and `_`, e.g. `relocation`) and a name.
3. Add questions one by one, or open **Paste from a spreadsheet** and paste rows with these columns:

| Question | Correct answer | Wrong 1 | Wrong 2 | Wrong 3 |
| --- | --- | --- | --- | --- |
| What does BRP stand for? | Biometric Residence Permit | British Rail Pass | Border Return Paper | |

A header row is skipped. Each question needs a correct answer and at least one wrong answer (up to five). Category and difficulty are optional.

Mistakes are reported with the question number, for example "Question 4: add at least one wrong answer".

## Use it

Pass the bank id in the session (or match) config:

```json
{ "gameId": "game_quiz_001", "externalUserId": "user_1", "config": { "bankId": "relocation", "questionCount": 10 } }
```

Questions are picked from the bank with the session's seed; options are shuffled per session. To mix your questions with the built-in bank, add `"includeDefaultQuestions": true`.

You can also send questions inline instead of using a bank:

```json
{ "config": { "questions": [{ "question": "What does BRP stand for?", "answer": "Biometric Residence Permit", "wrong": ["British Rail Pass", "Border Return Paper"] }] } }
```

## Manage banks from your backend

The same banks are available through the API with your API key:

```bash
curl -X PUT $SAGEGAMES_API_URL/v2/quiz-banks/relocation \
  -H "Authorization: Bearer $SAGEGAMES_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Relocation","questions":[{"question":"What does BRP stand for?","answer":"Biometric Residence Permit","wrong":["British Rail Pass"]}]}'

curl $SAGEGAMES_API_URL/v2/quiz-banks -H "Authorization: Bearer $SAGEGAMES_API_KEY"          # list
curl -X DELETE $SAGEGAMES_API_URL/v2/quiz-banks/relocation -H "Authorization: Bearer $SAGEGAMES_API_KEY"
```

`PUT` replaces the whole bank. Deleting a bank makes new sessions that use its id fail with `400`; games already started aren't affected.

## Answers stay secret in battles

In a battle, the server keeps the questions and only sends each player a question's answer after they've answered it, so a modified app can't read your answers ahead of time. In solo games the questions are on the device (the server still verifies the score by replaying the answers).
