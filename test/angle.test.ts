/**
 * The angle surface: the hazards each function exists to prevent, and the accuracy the
 * module header promises. Bounds here are the MEASURED numbers with a unit of slack, so a
 * regression that doubles an error fails even though nothing rounds differently.
 */
import { describe, expect, it } from "vitest";
import {
  ANG_HALF,
  ANG_QUARTER,
  ANG_TURN,
  angDiff,
  angFromDeg,
  angFromTurns,
  angOf,
  angToRad,
  angWrap,
  vFromAng,
  type Ang,
} from "../src/engine/angle.js";
import { FX_ONE, fx, vLen, vec } from "../src/engine/fixed.js";

const a = (n: number): Ang => n as Ang;

describe("angWrap", () => {
  it("brings any integer into [0, ANG_TURN)", () => {
    expect(angWrap(0)).toBe(0);
    expect(angWrap(ANG_TURN)).toBe(0);
    expect(angWrap(ANG_TURN + 5)).toBe(5);
    expect(angWrap(3 * ANG_TURN + 7)).toBe(7);
    expect(angWrap(-5)).toBe(ANG_TURN - 5);
    expect(angWrap(-3 * ANG_TURN - 1)).toBe(ANG_TURN - 1);
  });

  /** The hazard the function exists for: `%` alone hands back a negative bearing, and the
   *  table index formed from one reads off the front. */
  it("is not `%`, which keeps the sign of its dividend", () => {
    expect(-1 % ANG_TURN).toBe(-1);
    expect(angWrap(-1)).toBe(ANG_TURN - 1);
  });

  it("collapses the negative zero `%` produces", () => {
    expect(Object.is(angWrap(-ANG_TURN), 0)).toBe(true);
    expect(Object.is(angWrap(-2 * ANG_TURN), 0)).toBe(true);
  });
});

describe("angDiff", () => {
  it("takes the short way across the seam", () => {
    expect(angDiff(a(1), a(ANG_TURN - 1))).toBe(2);
    expect(angDiff(a(ANG_TURN - 1), a(1))).toBe(-2);
  });

  it("is zero against itself and stays in [-half, half)", () => {
    for (let i = 0; i < ANG_TURN; i += 1009) {
      expect(angDiff(a(i), a(i))).toBe(0);
      for (let j = 0; j < ANG_TURN; j += 104729) {
        const d = angDiff(a(i), a(j));
        expect(d).toBeGreaterThanOrEqual(-ANG_HALF);
        expect(d).toBeLessThan(ANG_HALF);
      }
    }
  });

  it("puts exactly opposite bearings at -half, not +half", () => {
    expect(angDiff(a(ANG_HALF), a(0))).toBe(-ANG_HALF);
  });
});

describe("the boundary constructors", () => {
  it("lands quarters and eighths of a turn exactly", () => {
    expect(angFromDeg(0)).toBe(0);
    expect(angFromDeg(45)).toBe(ANG_TURN / 8);
    expect(angFromDeg(90)).toBe(ANG_QUARTER);
    expect(angFromDeg(180)).toBe(ANG_HALF);
    expect(angFromDeg(270)).toBe(3 * ANG_QUARTER);
    expect(angFromDeg(360)).toBe(0);
    expect(angFromDeg(-90)).toBe(3 * ANG_QUARTER);
  });

  it("rounds a degree that is not a whole number of units", () => {
    // 2^20 / 360 is not an integer, so a third of a turn cannot be exact.
    expect(angFromDeg(120)).toBe(Math.round((120 * ANG_TURN) / 360));
  });

  it("takes turns, which is how radians get in", () => {
    expect(angFromTurns(0.25)).toBe(ANG_QUARTER);
    expect(angFromTurns(Math.PI / 2 / (2 * Math.PI))).toBe(ANG_QUARTER);
    expect(angToRad(a(ANG_QUARTER))).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe("vFromAng", () => {
  it("puts the four cardinals exactly on the axes", () => {
    expect(vFromAng(a(0))).toEqual(vec(FX_ONE, fx(0)));
    expect(vFromAng(a(ANG_QUARTER))).toEqual(vec(fx(0), FX_ONE));
    expect(vFromAng(a(ANG_HALF))).toEqual(vec(-FX_ONE as typeof FX_ONE, fx(0)));
    expect(vFromAng(a(3 * ANG_QUARTER))).toEqual(vec(fx(0), -FX_ONE as typeof FX_ONE));
  });

  /** The whole turn, not a sample — it is the total proof. Counted rather than asserted
   *  per bearing: a million `expect` calls cost far more than the million lookups do. */
  it("is a unit vector at every one of the 1048576 bearings", () => {
    let off = 0;
    for (let i = 0; i < ANG_TURN; i++) {
      const len = vLen(vFromAng(a(i)));
      if (len !== FX_ONE && len !== FX_ONE - 1) off++;
    }
    expect(off).toBe(0);
  });

  it("is within 0.71 fx of the true direction", () => {
    let worst = 0;
    for (let i = 0; i < ANG_TURN; i += 37) {
      const v = vFromAng(a(i));
      const t = (i / ANG_TURN) * Math.PI * 2;
      worst = Math.max(worst, Math.hypot(v.x - FX_ONE * Math.cos(t), v.y - FX_ONE * Math.sin(t)));
    }
    expect(worst).toBeLessThan(0.75);
  });

  /** A slow sweep that steps backwards is what a coarse table reads as judder. Zero
   *  backsteps, measured — so this is exact, not a tolerance. */
  it("never steps backwards across a quadrant", () => {
    let px = vFromAng(a(0)).x;
    let py = vFromAng(a(0)).y;
    let backsteps = 0;
    for (let i = 1; i <= ANG_QUARTER; i++) {
      const v = vFromAng(a(i));
      if (v.x > px || v.y < py) backsteps++;
      px = v.x;
      py = v.y;
    }
    expect(backsteps).toBe(0);
  });

  /** Not exact, and the reason is worth pinning: `Math.round` breaks ties toward +inf, so
   *  a component landing on exactly k.5 rounds one way and its mirror the other. */
  it("is quadrant-symmetric to within one", () => {
    let worst = 0;
    for (let i = 0; i < ANG_TURN; i += 11) {
      const p = vFromAng(a(i));
      const q = vFromAng(angWrap(i + ANG_QUARTER));
      worst = Math.max(worst, Math.abs(q.x - -p.y), Math.abs(q.y - p.x));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("wraps its own argument", () => {
    expect(vFromAng(a(ANG_TURN + 12))).toEqual(vFromAng(a(12)));
    expect(vFromAng(a(-12))).toEqual(vFromAng(angWrap(-12)));
  });
});

describe("angOf", () => {
  it("reads the cardinals and the diagonals exactly", () => {
    expect(angOf(vec(FX_ONE, fx(0)))).toBe(0);
    expect(angOf(vec(fx(0), FX_ONE))).toBe(ANG_QUARTER);
    expect(angOf(vec(-FX_ONE as typeof FX_ONE, fx(0)))).toBe(ANG_HALF);
    expect(angOf(vec(fx(0), -FX_ONE as typeof FX_ONE))).toBe(3 * ANG_QUARTER);
    expect(angOf(vec(fx(1), fx(1)))).toBe(ANG_TURN / 8);
  });

  it("answers 0 for the zero vector, which is a choice", () => {
    expect(angOf(vec(fx(0), fx(0)))).toBe(0);
  });

  /** The octant fold reduces to a ratio, and a ratio is scale-free — so a per-tick
   *  acceleration and an arena offset get the same accuracy. */
  it("is within 2 units at every magnitude", () => {
    let worst = 0;
    for (const r of [3, 1e3, 65536, 1e7]) {
      for (let i = 0; i < 4001; i++) {
        const t = (i / 4001) * Math.PI * 2;
        const v = vec(Math.round(Math.cos(t) * r) as never, Math.round(Math.sin(t) * r) as never);
        if (v.x === 0 && v.y === 0) continue;
        let want = (Math.atan2(v.y, v.x) / (Math.PI * 2)) * ANG_TURN;
        if (want < 0) want += ANG_TURN;
        let d = Math.abs(angOf(v) - want);
        if (d > ANG_HALF) d = ANG_TURN - d;
        worst = Math.max(worst, d);
      }
    }
    expect(worst).toBeLessThan(2);
  });

  it("round-trips a bearing through vFromAng within 3", () => {
    let worst = 0;
    for (let i = 0; i < ANG_TURN; i += 13) {
      worst = Math.max(worst, Math.abs(angDiff(angOf(vFromAng(a(i))), a(i))));
    }
    expect(worst).toBeLessThanOrEqual(3);
  });
});
