/**
 * The three paths that still held the int32 shape after v0.3.0/v0.4.0: the
 * constructor, the square root, and the draw. Each is checked against the true
 * value rather than against another implementation of the same mistake.
 */
import { describe, expect, it } from "vitest";
import {
  FX_ONE,
  Rng,
  fx,
  fxIsExact,
  fxStateViolations,
  add,
  mul,
  sqrt,
  sub,
  toFloat,
  vDistSq,
  vec,
  vRot,
  vLenSq,
  vSub,
  type Fx,
} from "../src/engine/index.js";

describe("fx: the constructor is exact across the range, and never flips sign", () => {
  it("builds the values the type documents — past 2^31 u, where `| 0` wrapped", () => {
    // The old spelling returned -140737488355328 for the first of these.
    for (const n of [2 ** 31, 2 ** 31 + 1, 3e9, 2 ** 34, 2 ** 36]) {
      expect(fx(n)).toBe(n * FX_ONE);
      expect(fx(n)).toBeGreaterThan(0);
      expect(fx(-n)).toBe(-n * FX_ONE);
      expect(fxIsExact(fx(n))).toBe(true);
    }
  });

  it("is unchanged below the old int32 ceiling", () => {
    for (const n of [0, 1, -1, 100, -100, 32767, -32767, 1e6, 2 ** 30]) {
      expect(fx(n)).toBe((n | 0) * FX_ONE);
    }
  });

  it("collapses negative zero, which the coercion used to do for free", () => {
    expect(Object.is(fx(-0), 0)).toBe(true);
    expect(Object.is(fx(0), 0)).toBe(true);
  });

  it("scales a fractional argument instead of truncating it", () => {
    // `fx(1.5)` used to be 1.0 u. A multiple of 2^-16 is a perfectly good Fx.
    expect(toFloat(fx(1.5))).toBe(1.5);
    expect(toFloat(fx(-0.25))).toBe(-0.25);
    expect(fxIsExact(fx(1.5))).toBe(true);
  });

  it("lets a finer-than-2^-16 argument fail fxIsExact rather than rounding it away", () => {
    // This is the leak the guard exists to catch; swallowing it here is what hid it.
    expect(fxIsExact(fx(0.1))).toBe(false);
    expect(fxIsExact(fx(1 / 3))).toBe(false);
  });
});

describe("sqrt: no whole-unit cliff", () => {
  const rel = (a: Fx, want: number): number => Math.abs(toFloat(a) - want) / want;

  it("is within one fixed-point step wherever the product fits", () => {
    for (const v of [2, 3, 100, 12345, 1e6, 2 ** 20]) {
      expect(rel(sqrt(fx(v)), Math.sqrt(v))).toBeLessThan(2e-5);
    }
  });

  it("degrades smoothly past 2^21 u instead of flooring to whole units", () => {
    // The old spelling shed a fixed 2^16 from the operand here, so every answer
    // above this landed on an integer number of world units.
    for (const v of [2 ** 21, 2 ** 24, 2 ** 27, 2 ** 30, 2 ** 33, 2 ** 36]) {
      const got = sqrt(fx(v));
      expect(rel(got, Math.sqrt(v))).toBeLessThan(1e-6);
      expect(fxIsExact(got)).toBe(true);
    }
  });

  it("finds the fractional part the old spelling threw away", () => {
    // √(2^21) = 1448.1547…; floored to whole units that is 1448 exactly.
    expect(toFloat(sqrt(fx(2 ** 21)))).not.toBe(1448);
    expect(toFloat(sqrt(fx(2 ** 21)))).toBeCloseTo(1448.1547, 3);
  });

  it("is zero at and below zero, and terminates at the top of the range", () => {
    expect(sqrt(0 as Fx)).toBe(0);
    expect(sqrt(-5 as Fx)).toBe(0);
    expect(fxIsExact(sqrt(fx(2 ** 36)))).toBe(true);
  });
});

describe("rng.int: covers the range it is given, uniformly", () => {
  it("reaches the whole span past 2^32 raw — 65536 u — which used to be invisible", () => {
    const lo = fx(-200_000);
    const hi = fx(200_000);
    const r = new Rng(1234);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 100_000; i++) {
      const x = r.int(lo, hi);
      if (x < min) min = x;
      if (x > max) max = x;
    }
    // The old draw could not return anything above lo + 2^32 (= -134464 u).
    expect(toFloat(max as Fx)).toBeGreaterThan(190_000);
    expect(toFloat(min as Fx)).toBeLessThan(-190_000);
  });

  it("stays inside its bounds for spans big and small", () => {
    const r = new Rng(7);
    for (const [lo, hi] of [
      [0, 0],
      [5, 5],
      [-3, 3],
      [0, 2],
      [fx(-100_000), fx(100_000)],
    ]) {
      for (let i = 0; i < 2000; i++) {
        const x = r.int(lo, hi);
        expect(x).toBeGreaterThanOrEqual(lo);
        expect(x).toBeLessThanOrEqual(hi);
        expect(Number.isInteger(x)).toBe(true);
      }
    }
  });

  it("is unbiased on a span that does not divide the draw evenly", () => {
    // `nextUint32() % 3` favours 0 and 1; rejection is what removes that.
    const n = 300_000;
    const counts = [0, 0, 0];
    const r = new Rng(99);
    for (let i = 0; i < n; i++) counts[r.int(0, 2)]++;
    for (const c of counts) expect(Math.abs(c / n - 1 / 3)).toBeLessThan(0.005);
  });

  it("chance(num, den) lands on num/den, and saturates at both ends", () => {
    const r = new Rng(11);
    let hits = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) if (r.chance(1, 3)) hits++;
    expect(Math.abs(hits / n - 1 / 3)).toBeLessThan(0.006);
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0, 5)).toBe(false);
      expect(r.chance(5, 5)).toBe(true);
    }
  });

  it("is reproducible from a seed and across save/restore", () => {
    const a = new Rng(4482);
    const b = new Rng(4482);
    for (let i = 0; i < 500; i++) expect(a.int(0, 1000)).toBe(b.int(0, 1000));
    const saved = a.save();
    const before = [a.int(0, 99), a.int(0, 99), a.int(0, 99)];
    const restored = Rng.restore(saved);
    expect([restored.int(0, 99), restored.int(0, 99), restored.int(0, 99)]).toEqual(before);
  });
});

describe("fxStateViolations: the guard that replaces `| 0`", () => {
  it("says nothing about a clean state", () => {
    expect(fxStateViolations({ pos: { x: fx(10), y: fx(-3) }, ticks: 5, id: "a" })).toEqual([]);
  });

  it("names the path of a leaked float, however deep", () => {
    const bad = fxStateViolations({ ships: [{ vel: { x: fx(1), y: 0.5 } }] });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("ships[0].vel.y");
  });

  it("catches a value past the exact-integer range, not just a fraction", () => {
    expect(fxStateViolations({ v: 2 ** 54 })).toHaveLength(1);
    expect(fxStateViolations({ v: Number.NaN })).toHaveLength(1);
    expect(fxStateViolations({ v: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });
});

describe("vDistSq: the allocation-free squared separation", () => {
  it("equals vLenSq(vSub(a, b)) exactly, at every scale", () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 3, 4],
      [1, 1, 1, 1],
      [-7, 12, 40, -3],
      [1200, -800, -2400, 900],
      [19000, 19000, -19000, -19000],
      [300000, 0, -60000, 12345],
    ];
    for (const [ax, ay, bx, by] of cases) {
      const a = vec(fx(ax), fx(ay));
      const b = vec(fx(bx), fx(by));
      expect(vDistSq(a, b), `(${ax},${ay})-(${bx},${by})`).toBe(vLenSq(vSub(a, b)));
    }
  });

  it("compares against a radius the way a caller means it", () => {
    const a = vec(fx(0), fx(0));
    const b = vec(fx(300), fx(400)); // exactly 500 u away
    expect(vDistSq(a, b) < mul(fx(501), fx(501))).toBe(true);
    expect(vDistSq(a, b) < mul(fx(499), fx(499))).toBe(false);
    expect(toFloat(vDistSq(a, b))).toBeCloseTo(250_000, 0);
  });
});

describe("vRot: the one rotation spelling", () => {
  const rot = (v: { x: Fx; y: Fx }, f: { x: Fx; y: Fx }) =>
    vec(sub(mul(v.x, f.x), mul(v.y, f.y)), add(mul(v.x, f.y), mul(v.y, f.x)));

  it("matches the private spelling games grew, exactly", () => {
    for (const [vx, vy, fx1, fy] of [
      [10, 0, 1, 0],
      [10, 0, 0, 1],
      [-37, 88, 0.6, 0.8],
      [1200, -3400, -0.28, 0.96],
      [19000, 19000, 0.70710678, 0.70710678],
    ] as const) {
      const v = vec(fx(vx), fx(vy));
      const f = vec(fx(fx1), fx(fy));
      expect(vRot(v, f)).toEqual(rot(v, f));
    }
  });

  it("preserves length through a quarter turn, and is identity on (1, 0)", () => {
    const v = vec(fx(300), fx(400));
    expect(vRot(v, vec(FX_ONE, 0 as Fx))).toEqual(v);
    const turned = vRot(v, vec(0 as Fx, FX_ONE));
    expect(toFloat(turned.x)).toBeCloseTo(-400, 3);
    expect(toFloat(turned.y)).toBeCloseTo(300, 3);
  });
});
