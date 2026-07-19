/**
 * Deterministic RNG (mulberry32). Integer-state, no floats in the state itself,
 * so streams serialize/restore exactly across platforms.
 *
 * Two-stream rule (CLAUDE.md #4): sim code uses ctx.rng; render/cosmetic code
 * creates its own Rng from any seed and never touches the sim stream.
 */

export interface RngState {
  s: number; // uint32
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform uint32. Prefer int helpers below inside sim code (fixed-point world). */
  nextUint32(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    const span = max - min + 1;
    return min + (this.nextUint32() % span);
  }

  /** True with probability num/den (integer odds keep sim logic float-free). */
  chance(num: number, den: number): boolean {
    return this.nextUint32() % den < num;
  }

  /** Pick a uniform element. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** In-place Fisher–Yates shuffle. Returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent stream (e.g. per-room, per-run) without consuming much state. */
  split(): Rng {
    return new Rng(this.nextUint32());
  }

  /** Float in [0,1). RENDER/COSMETIC USE ONLY — never in sim code. */
  float(): number {
    return this.nextUint32() / 4294967296;
  }

  save(): RngState {
    return { s: this.s };
  }

  static restore(state: RngState): Rng {
    const r = new Rng(0);
    (r as unknown as { s: number }).s = state.s >>> 0;
    return r;
  }
}
