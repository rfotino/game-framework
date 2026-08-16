/**
 * Angles: an integer turn, and the two tables that turn one into a direction.
 *
 * A sim needs "the unit vector at an arbitrary bearing" and cannot have `Math.cos`. The
 * libm behind it is not specified to a bit, so two clients on different engine builds
 * disagree about where a ship is pointing, by one fx unit, forever — and the replay hash
 * diverges with nothing wrong in the game code. What ships instead is a pair of CHECKED-IN
 * tables and integer arithmetic over them, so a direction is a function of a source file
 * rather than of a runtime.
 *
 * An `Ang` is an EXACT INTEGER count of 2^-20 turns: 1048576 to the full turn, one unit
 * ~ 0.00034 degrees. Not radians — a radian is irrational in every fixed-point unit, so a
 * wrap would round and a full turn would not come back where it started. Wrapping here is
 * `a mod 2^20`, exact, so a bearing has ONE value rather than a class of nearly-equal ones.
 *
 * It is a separate brand from `Fx` on purpose. Both are exact integers in a float64, and
 * nothing but the brand would stop a bearing being added to a position.
 *
 * `vFromAng` splits the bearing into a coarse index (1/1024 turn) and a fine one (1/2^20
 * turn) and combines the two table entries through the angle-addition identity. That
 * identity is EXACT MATH, not an interpolation: with the tables held at 2^24 the products
 * stay below 2^48 and their sum below 2^49, both exact in a float64; the divisor is 2^32,
 * a power of two, so the scaling is exact too. The only rounding in the path is the two
 * table entries, done once at generation time, and the final `Math.round`, which
 * ECMAScript pins to the bit. The result is bit-identical on every IEEE-754 engine, which
 * `Math.cos` at the same accuracy is not.
 *
 * There is no bitwise operator in this file, including on the table indices where one
 * would be harmless. The pattern reads as sanctioned to whoever copies it next, and two
 * lines later it is on an `Fx`.
 */

import { FX_ONE, vec, type Fx, type Vec2 } from "./fixed.js";
import { ANG_ATAN, ANG_ATAN_N, ANG_COARSE, ANG_FINE, ANG_FINE_N } from "./angle-tables.js";

export type Ang = number & { readonly __ang: unique symbol };

/**
 * 2^20 units to the turn — the modulus, and the only conversion constant here.
 *
 * Why not more: a unit is 0.00034 degrees, and the direction `vFromAng` returns is itself
 * only good to about 2 units, so the unit is finer than the primitive consuming it. Why
 * not less: 2^20 = 1024 · 1024 is what makes the split into two tables of 1024 an exact
 * identity rather than an interpolation.
 */
export const ANG_TURN = 1048576;
export const ANG_HALF = 524288;
export const ANG_QUARTER = 262144;

/** The tables are 2^24; an `Fx` is 2^16; a product of two table entries is 2^48. */
const TWO_32 = 4294967296;

/**
 * Any integer -> the equivalent bearing in [0, ANG_TURN). The spelling for "make this an
 * angle again" after adding a turn rate to it, and the only way to get an `Ang` back out
 * of arithmetic — `a + delta` on branded numbers is a plain `number`, so the type asks for
 * this at exactly the point where forgetting it is the bug.
 *
 * `a % ANG_TURN` is NOT this. `%` keeps the sign of its dividend, so a bearing that steps
 * below zero comes back NEGATIVE and the index `vFromAng` forms from it reads off the
 * front of the table. This adds the modulus back, and collapses the `-0` that
 * `(-ANG_TURN) % ANG_TURN` produces — same reason as `neg` in fixed.ts.
 */
export const angWrap = (a: number): Ang => {
  const r = a % ANG_TURN;
  return (r < 0 ? r + ANG_TURN : r + 0) as Ang;
};

/**
 * The SIGNED shortest way round from `b` to `a`, in [-ANG_TURN/2, ANG_TURN/2). "How far
 * off my bearing am I": the sign is the direction to steer, the magnitude is the error.
 *
 * Plain `a - b` is not this, and the failure is spectacular rather than subtle. Bearings 1
 * and ANG_TURN-1 are two units apart; subtracted they are 1048574 apart, so a controller
 * fed the difference spins the long way round to cover 0.0007 degrees.
 *
 * It returns a plain `number`, not an `Ang`: a signed difference is not a bearing, and
 * feeding one back in has to go through `angWrap` like any other arithmetic. Exactly
 * opposite bearings return -ANG_TURN/2 rather than +; the tie has to fall somewhere, and a
 * caller who cares which way a thing turns through 180 degrees breaks it itself.
 */
export const angDiff = (a: Ang, b: Ang): number => angWrap(a - b + ANG_HALF) - ANG_HALF;

/**
 * Turns -> `Ang`. The general boundary constructor, and the one radians go through:
 * `angFromTurns(rad / (2 * Math.PI))`. Exact for any dyadic argument.
 */
export const angFromTurns = (t: number): Ang => angWrap(Math.round(t * ANG_TURN));

/**
 * Degrees -> `Ang`. BOUNDARY ONLY — content loading and tuning params, like `fxFromFloat`,
 * and never per tick.
 *
 * 2^20 is not divisible by 360, so a degree is not a whole number of units and this ROUNDS
 * by up to half a unit (0.00017 degrees). Quarters and eighths of a turn are exact
 * (90 -> 262144, 45 -> 131072); thirds and twelfths are not. Calling it per tick is the
 * hazard: two float spellings of one authored angle can land a unit apart, and the
 * difference is then in the sim rather than in the content file.
 */
export const angFromDeg = (deg: number): Ang => angWrap(Math.round((deg * ANG_TURN) / 360));

/** `Ang` -> degrees. RENDER AND DEBUG BOUNDARY ONLY. */
export const angToDeg = (a: Ang): number => (a * 360) / ANG_TURN;

/**
 * `Ang` -> radians. RENDER BOUNDARY ONLY — a canvas rotation takes float radians, and
 * without this every game writes the conversion again with its own sign convention. Do not
 * keep a float bearing beside the `Ang` one; that is a second source of truth.
 */
export const angToRad = (a: Ang): number => (a / ANG_TURN) * Math.PI * 2;

/**
 * The unit vector at bearing `a`: (cos, sin) in fx, |v| = FX_ONE +/- 0.71, each component
 * within 0.51 fx of the true one. The four cardinal bearings are exact.
 *
 * This is the primitive `vRot` was written not to need, and it is for the case `vRot` does
 * not cover. A body that already HAS a facing holds it as a rotor and turns with `vRot` —
 * four multiplies, no table, exact. This is for a bearing that is authored, swept or
 * aimed, where the angle is the thing the designer typed. Games without it grow a
 * precomputed direction table at whatever resolution they guessed at, and pay for it with
 * authored sweep rates collapsing onto a common value and a sim position sitting behind
 * the rendered one.
 *
 * It wraps its own argument. That is one modulo against a table lookup and four
 * multiplies, and without it an accumulator that stepped past a turn indexes off the end
 * of the table and puts a NaN into sim state, which propagates silently and hashes.
 */
export const vFromAng = (a: Ang): Vec2 => {
  const w = angWrap(a);
  const ci = Math.floor(w / ANG_FINE_N);
  const fi = w - ci * ANG_FINE_N;
  const cx = ANG_COARSE[ci * 2];
  const cy = ANG_COARSE[ci * 2 + 1];
  const fx0 = ANG_FINE[fi * 2];
  const fy0 = ANG_FINE[fi * 2 + 1];
  return vec(
    (Math.round((cx * fx0 - cy * fy0) / TWO_32) + 0) as Fx,
    (Math.round((cy * fx0 + cx * fy0) / TWO_32) + 0) as Fx,
  );
};

/**
 * The bearing of `v`, in [0, ANG_TURN) — the deterministic `Math.atan2`, integer
 * throughout, within 2 units (0.0007 degrees) of the true angle. The octant fold reduces
 * the vector to a ratio and a ratio is scale-free, so a 0.2 u/tick^2 acceleration and a
 * 2200 u arena offset get the same accuracy. `angOf(vFromAng(a))` returns `a` within 3.
 *
 * (0, 0) gives 0, which is a choice and not an answer.
 *
 * The bound is on the COMPONENTS, not the ratio: the larger one is multiplied by
 * ANG_ATAN_N to form the index, so it needs |component| < 2^41 — 2^25 world units, about
 * 33.5 million. Past that the quotient sheds low bits and the bearing is merely
 * approximate; it does not wrap or go imaginary.
 */
export const angOf = (v: Vec2): Ang => {
  const x: number = v.x;
  const y: number = v.y;
  if (x === 0 && y === 0) return 0 as Ang;
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  const swap = ay > ax;
  const num = swap ? ax : ay;
  const den = swap ? ay : ax;
  const q = num * ANG_ATAN_N;
  // `num === den` on the octant diagonal puts the index on the table's LAST entry, where
  // reading `idx + 1` runs off the end and returns a NaN bearing. Step back into the final
  // cell instead: the remainder becomes a whole cell, so the interpolation lands on that
  // same last entry by arithmetic rather than by a second branch.
  const raw = Math.floor(q / den);
  const idx = raw < ANG_ATAN_N ? raw : ANG_ATAN_N - 1;
  const rem = q - idx * den;
  const a0 = ANG_ATAN[idx];
  const a1 = ANG_ATAN[idx + 1];
  let ang = a0 + Math.round(((a1 - a0) * rem) / den);
  if (swap) ang = ANG_QUARTER - ang;
  if (x < 0) ang = ANG_HALF - ang;
  if (y < 0) ang = -ang;
  return angWrap(ang);
};
