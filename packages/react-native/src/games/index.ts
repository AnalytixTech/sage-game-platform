import { memoryMatchRules } from '@sagegames/game-memory-match';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { sudokuRules } from '@sagegames/game-sudoku';
import { wordRushRules } from '@sagegames/game-word-rush';
import { wordSearchRules } from '@sagegames/game-word-search';
import { definePlugin, GamePlugin } from '@sagegames/react-headless';
import { MemoryView } from './MemoryView';
import { QuizView } from './QuizView';
import { SudokuView } from './SudokuView';
import { WordRushView } from './WordRushView';
import { WordSearchView } from './WordSearchView';

export const quizMaster = definePlugin({
  rules: quizMasterRules,
  title: 'Quiz Master',
  instructions: 'Answer each question before the timer runs out. Faster answers and streaks score more.',
  View: QuizView,
});

export const memoryMatch = definePlugin({
  rules: memoryMatchRules,
  title: 'Memory Match',
  instructions: 'Flip two cards at a time and find every pair. Pairs found on the first try earn a bonus.',
  View: MemoryView,
});

export const sudoku = definePlugin({
  rules: sudokuRules,
  title: 'Sudoku Arena',
  instructions: 'Fill every row, column and region with each number once. Mistakes and hints cost points.',
  View: SudokuView,
});

export const wordSearch = definePlugin({
  rules: wordSearchRules,
  title: 'Word Search',
  instructions: 'Find every word hidden in the grid. Drag across a word, or tap its first and last letters.',
  View: WordSearchView,
});

export const wordRush = definePlugin({
  rules: wordRushRules,
  title: 'Word Rush',
  instructions: 'Make words of 3+ letters from touching tiles before time runs out. Longer words score more.',
  View: WordRushView,
});

/** Every game with its React Native view. Pass to <SageGameProvider games={allGames}>. */
export const allGames: GamePlugin[] = [quizMaster, memoryMatch, sudoku, wordSearch, wordRush];

export { MemoryView, QuizView, SudokuView, WordRushView, WordSearchView };
