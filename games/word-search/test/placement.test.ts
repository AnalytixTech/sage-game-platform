import { describe, expect, it } from 'vitest';
import { wordSearchRules } from '@sagegames/game-word-search';

const JAPABUDZ = {
  wordSelectionMode: 'combine',
  words: ['PASSPORT', 'VISA', 'IMMIGRATION', 'CAMPUS', 'SCHOLARSHIP'].map((token) => ({ token })),
  gridSize: 10,
  difficulty: 'medium',
};

describe('word search placement', () => {
  it('regression: places every word that can fit, across many seeds (grows the grid if needed)', () => {
    const config = wordSearchRules.parseConfig(JAPABUDZ);
    for (let i = 0; i < 200; i++) {
      const s = wordSearchRules.init(`seed-${i}`, config);
      expect(s.skippedWords, `seed-${i}`).toEqual([]);
      expect(s.words).toHaveLength(13); // 8 default words + 5 custom
    }
  });
});
