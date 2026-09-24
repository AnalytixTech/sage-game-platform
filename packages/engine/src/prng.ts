/**
 * Seeded pseudo-random number generator shared by clients and the server.
 *
 * cyrb128 hashes the seed string into 128 bits of state for sfc32. Only 32-bit integer
 * arithmetic is used, so every JavaScript engine (V8, Hermes, JavaScriptCore) produces
 * the same sequence for the same seed.
 */

export interface Rng {
  /** The seed string this generator was created from. */
  readonly seed: string;
  /** Next unsigned 32-bit integer. */
  nextU32(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Returns a new shuffled array (Fisher–Yates); the input is not modified. */
  shuffle<T>(items: readonly T[]): T[];
  /** Independent generator for a sub-task, so adding draws in one place never shifts another. */
  fork(label: string): Rng;
}

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);

  const nextU32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  // Discard the first outputs so similar seeds diverge immediately.
  for (let i = 0; i < 12; i++) nextU32();

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) {
      throw new RangeError(`rng.int(n) requires an integer 1..2^32, got ${n}`);
    }
    // Rejection sampling removes modulo bias.
    const limit = 0x100000000 - (0x100000000 % n);
    let x = nextU32();
    while (x >= limit) x = nextU32();
    return x % n;
  };

  const rng: Rng = {
    seed,
    nextU32,
    int,
    range: (min, max) => min + int(max - min + 1),
    pick: (items) => {
      if (items.length === 0) throw new RangeError('rng.pick on an empty array');
      return items[int(items.length)];
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    fork: (label) => createRng(`${seed}/${label}`),
  };

  return rng;
}
