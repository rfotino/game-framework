/**
 * Fixed-point math: 16.16 signed (1 world unit = 65536). All sim positions,
 * velocities, and physics use Fx values (branded numbers, stored as plain ints).
 *
 * Why: float math differs subtly across CPUs/JITs/languages, which breaks
 * cross-platform determinism and golden-replay verification of future ports.
 * Integer math is exact everywhere. Convert to float only at the render boundary.
 *
 * An Fx is an EXACT INTEGER, not an int32. It is held in a float64, which
 * represents every integer below 2^53 exactly, so the range is |value| < 2^37
 * world units and arithmetic stays bit-identical on every platform: IEEE-754
 * pins add, subtract, multiply and floor exactly, and an int64 port reproduces
 * these results directly. Nothing here relies on 32-bit wrapping.
 *
 * The ceiling that remains is on the PRODUCT, not the value: `mul`, `div` and
 * the magnitude helpers need their intermediate below 2^53, and each states its
 * own bound. Past it a result sheds low bits deterministically — it does NOT
 * wrap to a negative number, so the failure mode is a rounding error rather
 * than a sign flip, and it is bounded by the magnitude that caused it.
 */

export type Fx = number & { readonly __fx: unique symbol };

export const FX_SHIFT = 16;
export const FX_ONE = (1 << FX_SHIFT) as Fx;

/** The exact-integer ceiling of a float64. Every bound below is stated against it. */
const EXACT = 9007199254740992; // 2^53

/** Int -> fixed. Multiplies rather than shifts: `<<` is int32 and wraps past 32768 u. */
export const fx = (n: number): Fx => ((n | 0) * FX_ONE) as Fx;

/**
 * Float -> fixed. Use ONLY at boundaries (content loading, tuning params).
 *
 * The `+ 0` here and on `neg`/`mul`/`div` collapses negative zero, which `| 0`
 * used to do as a side effect. A `-0` compares equal to `0` in arithmetic but
 * not under `Object.is`, and JSON round-trips it to `0` — so left alone it makes
 * a state differ from itself across the wire while every value in it matches.
 */
export const fxFromFloat = (f: number): Fx => (Math.round(f * FX_ONE) + 0) as Fx;

/** Fixed -> float. RENDER BOUNDARY ONLY. */
export const toFloat = (a: Fx): number => a / FX_ONE;

/** Fixed -> whole world units (floor). Not `>>`: that is int32 and wraps past 32768 u. */
export const toInt = (a: Fx): number => Math.floor(a / FX_ONE);

export const add = (a: Fx, b: Fx): Fx => (a + b) as Fx;
export const sub = (a: Fx, b: Fx): Fx => (a - b) as Fx;
export const neg = (a: Fx): Fx => (-a + 0) as Fx;

/**
 * Multiply. The product is formed in float64 and is exact while |a·b| < 2^53,
 * i.e. |a| · |b| < 2^21 world units² — so `mul(d, d)` is exact to d ≈ 1448 u.
 * Past that it rounds rather than wraps. For squared lengths and dot products at
 * arena scale use `vDot` / `vLen` / `vDist` below, which never form the product.
 */
export const mul = (a: Fx, b: Fx): Fx => (Math.floor((a * b) / FX_ONE) + 0) as Fx;

/** Divide (b != 0). The numerator is exact while |a| < 2^21 world units. */
export const div = (a: Fx, b: Fx): Fx => (Math.floor((a * FX_ONE) / b) + 0) as Fx;

export const abs = (a: Fx): Fx => (a < 0 ? -a : a) as Fx;
export const min = (a: Fx, b: Fx): Fx => (a < b ? a : b);
export const max = (a: Fx, b: Fx): Fx => (a > b ? a : b);
export const clamp = (a: Fx, lo: Fx, hi: Fx): Fx => min(max(a, lo), hi);

/** Linear interpolate a->b by t (t is fixed, FX_ONE = 1.0). Sim-safe. */
export const lerp = (a: Fx, b: Fx, t: Fx): Fx => add(a, mul(sub(b, a), t));

/** Deterministic integer floor-sqrt of a non-negative integer below 2^53. */
const isqrt = (n: number): number => {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n)); // float seed…
  // …then corrected to the exact integer floor, integer-only:
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
};

/** Integer sqrt of a fixed value, result fixed. Exact while |a| < 2^21 world units. */
export const sqrt = (a: Fx): Fx => {
  if (a <= 0) return 0 as Fx;
  // sqrt(a / 2^16) * 2^16 = sqrt(a * 2^16) = isqrt(a << 16)
  return isqrt(a * FX_ONE) as Fx;
};

export interface Vec2 {
  x: Fx;
  y: Fx;
}

export const vec = (x: Fx, y: Fx): Vec2 => ({ x, y });
export const vAdd = (a: Vec2, b: Vec2): Vec2 => vec(add(a.x, b.x), add(a.y, b.y));
export const vSub = (a: Vec2, b: Vec2): Vec2 => vec(sub(a.x, b.x), sub(a.y, b.y));
export const vScale = (a: Vec2, s: Fx): Vec2 => vec(mul(a.x, s), mul(a.y, s));

/**
 * Magnitude helpers, arena-safe.
 *
 * A squared length leaves the exact-integer range once the length passes
 * √(2^53) fx ≈ 1448 world units, so the naive `mul(x,x) + mul(y,y)` spelling
 * starts shedding the low bits a comparison depends on — fatal in any world
 * bigger than a few screens. Everything below divides each component down
 * BEFORE multiplying, so the product stays under 2^53 and exact, then scales
 * back. Integer-only, so determinism holds across platforms and future ports.
 *
 * The trade: sub-1/256-unit precision is dropped from the inputs. That is
 * negligible for distances, collision and normals, and it is the price of
 * being correct at arena scale.
 */
const VEC_SHIFT_DIV = 256; // 2^8, applied by division + trunc so it is sign-symmetric

/**
 * Past 262144 u a /256 pre-divide is no longer enough to keep the square exact,
 * and each helper below falls through to a `…Wide` spelling that divides by
 * 65536 instead — where 1 u is already far under the rounding of the answer.
 *
 * The fall-through is decided by testing the SQUARE that was going to be
 * computed anyway, not the inputs: one comparison on a live value instead of
 * four on cold ones, and the divisor stays a literal so it still folds. Both
 * matter — these are the hottest functions here, and the input-testing spelling
 * measured up to 13% of sim CPU in a game that calls `vLen` per entity pair.
 */
const WIDE_DIV = 65536;

/**
 * `a · b` as an exact DOUBLE in shifted-fx units — NOT a storable `Fx`.
 * Deliberately typed `number`: at world scale the true value dwarfs its
 * operands, so use it for COMPARISONS and RATIOS only, never as an operand to
 * an Fx op. Two dots compare only when both were formed at the same scale.
 */
export const vDot = (a: Vec2, b: Vec2): number => {
  const ax = Math.trunc(a.x / 256);
  const ay = Math.trunc(a.y / 256);
  const bx = Math.trunc(b.x / 256);
  const by = Math.trunc(b.y / 256);
  const q = ax * bx + ay * by;
  return q > -EXACT && q < EXACT ? q : dotWide(a, b);
};

const dotWide = (a: Vec2, b: Vec2): number =>
  Math.trunc(a.x / WIDE_DIV) * Math.trunc(b.x / WIDE_DIV) + Math.trunc(a.y / WIDE_DIV) * Math.trunc(b.y / WIDE_DIV);

/**
 * `a × b`, the 2D scalar cross, as an exact DOUBLE in shifted-fx units —
 * arena-safe, and (like `vDot`) for signs and ratios only. Point-in-polygon and
 * winding tests need this: both operands are world-scale, so the Fx spelling
 * loses the bits the sign rests on and the winding flips.
 */
export const vCross = (a: Vec2, b: Vec2): number => {
  const ax = Math.trunc(a.x / 256);
  const ay = Math.trunc(a.y / 256);
  const bx = Math.trunc(b.x / 256);
  const by = Math.trunc(b.y / 256);
  const q = ax * by - ay * bx;
  return q > -EXACT && q < EXACT ? q : crossWide(a, b);
};

const crossWide = (a: Vec2, b: Vec2): number =>
  Math.trunc(a.x / WIDE_DIV) * Math.trunc(b.y / WIDE_DIV) - Math.trunc(a.y / WIDE_DIV) * Math.trunc(b.x / WIDE_DIV);

/**
 * Squared length as an exact DOUBLE, arena-safe — same units as `vDot`, and the
 * same "comparisons and ratios only" caveat. The spelling to reach for when
 * comparing a distance against a radius without paying for a square root.
 */
export const vLenSq2 = (a: Vec2): number => vDot(a, a);

/** |a| in fixed-point, correct across the full Fx range. */
export const vLen = (a: Vec2): Fx => {
  const x = Math.trunc(a.x / 256);
  const y = Math.trunc(a.y / 256);
  const q = x * x + y * y;
  return (q < EXACT ? isqrt(q) * 256 : magWide(a.x, a.y)) as Fx;
};

const magWide = (dx: Fx, dy: Fx): Fx => {
  const x = Math.trunc(dx / WIDE_DIV);
  const y = Math.trunc(dy / WIDE_DIV);
  return (isqrt(x * x + y * y) * WIDE_DIV) as Fx;
};

/** |a − b| in fixed-point, correct across the full Fx range. */
export const vDist = (a: Vec2, b: Vec2): Fx => {
  const dx = (a.x - b.x) as Fx;
  const dy = (a.y - b.y) as Fx;
  const x = Math.trunc(dx / 256);
  const y = Math.trunc(dy / 256);
  const q = x * x + y * y;
  return (q < EXACT ? isqrt(q) * 256 : magWide(dx, dy)) as Fx;
};

/**
 * `a / |a|`. The naive spelling (`vScale(a, div(FX_ONE, vLen(a)))`) forms a
 * reciprocal that keeps only ~8 significant bits at world scale, so its "unit"
 * vector can be off by 15%+; this divides component-wise in shifted integer
 * space instead. Zero-length ⇒ (0, 0).
 */
export const vNorm = (a: Vec2): Vec2 => {
  const d = Math.trunc(a.x / 256) ** 2 + Math.trunc(a.y / 256) ** 2 < EXACT ? 256 : WIDE_DIV;
  const x = Math.trunc(a.x / d);
  const y = Math.trunc(a.y / d);
  const l = isqrt(x * x + y * y);
  if (l <= 0) return vec(0 as Fx, 0 as Fx);
  return vec(Math.round((x * FX_ONE) / l) as Fx, Math.round((y * FX_ONE) / l) as Fx);
};

/**
 * The clamped projection of `rel` onto segment vector `ab` — `clamp(rel·ab / ab·ab, 0, 1)`
 * — as an `Fx` in [0, FX_ONE]. The closest-point-on-segment primitive. Both dots
 * are arena-safe (`vDot`), and the ratio is formed in integer space and rounded,
 * so it is bit-identical on every platform.
 */
export const vProj = (rel: Vec2, ab: Vec2): Fx => {
  const den = vDot(ab, ab);
  if (den <= 0) return 0 as Fx;
  const num = vDot(rel, ab);
  if (num <= 0) return 0 as Fx;
  if (num >= den) return FX_ONE;
  return Math.round((num * FX_ONE) / den) as Fx;
};

/**
 * The other leg of a right triangle: √(hyp² − leg²), arena-safe. Turns "how far
 * off-axis a circle's centre sits" into "where a ray crosses its rim" — the
 * ray-vs-disc primitive. A leg longer than the hypotenuse (the ray misses)
 * clamps to 0 rather than going imaginary.
 */
export const pythLeg = (hyp: Fx, leg: Fx): Fx => {
  const d = Math.trunc(hyp / 256) ** 2 < EXACT ? 256 : WIDE_DIV;
  const h = Math.trunc(hyp / d);
  const l = Math.trunc(leg / d);
  const q = h * h - l * l;
  return (q <= 0 ? 0 : isqrt(q) * d) as Fx;
};

/**
 * Squared length as an `Fx`. DANGER: only valid while |a| < 1448 world units —
 * past that the square leaves the exact-integer range and sheds low bits. Kept
 * for small local vectors (screen-space, per-tick deltas) where it is exact;
 * anywhere the magnitude can reach world scale, use `vLenSq2` or `vLen`.
 */
export const vLenSq = (a: Vec2): Fx => add(mul(a.x, a.x), mul(a.y, a.y));

/**
 * Whether `v` is still an Fx this arithmetic can hold exactly. For a game's
 * state invariants, not for a tick: a value that fails this took a float in
 * through some boundary, and a non-integer Fx is the one thing here that drifts
 * per-platform instead of being reproducible.
 */
export const fxIsExact = (v: number): boolean => Number.isInteger(v) && v > -EXACT && v < EXACT;
