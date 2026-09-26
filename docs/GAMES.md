# Games

Five games, the same on React Native and the web. Every game is deterministic: the server gives each session a seed, the app records moves, and the server replays them to compute the score. Send options in `config` when you create a session or match; invalid config is rejected with `400 invalid_config`.

| Game | `gameId` | Pause | Battle winner |
| --- | --- | --- | --- |
| [Quiz Master](#quiz-master) | `game_quiz_001` | No (timed) | Highest score, then fastest |
| [Memory Match](#memory-match) | `game_memory_001` | Yes | First to finish, then score |
| [Sudoku Arena](#sudoku-arena) | `game_sudoku_001` | Yes | First to finish, then score |
| [Word Search](#word-search) | `game_word_search_001` | Yes | First to finish, then score |
| [Word Rush](#word-rush) | `game_word_001` | No (timed) | Highest score, then fastest |

## Quiz Master

<!-- preview:game_quiz_001 -->

Multiple-choice questions against a per-question timer.

**Scoring.** A correct answer scores 100, plus up to 50 for answering quickly (the full 50 when answered instantly, falling to 0 as the timer runs out), plus 10 per question of an ongoing streak (up to +50). Wrong or timed-out answers score 0 and reset the streak.

| Config | Default | |
| --- | --- | --- |
| `questionCount` | 10 | 1–50 |
| `timePerQuestionSec` | 20 | 5–120 |
| `difficulty` | `mixed` | `easy`, `medium`, `hard`, `mixed` |
| `categories` | all | `general`, `science`, `geography`, `history`, `technology`, `sports`, `travel`, `maths`, `culture` |
| `bankId` | | One of your [quiz banks](QUIZ_BANKS.md) |
| `questions` | | Inline questions: `[{ question, answer, wrong: [...], category?, difficulty? }]` |
| `includeDefaultQuestions` | `false` | Mix your questions with the built-in bank |

`result`: `correctAnswers`, `totalQuestions`, `accuracy`, `timePerQuestionMs`.

## Memory Match

<!-- preview:game_memory_001 -->

Flip two cards at a time and find every pair.

**Scoring.** 100 per pair, +50 when neither card had been seen in a missed attempt ("flawless"). A miss costs 5 only when one of its cards had been seen before (a memory lapse); missing two unseen cards is free. The final score is never below 0.

| Config | Default | |
| --- | --- | --- |
| `pairCount` | 6 | 2–12 |

`result`: `totalMoves`, `matchedPairs`, `flawlessMatches`.

In battles, card faces stay on the server until a player turns them over.

## Sudoku Arena

<!-- preview:game_sudoku_001 -->

Classic and irregular-region Sudoku, generated per seed with exactly one solution.

**Scoring.** 25 the first time a cell is filled correctly, −50 per wrong digit, −100 per hint, +500 for completing the grid. Notes are free. The final score is never below 0.

| Config | Default | |
| --- | --- | --- |
| `variant` | `9x9` | `4x4`, `4x4_irregular`, `5x5_irregular`, `6x6`, `6x6_irregular`, `7x7_irregular`, `8x8`, `8x8_irregular`, `9x9` |
| `difficulty` | `medium` | `easy`, `medium`, `hard` |
| `timeLimitSeconds` | 0 | 0 = no limit |

On the web, Sudoku can be played with the keyboard: arrow keys, digits, Backspace, and N for notes.

## Word Search

<!-- preview:game_word_search_001 -->

Find hidden words by dragging across them, or by tapping the first and last letters.

**Scoring.** 100 per letter of each word found, +500 for finding them all, −10 for a selection that isn't a word. The final score is never below 0.

| Config | Default | |
| --- | --- | --- |
| `words` | built-in list | Up to 30: `[{ token, display?, definition? }]` |
| `wordSelectionMode` | | `custom_only`, `default_only` or `combine` (your words plus the built-in list) |
| `categoryName` | | Shown to players |
| `gridSize` | 12 (10 easy, 14 hard) | 6–15; grows to fit the longest word |
| `difficulty` | `medium` | `hard` adds backwards and diagonal words |

Words that can't fit are listed in `skippedWords` instead of being dropped silently.

## Word Rush

<!-- preview:game_word_001 -->

Make as many words as possible from a grid of letter tiles before time runs out. Tiles must touch (including diagonally) and each tile is used once per word.

**Scoring.** By word length: 3 letters 100, 4 → 150, 5 → 250, 6 → 400, 7 → 600, 8+ → 1000. Invalid and repeated words score nothing.

| Config | Default | |
| --- | --- | --- |
| `size` | 4 | 4 or 5 |
| `durationSeconds` | 90 | 30–300 |

`result`: `wordsFound`, `longestWord`, `bonusPoints`, `invalidAttempts`.
