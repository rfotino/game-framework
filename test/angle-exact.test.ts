/**
 * Exactness, proved against BigInt rather than against another float.
 *
 * `vFromAng`'s claim is that the coarse/fine split is EXACT MATH and not an
 * interpolation: the products stay inside a float64's exact-integer range, so the double
 * path computes the same thing arbitrary precision would. A failure here means the path
 * shed a bit — which on someone else's hardware is a desync, not a rounding error.
 */
import { describe, expect, it } from "vitest";
import { ANG_COARSE, ANG_FINE, ANG_FINE_N } from "../src/engine/angle-tables.js";
import { ANG_TURN, vFromAng, type Ang } from "../src/engine/angle.js";
import { FX_ONE } from "../src/engine/fixed.js";

const TWO_32 = 4294967296n;
/** Half-up rounding of a rational, in integers — what `Math.round(n / 2^32)` must equal. */
const roundDiv = (n: bigint): bigint => {
  const shifted = n * 2n + TWO_32;
  const q = shifted / (TWO_32 * 2n);
  return shifted < 0n && q * (TWO_32 * 2n) !== shifted ? q - 1n : q;
};

const bearings = (): number[] => {
  const out: number[] = [];
  for (let a = 0; a < ANG_TURN; a += 1013) out.push(a);
  // The seams: every coarse boundary is where the split could be off by one cell.
  for (let c = 0; c < 8; c++) {
    const base = Math.floor((c * ANG_TURN) / 8);
    out.push(base, base + 1, base - 1, base + ANG_FINE_N - 1);
  }
  out.push(0, ANG_TURN / 4, ANG_TURN / 2, (3 * ANG_TURN) / 4, ANG_TURN - 1);
  return out.map((a) => ((a % ANG_TURN) + ANG_TURN) % ANG_TURN);
};

describe("vFromAng is bit-identical to the same formula in BigInt", () => {
  it("agrees on every seam and across the turn", () => {
    for (const a of bearings()) {
      const ci = Math.floor(a / ANG_FINE_N);
      const fi = a - ci * ANG_FINE_N;
      const cx = BigInt(ANG_COARSE[ci * 2]);
      const cy = BigInt(ANG_COARSE[ci * 2 + 1]);
      const fx0 = BigInt(ANG_FINE[fi * 2]);
      const fy0 = BigInt(ANG_FINE[fi * 2 + 1]);
      const v = vFromAng(a as Ang);
      expect(BigInt(v.x)).toBe(roundDiv(cx * fx0 - cy * fy0));
      expect(BigInt(v.y)).toBe(roundDiv(cy * fx0 + cx * fy0));
    }
  });

  /** The headroom the module header claims. A future rescale of the tables that eats it
   *  fails here rather than in somebody's game. */
  it("keeps every intermediate below 2^53", () => {
    let worst = 0;
    for (let a = 0; a < ANG_TURN; a += 7) {
      const ci = Math.floor(a / ANG_FINE_N);
      const fi = a - ci * ANG_FINE_N;
      const cx = ANG_COARSE[ci * 2];
      const cy = ANG_COARSE[ci * 2 + 1];
      const fx0 = ANG_FINE[fi * 2];
      const fy0 = ANG_FINE[fi * 2 + 1];
      worst = Math.max(worst, Math.abs(cx * fx0 - cy * fy0), Math.abs(cy * fx0 + cx * fy0));
    }
    expect(worst).toBeLessThan(9007199254740992);
    expect(Math.log2(worst)).toBeLessThan(49);
  });
});

describe("the split costs nothing", () => {
  /** The identity is exact, so the answer must match a single high-precision cosine to
   *  within the one rounding they share. If someone replaces it with a lerp, this fails. */
  it("matches a naive high-precision cosine to within one", () => {
    let worst = 0;
    for (let a = 0; a < ANG_TURN; a += 101) {
      const t = (a / ANG_TURN) * Math.PI * 2;
      const v = vFromAng(a as Ang);
      worst = Math.max(
        worst,
        Math.abs(v.x - Math.round(FX_ONE * Math.cos(t))),
        Math.abs(v.y - Math.round(FX_ONE * Math.sin(t))),
      );
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("never reads off the end of a table, at any argument", () => {
    for (let a = -3 * ANG_TURN; a <= 3 * ANG_TURN; a += 997) {
      const v = vFromAng(a as Ang);
      expect(Number.isInteger(v.x)).toBe(true);
      expect(Number.isInteger(v.y)).toBe(true);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(FX_ONE);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(FX_ONE);
    }
  });
});
