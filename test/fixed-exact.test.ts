/**
 * Exactness, proved against BigInt rather than against another float.
 *
 * Every op here has ONE contract — take Fx, return Fx in world units, correctly
 * rounded — and this file is what makes that claim checkable. The reference is
 * arbitrary-precision integer arithmetic, so a test failing here means the
 * double-precision path shed a bit, not that a tolerance was tuned wrong.
 *
 * The magnitudes are the ones a sim actually spends its time at, and they are
 * deliberately not all arena-scale: the spelling this replaced divided its
 * operands by 256 at EVERY scale, which cost 2.5% on a per-tick acceleration
 * and 0.8% on a unit vector while being invisible at arena scale, where it was
 * measured.
 */
import { describe, expect, it } from "vitest";
import {
  FX_ONE,
  div,
  fx,
  fxFromFloat,
  mul,
  toFloat,
  vCross,
  vDist,
  vDot,
  vLen,
  vLenSq,
  vNorm,
  vProj,
  pythLeg,
  vec,
  type Fx,
} from "../src/engine/fixed.js";

const B = BigInt;
const ONE = B(FX_ONE);

/** Floor division over BigInt — JS BigInt division truncates toward zero. */
const bDiv = (n: bigint, d: bigint): bigint => {
  const q = n / d;
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q;
};
const bIsqrt = (n: bigint): bigint => {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
};

const refMul = (a: number, b: number): bigint => bDiv(B(a) * B(b), ONE);
const refDiv = (a: number, b: number): bigint => bDiv(B(a) * ONE, B(b));
const refDot = (ax: number, ay: number, bx: number, by: number): bigint =>
  bDiv(B(ax) * B(bx) + B(ay) * B(by), ONE);
const refCross = (ax: number, ay: number, bx: number, by: number): bigint =>
  bDiv(B(ax) * B(by) - B(ay) * B(bx), ONE);
const refMag = (x: number, y: number): bigint => bIsqrt(B(x) * B(x) + B(y) * B(y));

/** A seeded LCG, so a failure names a reproducible case rather than a lucky one. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The scales a sim lives at, in raw fx, smallest first. */
const SCALES: ReadonlyArray<[string, number]> = [
  ["acceleration (0.2 u/tick²)", 14563],
  ["velocity (7 u/tick)", 477102],
  ["unit vector", FX_ONE],
  ["ship (40 u)", 2621440],
  ["arena (2200 u)", 144179200],
  ["far field (200000 u)", 13107200000],
];

describe("mul is exactly ⌊a·b⌋ at every scale", () => {
  for (const [name, s] of SCALES) {
    it(name, () => {
      const rnd = lcg(0x5eed + s);
      for (let i = 0; i < 400; i++) {
        const a = Math.round((rnd() * 2 - 1) * s);
        const b = Math.round((rnd() * 2 - 1) * s);
        expect(B(mul(a as Fx, b as Fx))).toBe(refMul(a, b));
      }
    });
  }

  it("holds at the extremes of the Fx range", () => {
    const big = 2 ** 37;
    for (const [a, b] of [
      [big, FX_ONE],
      [-big, FX_ONE],
      [big, 3],
      [2 ** 26, 2 ** 26],
      [-(2 ** 26), 2 ** 26],
      [2 ** 30, 2 ** 20],
    ]) {
      expect(B(mul(a as Fx, b as Fx))).toBe(refMul(a, b));
    }
  });

  it("rounds toward negative infinity, symmetrically with the reference", () => {
    for (const [a, b] of [
      [-1, 1],
      [-3, FX_ONE / 2],
      [3, -(FX_ONE / 2)],
      [-100000007, 65537],
    ]) {
      expect(B(mul(a as Fx, b as Fx))).toBe(refMul(a, b));
    }
  });
});

describe("div is exactly ⌊a/b⌋ in fx units", () => {
  for (const [name, s] of SCALES) {
    it(name, () => {
      const rnd = lcg(0xd17 + s);
      for (let i = 0; i < 400; i++) {
        const a = Math.round((rnd() * 2 - 1) * s);
        const b = Math.round((rnd() * 2 - 1) * s) || 1;
        expect(B(div(a as Fx, b as Fx))).toBe(refDiv(a, b));
      }
    });
  }

  it("holds where the numerator would leave the exact range", () => {
    // Every case here has a REPRESENTABLE result: `div` cannot conjure an Fx
    // bigger than an Fx, and a quotient past 2^53 raw is out of the type, not a
    // rounding question. (2^40 / 3 raw would be 2.4e16 — that is the caller's bug.)
    for (const [a, b] of [
      [2 ** 37, 7],
      [-(2 ** 37), 7],
      [2 ** 40, FX_ONE],
      [2 ** 40, -FX_ONE],
      [2 ** 44, 3 * FX_ONE],
      [-(2 ** 44), 7 * FX_ONE],
    ]) {
      expect(B(div(a as Fx, b as Fx))).toBe(refDiv(a, b));
    }
  });
});

describe("vDot / vCross are exact in fx world units", () => {
  for (const [name, s] of SCALES) {
    it(name, () => {
      const rnd = lcg(0xd07 + s);
      for (let i = 0; i < 300; i++) {
        const ax = Math.round((rnd() * 2 - 1) * s);
        const ay = Math.round((rnd() * 2 - 1) * s);
        const bx = Math.round((rnd() * 2 - 1) * s);
        const by = Math.round((rnd() * 2 - 1) * s);
        const a = vec(ax as Fx, ay as Fx);
        const b = vec(bx as Fx, by as Fx);
        expect(B(vDot(a, b))).toBe(refDot(ax, ay, bx, by));
        expect(B(vCross(a, b))).toBe(refCross(ax, ay, bx, by));
      }
    });
  }

  it("vLenSq is exactly the dot of a vector with itself", () => {
    const rnd = lcg(0x1e0);
    for (let i = 0; i < 300; i++) {
      const x = Math.round((rnd() * 2 - 1) * 144179200);
      const y = Math.round((rnd() * 2 - 1) * 144179200);
      expect(B(vLenSq(vec(x as Fx, y as Fx)))).toBe(refDot(x, y, x, y));
    }
  });
});

describe("vLen / vDist", () => {
  it("are EXACTLY ⌊√(x²+y²)⌋ below 1448 u — accel, velocity and unit scale included", () => {
    for (const [name, s] of SCALES.slice(0, 4)) {
      const rnd = lcg(0x1e2 + s);
      for (let i = 0; i < 300; i++) {
        const x = Math.round((rnd() * 2 - 1) * s);
        const y = Math.round((rnd() * 2 - 1) * s);
        expect(B(vLen(vec(x as Fx, y as Fx))), `${name} (${x}, ${y})`).toBe(refMag(x, y));
      }
    }
  });

  it("keep the old step above it, where the square cannot be exact", () => {
    // Deliberately NOT tightened: an adaptive shift measured 35% slower at arena
    // scale, and this error is not a precision anything at that magnitude uses.
    // Bound: truncating BOTH operands by the tier's step moves the root by up to
    // ~√2 of it, plus the isqrt floor — three steps covers it with room.
    for (const [name, s, step] of [
      ["arena (2200 u)", 144179200, 256],
      ["far field (200000 u)", 13107200000, 65536],
    ] as ReadonlyArray<[string, number, number]>) {
      const rnd = lcg(0x1e3 + s);
      for (let i = 0; i < 200; i++) {
        const x = Math.round((rnd() * 2 - 1) * s);
        const y = Math.round((rnd() * 2 - 1) * s);
        const got = B(vLen(vec(x as Fx, y as Fx)));
        const want = refMag(x, y);
        const err = got > want ? got - want : want - got;
        expect(Number(err), `${name} (${x}, ${y})`).toBeLessThanOrEqual(3 * step);
      }
    }
  });

  it("is what the old spelling got wrong: an accel-scale vector is now exact", () => {
    // (0.2222, 0.1778) u/tick² — the /256 pre-divide put this 2.5% low.
    const a = vec(fxFromFloat(0.2222) as Fx, fxFromFloat(0.1778) as Fx);
    expect(B(vLen(a))).toBe(refMag(a.x, a.y));
    expect(toFloat(vLen(a))).toBeCloseTo(Math.hypot(0.2222, 0.1778), 4);
  });

  it("vDist is vLen of the difference, exactly", () => {
    const rnd = lcg(0xd15);
    for (let i = 0; i < 300; i++) {
      const ax = Math.round((rnd() * 2 - 1) * 144179200);
      const ay = Math.round((rnd() * 2 - 1) * 144179200);
      const bx = Math.round((rnd() * 2 - 1) * 144179200);
      const by = Math.round((rnd() * 2 - 1) * 144179200);
      expect(vDist(vec(ax as Fx, ay as Fx), vec(bx as Fx, by as Fx))).toBe(
        vLen(vec((ax - bx) as Fx, (ay - by) as Fx)),
      );
    }
  });
});

describe("vNorm", () => {
  it("is within one raw unit of unit length at every scale", () => {
    for (const [name, s] of SCALES) {
      const rnd = lcg(0x0a0 + s);
      for (let i = 0; i < 200; i++) {
        const x = Math.round((rnd() * 2 - 1) * s);
        const y = Math.round((rnd() * 2 - 1) * s);
        if (x === 0 && y === 0) continue;
        const l = Number(refMag(vNorm(vec(x as Fx, y as Fx)).x, vNorm(vec(x as Fx, y as Fx)).y));
        expect(Math.abs(l - FX_ONE), `${name} (${x}, ${y})`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("holds direction to within a raw unit per component (it kept 8 bits before)", () => {
    const a = vec(fxFromFloat(Math.cos(0.7)) as Fx, fxFromFloat(Math.sin(0.7)) as Fx);
    const n = vNorm(a);
    expect(Math.abs(toFloat(n.x) - Math.cos(0.7))).toBeLessThan(1 / 32768);
    expect(Math.abs(toFloat(n.y) - Math.sin(0.7))).toBeLessThan(1 / 32768);
  });
});

describe("vProj / pythLeg", () => {
  it("vProj is the exact clamped ratio of two exact dots", () => {
    const rnd = lcg(0x9209);
    for (let i = 0; i < 300; i++) {
      const ab = vec(Math.round((rnd() * 2 - 1) * 144179200) as Fx, Math.round((rnd() * 2 - 1) * 144179200) as Fx);
      const rel = vec(Math.round((rnd() * 2 - 1) * 144179200) as Fx, Math.round((rnd() * 2 - 1) * 144179200) as Fx);
      const den = vDot(ab, ab);
      const num = vDot(rel, ab);
      const want = den <= 0 || num <= 0 ? 0n : num >= den ? B(FX_ONE) : refDiv(num, den);
      expect(B(vProj(rel, ab))).toBe(want);
    }
  });

  it("pythLeg is exact where the hypotenuse squares exactly", () => {
    const rnd = lcg(0x9111);
    for (let i = 0; i < 300; i++) {
      const hyp = Math.round(rnd() * 2621440);
      const leg = Math.round(rnd() * 2621440);
      const want = hyp * hyp - leg * leg <= 0 ? 0n : bIsqrt(B(hyp) * B(hyp) - B(leg) * B(leg));
      expect(B(pythLeg(hyp as Fx, leg as Fx))).toBe(want);
    }
  });

  it("pythLeg keeps its bits past that, and still clamps a miss to zero", () => {
    const hyp = fx(300_000);
    const leg = fx(180_000);
    expect(toFloat(pythLeg(hyp, leg))).toBeCloseTo(240_000, -1);
    expect(pythLeg(fx(200_000), fx(400_000))).toBe(0);
  });
});
