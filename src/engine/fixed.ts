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
/** Half of it: two products under this still sum exactly. */
const HALF_EXACT = 4503599627370496;
/** 2^26: the largest operand whose square still leaves room for a second one. */
const TWO_26 = 67108864;
/** 2^24: the smallest a normalize wants, so flooring the length costs 2^-24 of it. */
const TWO_24 = 16777216;

/**
 * World units -> fixed, exact across the whole range an `Fx` holds: `n · 2^16` stays
 * inside 2^53 for every |n| < 2^37 u.
 *
 * It does not coerce its argument, and that is the point. The `| 0` this used to end in
 * capped the CONSTRUCTOR at 2^31 u and wrapped past it — the sign flip the rest of this
 * module exists not to have, on the one function every value enters through. An `n` that
 * is a multiple of 2^-16 scales to an exact `Fx`; anything finer lands between two of
 * them and fails `fxIsExact`, which is where a leaked float is meant to be caught rather
 * than silently truncated here.
 */
export const fx = (n: number): Fx => (n * FX_ONE + 0) as Fx;

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
 * Past 2^53 the direct product is inexact, so it splits `a` at the point and
 * sums two partial products that are each exact — `floor(a·b)` stays EXACT to
 * |a·b| < 2^37 u², the whole range an Fx can hold. There is no magnitude a
 * caller has to think about, and no second spelling to reach for.
 */
export const mul = (a: Fx, b: Fx): Fx => {
  const p = a * b;
  if (p > -EXACT && p < EXACT) return (Math.floor(p / FX_ONE) + 0) as Fx;
  const ah = Math.floor(a / FX_ONE); // a = ah·2^16 + al, al ∈ [0, 2^16)
  return (ah * b + Math.floor(((a - ah * FX_ONE) * b) / FX_ONE) + 0) as Fx;
};

/**
 * Divide (b != 0). Exact — the quotient-and-remainder path keeps the numerator
 * inside 2^53 for any |b| < 2^21 world units, so no caller sizes its operands.
 * The one thing it cannot do is return a quotient bigger than an Fx: `div` by a
 * near-zero `b` asks for a value the type does not hold, and that is the
 * caller's bug rather than a rounding mode.
 */
export const div = (a: Fx, b: Fx): Fx => {
  const n = a * FX_ONE;
  if (n > -EXACT && n < EXACT) return (Math.floor(n / b) + 0) as Fx;
  // a = q·b + r. At this magnitude `a / b` is a ROUNDED quotient, so its floor can
  // sit one off the true one; the remainder says which way and costs nothing when
  // it is already right.
  let q = Math.floor(a / b);
  let r = a - q * b;
  if (b > 0) {
    while (r < 0) (q--, (r += b));
    while (r >= b) (q++, (r -= b));
  } else {
    while (r > 0) (q--, (r += b));
    while (r <= b) (q++, (r -= b));
  }
  return (q * FX_ONE + Math.floor((r * FX_ONE) / b) + 0) as Fx;
};

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

/**
 * `√a`, result fixed. EXACT — `⌊√(a·2^16)⌋` — while |a| < 2^21 u, which is every
 * magnitude a sim forms, and it is the same `isqrt` the magnitude helpers use.
 *
 * Past that the product leaves 2^53, so the operand sheds bits in PAIRS and the result
 * takes them back one at a time: √(a·2^16) = 2^k·√((a/4^k)·2^16). Both scalings are
 * powers of two and therefore exact, so the only rounding is the final floor, and the
 * step stays at 2^-16·2^k rather than collapsing. The spelling this replaced shed a
 * fixed 2^16 from the operand at once, which floored the answer to WHOLE world units —
 * coarser than `vLen` at the same magnitude, from the one helper that promised √.
 */
export const sqrt = (a: Fx): Fx => {
  if (a <= 0) return 0 as Fx;
  if (a * FX_ONE < EXACT) return isqrt(a * FX_ONE) as Fx;
  let v: number = a;
  let s = 1;
  while (v * FX_ONE >= EXACT) {
    v = Math.trunc(v / 4);
    s *= 2;
  }
  return (isqrt(v * FX_ONE) * s) as Fx;
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
 * Magnitude helpers. Every one of them takes `Fx` and returns `Fx`, in world
 * units, with no magnitude a caller has to think about and no second spelling
 * to reach for at a different scale.
 *
 * That is a deliberate contract, and it is the whole design. These used to
 * return "shifted-fx units" whose SCALE depended on how big the inputs were, so
 * two results were comparable only when both were formed at the same magnitude
 * — a rule no type could enforce and every caller had to remember. The products
 * below are formed by splitting at the point instead, which is exact over the
 * range an Fx can hold, so the units are simply the units.
 *
 * The one bound that remains is the square root's, and it is stated where it
 * applies: `mag` is EXACT while both components are under 1024 u — which is every
 * per-tick, unit and ship-scale vector a sim forms — and keeps its old 1/256 u
 * step above that, because a length past that point has a square past 2^53 and no
 * amount of integer care makes it exact.
 */

/**
 * `⌊√(x² + y²)⌋` in raw fx units, integer-only so determinism holds across
 * platforms and ports.
 *
 * The first path forms NO quotient at all and is EXACT — that is the change, and
 * it covers every component under 1024 u. The spelling this replaced divided both
 * operands by 256 at every magnitude, which cost 2.5% on a per-tick acceleration
 * and 0.8% on a unit vector, the two scales a sim spends most of its time at, to
 * buy a range it only needed past 1024 u.
 *
 * Past that the square cannot be exact in a float64 and the old ladder is the
 * right answer, kept verbatim: each divisor stays a LITERAL so the engine folds
 * it. The tier is chosen by testing the OPERANDS here, which is the spelling the
 * v0.3.0 note warned off — that warning was about a variable divisor defeating
 * the fold, and with literal divisors the operand test measures 6% at arena scale
 * against 44% for testing the square and discarding it. Every arrangement in this
 * paragraph was benchmarked; do not rearrange it on taste.
 */
const mag = (x: number, y: number): number => {
  if (x > -TWO_26 && x < TWO_26 && y > -TWO_26 && y < TWO_26) return isqrt(x * x + y * y);
  const a = Math.trunc(x / 256);
  const b = Math.trunc(y / 256);
  const q = a * a + b * b;
  if (q < EXACT) return isqrt(q) * 256;
  return isqrt(Math.trunc(x / 65536) ** 2 + Math.trunc(y / 65536) ** 2) * 65536;
};

/**
 * `a · b` in fx world units. EXACT to |a·b| < 2^37 u² — the products are split
 * at the point and only the sub-unit remainder is floored, once, so there is no
 * per-term rounding bias for a near-zero dot to fall through.
 */
export const vDot = (a: Vec2, b: Vec2): Fx => {
  const px = a.x * b.x;
  const py = a.y * b.y;
  if (px > -HALF_EXACT && px < HALF_EXACT && py > -HALF_EXACT && py < HALF_EXACT) {
    return (Math.floor((px + py) / FX_ONE) + 0) as Fx;
  }
  const xh = Math.floor(a.x / FX_ONE);
  const yh = Math.floor(a.y / FX_ONE);
  return (xh * b.x +
    yh * b.y +
    Math.floor(((a.x - xh * FX_ONE) * b.x + (a.y - yh * FX_ONE) * b.y) / FX_ONE) +
    0) as Fx;
};

/**
 * `a × b`, the 2D scalar cross, in fx world units — same exactness as `vDot`.
 * Point-in-polygon and winding tests rest on this sign, and it is now the sign
 * of the true value wherever the true value is representable at all.
 */
export const vCross = (a: Vec2, b: Vec2): Fx => {
  const px = a.x * b.y;
  const py = a.y * b.x;
  if (px > -HALF_EXACT && px < HALF_EXACT && py > -HALF_EXACT && py < HALF_EXACT) {
    return (Math.floor((px - py) / FX_ONE) + 0) as Fx;
  }
  const xh = Math.floor(a.x / FX_ONE);
  const yh = Math.floor(a.y / FX_ONE);
  return (xh * b.y -
    yh * b.x +
    Math.floor(((a.x - xh * FX_ONE) * b.y - (a.y - yh * FX_ONE) * b.x) / FX_ONE) +
    0) as Fx;
};

/**
 * Squared length as an `Fx`, exact to |a| < 370000 u. The spelling to reach for
 * when comparing a distance against a radius without paying for a square root —
 * and now the ONLY one, at every scale.
 */
export const vLenSq = (a: Vec2): Fx => vDot(a, a);

/** |a| in fixed-point, across the full Fx range. */
export const vLen = (a: Vec2): Fx => mag(a.x, a.y) as Fx;

/** |a − b| in fixed-point, across the full Fx range. */
export const vDist = (a: Vec2, b: Vec2): Fx => mag(a.x - b.x, a.y - b.y) as Fx;

/**
 * `a / |a|`. The naive spelling (`vScale(a, div(FX_ONE, vLen(a)))`) forms a
 * reciprocal that keeps only ~8 significant bits at world scale, so its "unit"
 * vector can be off by 15%+; this divides component-wise instead, at full
 * precision. Zero-length ⇒ (0, 0).
 */
export const vNorm = (a: Vec2): Vec2 => {
  let x: number = a.x;
  let y: number = a.y;
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  let m = ax > ay ? ax : ay;
  if (m === 0) return vec(0 as Fx, 0 as Fx);
  // Seat the longer component in [2^24, 2^26): the length is then floored at 2^-24
  // of itself rather than 2^-13, so a per-tick vector normalizes as precisely as an
  // arena-scale one. Scaling UP is exact — these are powers of two.
  while (m < TWO_24) (x *= 2), (y *= 2), (m *= 2);
  while (m >= TWO_26) (x = Math.trunc(x / 2)), (y = Math.trunc(y / 2)), (m /= 2);
  const l = isqrt(x * x + y * y);
  if (l <= 0) return vec(0 as Fx, 0 as Fx);
  return vec((Math.round((x * FX_ONE) / l) + 0) as Fx, (Math.round((y * FX_ONE) / l) + 0) as Fx);
};

/**
 * The clamped projection of `rel` onto segment vector `ab` — `clamp(rel·ab / ab·ab, 0, 1)`
 * — as an `Fx` in [0, FX_ONE]. The closest-point-on-segment primitive. Both dots
 * are exact, and the ratio goes through `div`, so it is bit-identical on every
 * platform at any magnitude.
 */
export const vProj = (rel: Vec2, ab: Vec2): Fx => {
  const den = vDot(ab, ab);
  if (den <= 0) return 0 as Fx;
  const num = vDot(rel, ab);
  if (num <= 0) return 0 as Fx;
  if (num >= den) return FX_ONE;
  return div(num, den);
};

/**
 * The other leg of a right triangle: √(hyp² − leg²). Turns "how far off-axis a
 * circle's centre sits" into "where a ray crosses its rim" — the ray-vs-disc
 * primitive. A leg longer than the hypotenuse (the ray misses) clamps to 0
 * rather than going imaginary.
 */
export const pythLeg = (hyp: Fx, leg: Fx): Fx => {
  let m = hyp < 0 ? -hyp : hyp;
  if (m * m < EXACT) {
    const q = hyp * hyp - leg * leg;
    return (q <= 0 ? 0 : isqrt(q)) as Fx;
  }
  let s = 1;
  while (m >= TWO_26) {
    m /= 2;
    s *= 2;
  }
  const h = Math.trunc(hyp / s);
  const l = Math.trunc(leg / s);
  const w = h * h - l * l;
  return (w <= 0 ? 0 : isqrt(w) * s) as Fx;
};

/**
 * Whether `v` is still an Fx this arithmetic can hold exactly. For a game's
 * state invariants, not for a tick: a value that fails this took a float in
 * through some boundary, and a non-integer Fx is the one thing here that drifts
 * per-platform instead of being reproducible.
 */
export const fxIsExact = (v: number): boolean => Number.isInteger(v) && v > -EXACT && v < EXACT;
