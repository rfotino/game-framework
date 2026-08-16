/**
 * The generated tables are data, and data rots silently.
 *
 * These tests reproduce the tables rather than trusting them — but with a TOLERANCE,
 * because the reference is `Math.cos` and `Math.cos` is exactly the thing this feature
 * does not believe. An engine that shifts a handful of entries by one ULP must not fail
 * here; a corrupted, truncated, mis-ordered or hand-edited file must.
 *
 * The structural assertions below do not depend on any libm at all, so they are exact.
 */
import { describe, expect, it } from "vitest";
import {
  ANG_ATAN,
  ANG_ATAN_N,
  ANG_COARSE,
  ANG_COARSE_N,
  ANG_FINE,
  ANG_FINE_N,
  ANG_TABLE_SCALE,
} from "../src/engine/angle-tables.js";
import { ANG_TURN } from "../src/engine/angle.js";

const TAU = Math.PI * 2;

describe("the generated tables reproduce, within one", () => {
  it("coarse holds cos and sin at 1/1024 turn", () => {
    let worst = 0;
    for (let i = 0; i < ANG_COARSE_N; i++) {
      const t = (TAU * i) / ANG_COARSE_N;
      worst = Math.max(
        worst,
        Math.abs(ANG_COARSE[i * 2] - Math.round(ANG_TABLE_SCALE * Math.cos(t))),
        Math.abs(ANG_COARSE[i * 2 + 1] - Math.round(ANG_TABLE_SCALE * Math.sin(t))),
      );
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("fine holds cos and sin at 1/2^20 turn", () => {
    let worst = 0;
    for (let i = 0; i < ANG_FINE_N; i++) {
      const t = (TAU * i) / ANG_TURN;
      worst = Math.max(
        worst,
        Math.abs(ANG_FINE[i * 2] - Math.round(ANG_TABLE_SCALE * Math.cos(t))),
        Math.abs(ANG_FINE[i * 2 + 1] - Math.round(ANG_TABLE_SCALE * Math.sin(t))),
      );
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("atan holds atan(i/N) in Ang units", () => {
    let worst = 0;
    for (let i = 0; i <= ANG_ATAN_N; i++) {
      worst = Math.max(worst, Math.abs(ANG_ATAN[i] - Math.round((Math.atan(i / ANG_ATAN_N) / TAU) * ANG_TURN)));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe("structure, which no libm can move", () => {
  it("is sized so the coarse/fine split is exact", () => {
    expect(ANG_COARSE_N * ANG_FINE_N).toBe(ANG_TURN);
    expect(ANG_COARSE.length).toBe(ANG_COARSE_N * 2);
    expect(ANG_FINE.length).toBe(ANG_FINE_N * 2);
    expect(ANG_ATAN.length).toBe(ANG_ATAN_N + 1);
  });

  it("holds only integers inside the scale", () => {
    for (const t of [ANG_COARSE, ANG_FINE]) {
      for (const v of t) {
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(ANG_TABLE_SCALE);
      }
    }
  });

  it("puts the cardinals exactly on the axes", () => {
    const q = ANG_COARSE_N / 4;
    expect([ANG_COARSE[0], ANG_COARSE[1]]).toEqual([ANG_TABLE_SCALE, 0]);
    expect([ANG_COARSE[q * 2], ANG_COARSE[q * 2 + 1]]).toEqual([0, ANG_TABLE_SCALE]);
    expect([ANG_COARSE[q * 4], ANG_COARSE[q * 4 + 1]]).toEqual([-ANG_TABLE_SCALE, 0]);
    expect([ANG_COARSE[q * 6], ANG_COARSE[q * 6 + 1]]).toEqual([0, -ANG_TABLE_SCALE]);
    expect([ANG_FINE[0], ANG_FINE[1]]).toEqual([ANG_TABLE_SCALE, 0]);
  });

  /** The generator seeds one octant and folds; if it ever samples all 1024 instead, this
   *  is what notices, because a sampled table is symmetric only by luck. */
  it("is 8-fold symmetric by construction, exactly", () => {
    const q = ANG_COARSE_N / 4;
    const at = (i: number): [number, number] => {
      const k = ((i % ANG_COARSE_N) + ANG_COARSE_N) % ANG_COARSE_N;
      return [ANG_COARSE[k * 2], ANG_COARSE[k * 2 + 1]];
    };
    // `+ 0` on the expectation because negating a zero in plain JS gives `-0`, which an
    // Int32Array cannot hold — the table is right and the arithmetic building the
    // expectation is what needs normalising.
    const p = (x: number, y: number): [number, number] => [x + 0, y + 0];
    for (let i = 0; i <= ANG_COARSE_N / 8; i++) {
      const [x, y] = at(i);
      expect(at(q - i)).toEqual(p(y, x));
      expect(at(q + i)).toEqual(p(-y, x));
      expect(at(2 * q - i)).toEqual(p(-x, y));
      expect(at(2 * q + i)).toEqual(p(-x, -y));
      expect(at(3 * q - i)).toEqual(p(-y, -x));
      expect(at(3 * q + i)).toEqual(p(y, -x));
      expect(at(4 * q - i)).toEqual(p(x, -y));
    }
  });

  /** A single mangled digit that happens to survive the symmetry fold shows up here. */
  it("keeps every entry on the unit circle", () => {
    const sq = ANG_TABLE_SCALE * ANG_TABLE_SCALE;
    for (const t of [ANG_COARSE, ANG_FINE]) {
      for (let i = 0; i < t.length; i += 2) {
        const r = t[i] * t[i] + t[i + 1] * t[i + 1];
        expect(Math.abs(r - sq) / sq).toBeLessThan(2e-7);
      }
    }
  });

  it("keeps atan monotone from 0 to an eighth turn", () => {
    expect(ANG_ATAN[0]).toBe(0);
    expect(ANG_ATAN[ANG_ATAN_N]).toBe(ANG_TURN / 8);
    for (let i = 1; i <= ANG_ATAN_N; i++) expect(ANG_ATAN[i]).toBeGreaterThan(ANG_ATAN[i - 1]);
  });
});
