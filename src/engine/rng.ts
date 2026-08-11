/**
 * Deterministic RNG (mulberry32). Integer-state, no floats in the state itself,
 * so streams serialize/restore exactly across platforms.
 *
 * Two-stream rule (CLAUDE.md #4): sim code uses ctx.rng; render/cosmetic code
 * creates its own Rng from any seed and never touches the sim stream.
 */

/** The exact-integer ceiling of a double, and the two words `next53` builds it from. */
const TWO_53 = 9007199254740992;
const TWO_32 = 4294967296;
const TWO_21 = 2097152;

export interface RngState {
  s: number; // uint32
}

export class Rng {
  private s: number;

  /**
   * `seed` is taken modulo 2^32 — mulberry32's state IS a uint32, so two seeds 2^32
   * apart produce the identical stream. That matters more than it reads: the natural
   * way to seed per-room or per-entity is now from a position, an arclength or a
   * `hashState`, and an `Fx` reaches 2^37 u, so a seed derived from one has bits here
   * that do not survive.
   */
  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform uint32. Prefer the int helpers below inside sim code (fixed-point world). */
  nextUint32(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * 53 uniform bits — the whole exact-integer range of a double, so a span the size of
   * the `Fx` range still draws from every value in it. Two words: 21 bits (a power-of-two
   * slice of a uint32, so taking it is itself unbiased) above 32.
   */
  private next53(): number {
    return (this.nextUint32() % TWO_21) * TWO_32 + this.nextUint32();
  }

  /**
   * Integer in [min, max] inclusive, UNIFORM.
   *
   * Both halves of that matter and neither used to hold. `min + (nextUint32() % span)`
   * drew from one uint32, so a span past 2^32 — only 65536 world units once the operands
   * are `Fx` — silently returned values from the bottom 2^32 of the requested range and
   * nothing above it. And `%` on a raw draw is biased toward the low end of any span that
   * does not divide the draw's range evenly, which is most of them.
   *
   * So: draw the full 53 bits, and reject the tail that would fold unevenly instead of
   * folding it. The loop is expected to run about once — the rejected window is under one
   * span out of 2^53 — and it terminates for every span the type can express. A span at
   * or past 2^53 asks for more distinct outcomes than a double holds, which makes `min`
   * and `max` themselves inexact; that is the caller's bug, and the draw below is uniform
   * over the values that do exist rather than a silent truncation of the range.
   */
  int(min: number, max: number): number {
    const span = max - min + 1;
    if (span <= 1) return min;
    if (span >= TWO_53) return min + this.next53();
    const limit = TWO_53 - (TWO_53 % span);
    let r = this.next53();
    while (r >= limit) r = this.next53();
    return min + (r % span);
  }

  /** True with probability num/den (integer odds keep sim logic float-free). */
  chance(num: number, den: number): boolean {
    return this.int(1, den) <= num;
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
