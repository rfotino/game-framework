/**
 * Magnitude helpers at WORLD SCALE, and the range an Fx can hold. These are the
 * tests that would have caught the "ship teleports off an asteroid it isn't
 * touching" bug reported from a game with a 1200-unit arena radius, plus the
 * ones covering values past the 32768 u wall the int32 spelling used to have.
 */
import { describe, expect, it } from "vitest";
import {
  FX_ONE,
  add,
  fx,
  fxIsExact,
  mul,
  toInt,
  fxFromFloat,
  toFloat,
  vDist,
  vDot,
  vCross,
  vLen,
  vLenSq,
  vLenSq2,
  vNorm,
  vProj,
  pythLeg,
  vec,
  type Fx,
} from "../src/engine/fixed.js";

const v = (x: number, y: number) => vec(fx(x), fx(y));
/** Tolerance: the helpers drop sub-1/256-unit input precision by design. */
const UNIT = 1 / 256;

describe("vLen", () => {
  it("is exact on the classic triples at small scale", () => {
    expect(toFloat(vLen(v(3, 4)))).toBeCloseTo(5, 2);
    expect(toFloat(vLen(v(0, 0)))).toBe(0);
  });

  it("stays correct past the 181-unit square-overflow threshold", () => {
    // The whole point: vLenSq wraps here, vLen must not.
    for (const d of [200, 500, 1200, 2400, 8000]) {
      expect(toFloat(vLen(v(d, 0)))).toBeCloseTo(d, 1);
      expect(toFloat(vLen(v(0, -d)))).toBeCloseTo(d, 1);
      expect(toFloat(vLen(v(d, d)))).toBeCloseTo(d * Math.SQRT2, 0);
    }
  });

  it("matches the arena diagonal a 1200-radius world actually asks for", () => {
    // Corner-to-corner of a 2400x2400 arena: the worst case in a real game.
    expect(toFloat(vLen(v(2400, 2400)))).toBeCloseTo(3394.1, 0);
  });

  it("is symmetric in sign", () => {
    expect(vLen(v(900, 1600))).toBe(vLen(v(-900, -1600)));
    expect(vLen(v(-900, 1600))).toBe(vLen(v(900, -1600)));
  });

  it("returns integer fixed-point values (no float leak)", () => {
    const l = vLen(v(1200, 700)) as number;
    expect(Number.isInteger(l)).toBe(true);
  });
});

describe("vLenSq", () => {
  it("is exact out to the ~1448 u square bound, which covers a real arena", () => {
    expect(toFloat(vLenSq(v(3, 4)))).toBeCloseTo(25, 2);
    // The 181 u wall is gone: this used to wrap negative, and is now the truth.
    expect(toFloat(vLenSq(v(1200, 0)))).toBeCloseTo(1_440_000, 0);
    expect(toFloat(vLenSq(v(1448, 0)))).toBeCloseTo(1448 * 1448, 0);
  });

  it("degrades past the bound by rounding, never by flipping sign", () => {
    // The reason vLenSq survives at all: over-range now costs low bits, where it
    // used to cost the answer. A caller comparing against a radius still sorts.
    const a = vec(fxFromFloat(7001.37), fxFromFloat(0));
    const truth = 7001.37 ** 2;
    const got = toFloat(vLenSq(a));
    expect(got).toBeGreaterThan(0);
    expect(Math.abs(got - truth) / truth).toBeLessThan(1e-6);
    expect(vLenSq(v(20000, 20000))).toBeGreaterThan(vLenSq(v(19000, 19000)));
  });
});

describe("vDist", () => {
  it("equals vLen of the difference, at arena scale", () => {
    const a = v(-1100, 400);
    const b = v(900, -600);
    expect(toFloat(vDist(a, b))).toBeCloseTo(Math.hypot(2000, 1000), 0);
    expect(vDist(a, b)).toBe(vDist(b, a));
  });

  it("is zero for coincident points", () => {
    expect(vDist(v(750, -750), v(750, -750))).toBe(0);
  });
});

describe("vDot / vCross / vLenSq2", () => {
  it("keep the right sign and ordering at arena scale", () => {
    const a = v(1200, 0);
    expect(vDot(a, v(1, 0))).toBeGreaterThan(0);
    expect(vDot(a, v(-1, 0))).toBeLessThan(0);
    expect(vDot(a, v(0, 1))).toBe(0);
    // Winding: the point-in-polygon test depends on this flipping correctly.
    expect(vCross(v(1200, 0), v(0, 1200))).toBeGreaterThan(0);
    expect(vCross(v(0, 1200), v(1200, 0))).toBeLessThan(0);
    expect(vCross(v(1200, 1200), v(600, 600))).toBe(0);
  });

  it("compare distance against radius without a square root", () => {
    const near = v(300, 0);
    const far = v(1200, 0);
    const r = fx(500);
    // Radius squared in the same shifted units the helpers work in.
    const rSq = vLenSq2(vec(r, 0 as Fx));
    expect(vLenSq2(near) < rSq).toBe(true);
    expect(vLenSq2(far) < rSq).toBe(false);
  });

  it("agree with vLen: vLenSq2(a) ≈ vLenSq2 of a vector of length |a|", () => {
    const a = v(1600, 1200); // |a| = 2000
    expect(vLenSq2(a)).toBeCloseTo(vLenSq2(v(2000, 0)), -2);
  });
});

describe("vNorm", () => {
  it("returns a unit vector at arena scale (where the reciprocal spelling loses ~15%)", () => {
    for (const a of [v(1200, 0), v(-900, 1600), v(2400, -2400), v(5, 12)]) {
      // Tolerance is the sub-1/256 input precision the helpers drop, not slop.
      expect(Math.abs(toFloat(vLen(vNorm(a))) - 1)).toBeLessThan(0.01);
    }
  });

  it("preserves direction", () => {
    const n = vNorm(v(-900, 1200)); // 3-4-5 scaled: expect (-0.6, 0.8)
    expect(toFloat(n.x)).toBeCloseTo(-0.6, 2);
    expect(toFloat(n.y)).toBeCloseTo(0.8, 2);
  });

  it("maps the zero vector to zero rather than NaN", () => {
    expect(vNorm(v(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe("vProj", () => {
  const ab = v(2000, 0);

  it("clamps to the segment ends", () => {
    expect(vProj(v(-500, 0), ab)).toBe(0);
    expect(vProj(v(9000, 0), ab)).toBe(FX_ONE);
  });

  it("lands mid-segment at the right fraction, arena-scale operands", () => {
    expect(toFloat(vProj(v(500, 800), ab))).toBeCloseTo(0.25, 2);
    expect(toFloat(vProj(v(1500, -1200), ab))).toBeCloseTo(0.75, 2);
  });

  it("returns 0 for a degenerate segment", () => {
    expect(vProj(v(100, 100), v(0, 0))).toBe(0);
  });
});

describe("pythLeg", () => {
  it("solves the ray-vs-disc leg at arena scale", () => {
    expect(toFloat(pythLeg(fx(1000), fx(600)))).toBeCloseTo(800, 0);
    expect(toFloat(pythLeg(fx(2400), fx(0)))).toBeCloseTo(2400, 0);
  });

  it("clamps to zero instead of going imaginary when the ray misses", () => {
    expect(pythLeg(fx(300), fx(700))).toBe(0);
  });
});

describe("determinism", () => {
  it("every helper returns integers for fractional inputs", () => {
    const a = vec(fxFromFloat(1234.567), fxFromFloat(-890.123));
    const b = vec(fxFromFloat(-45.6), fxFromFloat(78.9));
    for (const r of [vLen(a), vDist(a, b), vProj(a, b), pythLeg(vLen(a), vLen(b)), vNorm(a).x, vNorm(a).y]) {
      expect(Number.isInteger(r as number)).toBe(true);
    }
    expect(Number.isInteger(vDot(a, b))).toBe(true);
    expect(Number.isInteger(vCross(a, b))).toBe(true);
  });

  it("drops at most the documented sub-1/256-unit precision", () => {
    const a = vec(fxFromFloat(1000.9999), fxFromFloat(0));
    expect(Math.abs(toFloat(vLen(a)) - 1000.9999)).toBeLessThan(2 * UNIT);
  });

  it("is repeatable — same inputs, identical bits", () => {
    const a = vec(fxFromFloat(311.7), fxFromFloat(-1908.25));
    expect(vLen(a)).toBe(vLen(a));
    expect(vNorm(a)).toEqual(vNorm(a));
  });
});

describe("scale ceiling", () => {
  it("holds across the old int32 range (|value| < 32768 u)", () => {
    const big = 23000;
    expect(toFloat(vLen(v(big, 0)))).toBeCloseTo(big, 0);
    expect(toFloat(vLen(v(big, big)))).toBeCloseTo(big * Math.SQRT2, -1);
    expect(FX_ONE).toBe(65536);
  });

  it("and keeps holding far past it — an Fx is an exact integer, not an int32", () => {
    // 32768 u was where `| 0` wrapped, and every magnitude that met it needed its
    // own workaround. These are the shapes those workarounds existed to dodge.
    for (const u of [40_000, 120_000, 500_000, 1_000_000]) {
      expect(fx(u)).toBe(u * 65536);
      expect(toInt(fx(u))).toBe(u);
      expect(toFloat(vLen(v(u, 0)))).toBeCloseTo(u, 0);
      expect(fx(u)).toBeGreaterThan(0);
    }
    // The Throat's spiral: an arclength coordinate longer than the arena is wide.
    const arc = fx(120_000);
    expect(toFloat(add(arc, fx(1500)))).toBeCloseTo(121_500, 0);
    expect(toFloat(vLen(v(500_000, 500_000)))).toBeCloseTo(500_000 * Math.SQRT2, -1);
  });

  it("scales a five-figure pool by a fraction without the divide-first dance", () => {
    // A boss health pool routed through fx()/mul(): the shape that came back
    // negative and tripped a `coreHp < 0` invariant.
    expect(toFloat(mul(fx(14_000), fxFromFloat(0.6667)))).toBeCloseTo(9333.8, 0);
    expect(mul(fx(14_000), fxFromFloat(0.6667))).toBeGreaterThan(0);
  });

  it("still returns exact integers at those magnitudes (no float leak)", () => {
    for (const r of [fx(500_000), vLen(v(300_000, 400_000)), mul(fx(120_000), fxFromFloat(0.25))]) {
      expect(fxIsExact(r as number)).toBe(true);
    }
    expect(fxIsExact(1.5)).toBe(false);
    expect(fxIsExact(2 ** 54)).toBe(false);
  });
});
