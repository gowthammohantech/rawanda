/**
 * Seeded pseudo-random numbers for the synthetic seed (FND-05). `Math.random` is banned in
 * this package (lint): every random choice goes through a `Prng` created from an explicit seed,
 * so the dataset is identical on every machine.
 */

/** mulberry32: tiny, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Prng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Float in [min, max) rounded to `decimals`. */
  float(min: number, max: number, decimals?: number): number;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[];
};

export function createPrng(seed: number): Prng {
  const next = mulberry32(seed);
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    float(min, max, decimals = 1) {
      const factor = 10 ** decimals;
      return Math.round((min + next() * (max - min)) * factor) / factor;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick: empty array");
      return items[int(0, items.length - 1)] as T;
    },
    chance(p) {
      return next() < p;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}

/** Derives an independent sub-seed (e.g. one stream for names, one for readings). */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}
