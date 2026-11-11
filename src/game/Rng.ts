/** Small deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  reseed(seed: number): void {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer seed for pattern variation. */
  int(): number {
    return (this.next() * 0x7fffffff) | 0;
  }
}
