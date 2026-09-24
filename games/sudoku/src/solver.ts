import { Rng } from '@sagegames/engine';

export interface SearchResult {
  count: number;
  first: number[] | null;
}

const popcount = (mask: number): number => {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
};

/**
 * Backtracking search with the minimum-remaining-values heuristic and bitmask candidates.
 * Stops once `limit` solutions are found. With an rng, digits are tried in random order
 * (used to generate a random full grid); without one the search is fully deterministic.
 */
export function searchSolutions(
  grid: readonly number[],
  size: number,
  regions: readonly number[],
  limit: number,
  rng: Rng | null = null
): SearchResult {
  const values = grid.slice();
  const full = ((1 << size) - 1) << 1; // bits 1..size
  const rowMask = new Array<number>(size).fill(0);
  const colMask = new Array<number>(size).fill(0);
  const regMask = new Array<number>(size).fill(0);

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === 0) continue;
    const bit = 1 << v;
    const r = Math.floor(i / size);
    const c = i % size;
    const g = regions[i];
    if ((rowMask[r] | colMask[c] | regMask[g]) & bit) {
      return { count: 0, first: null }; // givens already conflict
    }
    rowMask[r] |= bit;
    colMask[c] |= bit;
    regMask[g] |= bit;
  }

  let count = 0;
  let first: number[] | null = null;

  const recurse = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = size + 1;

    for (let i = 0; i < values.length; i++) {
      if (values[i] !== 0) continue;
      const r = Math.floor(i / size);
      const c = i % size;
      const mask = full & ~(rowMask[r] | colMask[c] | regMask[regions[i]]);
      const n = popcount(mask);
      if (n === 0) return false; // dead end
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n === 1) break;
      }
    }

    if (best === -1) {
      count++;
      if (!first) first = values.slice();
      return count >= limit;
    }

    let digits: number[] = [];
    for (let d = 1; d <= size; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rng) digits = rng.shuffle(digits);

    const r = Math.floor(best / size);
    const c = best % size;
    const g = regions[best];
    for (const d of digits) {
      const bit = 1 << d;
      values[best] = d;
      rowMask[r] |= bit;
      colMask[c] |= bit;
      regMask[g] |= bit;
      if (recurse()) return true;
      values[best] = 0;
      rowMask[r] &= ~bit;
      colMask[c] &= ~bit;
      regMask[g] &= ~bit;
    }
    return false;
  };

  recurse();
  return { count, first };
}

const KEEP_RATIO = { easy: 0.5, medium: 0.4, hard: 0.3 } as const;

/**
 * Generate a puzzle with exactly one solution. Givens are removed in random order and a
 * removal is kept only if the puzzle stays uniquely solvable.
 */
export function generatePuzzle(
  size: number,
  regions: readonly number[],
  difficulty: keyof typeof KEEP_RATIO,
  rng: Rng
): { puzzle: number[]; solution: number[] } {
  const empty = new Array<number>(size * size).fill(0);
  const solution = searchSolutions(empty, size, regions, 1, rng.fork('fill')).first;
  if (!solution) {
    throw new Error(`No solution exists for this ${size}x${size} layout`);
  }

  const target = Math.ceil(size * size * KEEP_RATIO[difficulty]);
  const puzzle = solution.slice();
  let givens = puzzle.length;

  for (const idx of rng.fork('dig').shuffle(puzzle.map((_, i) => i))) {
    if (givens <= target) break;
    const saved = puzzle[idx];
    puzzle[idx] = 0;
    if (searchSolutions(puzzle, size, regions, 2).count === 1) {
      givens--;
    } else {
      puzzle[idx] = saved;
    }
  }

  return { puzzle, solution };
}
