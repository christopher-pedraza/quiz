// Seedable randomness. Everything random about a question showing is a pure function of a seed so that
// practice re-rolls, exam links and tests are reproducible.

export type Rng = () => number

/** mulberry32. Returns [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000)
}

/** A different seed for the n-th re-roll of the same showing. */
export function rerollSeed(base: number, n: number): number {
  return (base + Math.imul(n, 0x9e3779b9)) >>> 0
}

/** FNV-1a over the salts, mixed with the base seed. Same inputs, same seed, on every machine. */
export function deriveSeed(base: number, ...salt: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (base >>> 0)
  for (const ch of salt.join('\u0000')) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return h >>> 0
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}
