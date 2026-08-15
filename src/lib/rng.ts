// RNG determinístico (mulberry32) — permite reproduzir resultados com seed.

export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private fn: () => number;
  constructor(seed: string | number) {
    const s = typeof seed === 'number' ? seed : hashString(seed);
    this.fn = mulberry32(s);
  }
  /** 0..1 */
  next(): number {
    return this.fn();
  }
  /** inteiro em [min, max] inclusivo */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  /** float em [min, max) */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  /** verdadeiro com probabilidade p */
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  gaussian(mean: number, stdDev: number): number {
    // Box-Muller
    const u1 = Math.max(this.next(), 1e-12);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }
  clampGaussian(mean: number, stdDev: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(this.gaussian(mean, stdDev))));
  }
}

/** Cria um RNG estável a partir de uma seed combinada com um salt. */
export function rngFor(seed: string, salt: string): RNG {
  return new RNG(hashString(seed) ^ hashString(salt));
}
