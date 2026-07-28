/**
 * Fixed-point math: 16.16 signed (1 world unit = 65536). All sim positions,
 * velocities, and physics use Fx values (branded numbers, stored as plain ints).
 *
 * Why: float math differs subtly across CPUs/JITs/languages, which breaks
 * cross-platform determinism and golden-replay verification of future ports.
 * Integer math is exact everywhere. Convert to float only at the render boundary.
 *
 * Range: |value| < 32768 world units. Fine for 2D games; tile coords and screen
 * spaces fit comfortably. Watch mul() of large magnitudes (see note below): a
 * SQUARED world-scale quantity does not fit, which is why the magnitude helpers
 * (vLen/vDist/vDot/vNorm/…) never form one.
 */

export type Fx = number & { readonly __fx: unique symbol };

export const FX_SHIFT = 16;
export const FX_ONE = (1 << FX_SHIFT) as Fx;

/** Int -> fixed. */
export const fx = (n: number): Fx => ((n | 0) << FX_SHIFT) as Fx;

/** Float -> fixed. Use ONLY at boundaries (content loading, tuning params). */
export const fxFromFloat = (f: number): Fx => Math.round(f * FX_ONE) as Fx;

/** Fixed -> float. RENDER BOUNDARY ONLY. */
export const toFloat = (a: Fx): number => a / FX_ONE;

/** Fixed -> whole world units (floor). */
export const toInt = (a: Fx): number => a >> FX_SHIFT;

export const add = (a: Fx, b: Fx): Fx => ((a + b) | 0) as Fx;
export const sub = (a: Fx, b: Fx): Fx => ((a - b) | 0) as Fx;
export const neg = (a: Fx): Fx => (-a | 0) as Fx;

/**
 * Multiply. The intermediate product is formed in float64 (exact below 2^53),
 * but the RESULT is truncated to signed 32-bit — so `mul` is only correct while
 * |a*b| stays under 2^31 fx, i.e. |result| < 32768 world units², the same range
 * as any other Fx value.
 *
 * WATCH squaring large magnitudes: `mul(d, d)` for d beyond ~181 world units
 * overflows silently and wraps to garbage. For squared lengths and dot products
 * at arena scale use `vDot` / `vLen` / `vDist` below, which never form an
 * over-range product.
 */
export const mul = (a: Fx, b: Fx): Fx => (Math.floor((a * b) / FX_ONE) | 0) as Fx;

/** Divide (b != 0). */
export const div = (a: Fx, b: Fx): Fx => (Math.floor((a * FX_ONE) / b) | 0) as Fx;

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

/** Integer sqrt of a fixed value, result fixed. Deterministic (Newton, int-only). */
export const sqrt = (a: Fx): Fx => {
  if (a <= 0) return 0 as Fx;
  // sqrt(a / 2^16) * 2^16 = sqrt(a * 2^16) = isqrt(a << 16)
  return (isqrt(a * FX_ONE) | 0) as Fx; // a * FX_ONE is exact below 2^53
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
 * A squared length in 16.16 leaves the Fx range once the length passes
 * √(2^31 / 65536) ≈ 181 world units, so the naive `mul(x,x) + mul(y,y)` wraps
 * silently — fatal in any world bigger than a few screens. Everything below
 * shifts each component down 8 bits BEFORE multiplying, so the product stays
 * well under 2^53 and exact, then shifts back. Integer-only, so determinism
 * holds across platforms and future ports.
 *
 * The trade: sub-1/256-unit precision is dropped from the inputs. That is
 * negligible for distances, collision and normals, and it is the price of
 * correctness across the documented |value| < 32768 u range.
 */
const VEC_SHIFT_DIV = 256; // 2^8, applied by division + trunc so it is sign-symmetric

/**
 * `a · b` as an exact DOUBLE in shifted-fx units — NOT a storable `Fx`.
 * Deliberately typed `number`: at world scale the true value does not fit int32,
 * so use it for COMPARISONS and RATIOS only, never as an operand to an Fx op.
 */
export const vDot = (a: Vec2, b: Vec2): number => {
  const ax = Math.trunc(a.x / VEC_SHIFT_DIV);
  const ay = Math.trunc(a.y / VEC_SHIFT_DIV);
  const bx = Math.trunc(b.x / VEC_SHIFT_DIV);
  const by = Math.trunc(b.y / VEC_SHIFT_DIV);
  return ax * bx + ay * by;
};

/**
 * `a × b`, the 2D scalar cross, as an exact DOUBLE in shifted-fx units —
 * arena-safe, and (like `vDot`) for signs and ratios only. Point-in-polygon and
 * winding tests need this: both operands are world-scale, so the Fx spelling
 * wraps and the winding flips.
 */
export const vCross = (a: Vec2, b: Vec2): number => {
  const ax = Math.trunc(a.x / VEC_SHIFT_DIV);
  const ay = Math.trunc(a.y / VEC_SHIFT_DIV);
  const bx = Math.trunc(b.x / VEC_SHIFT_DIV);
  const by = Math.trunc(b.y / VEC_SHIFT_DIV);
  return ax * by - ay * bx;
};

/**
 * Squared length as an exact DOUBLE, arena-safe — same units as `vDot`, and the
 * same "comparisons and ratios only" caveat. The spelling to reach for when
 * comparing a distance against a radius without paying for a square root.
 */
export const vLenSq2 = (a: Vec2): number => vDot(a, a);

/** |a| in fixed-point, correct across the full Fx range. */
export const vLen = (a: Vec2): Fx => {
  const x = Math.trunc(a.x / VEC_SHIFT_DIV);
  const y = Math.trunc(a.y / VEC_SHIFT_DIV);
  return ((isqrt(x * x + y * y) * VEC_SHIFT_DIV) | 0) as Fx;
};

/** |a − b| in fixed-point, correct across the full Fx range. */
export const vDist = (a: Vec2, b: Vec2): Fx => {
  const x = Math.trunc((a.x - b.x) / VEC_SHIFT_DIV);
  const y = Math.trunc((a.y - b.y) / VEC_SHIFT_DIV);
  return ((isqrt(x * x + y * y) * VEC_SHIFT_DIV) | 0) as Fx;
};

/**
 * `a / |a|`. The naive spelling (`vScale(a, div(FX_ONE, vLen(a)))`) forms a
 * reciprocal that keeps only ~8 significant bits at world scale, so its "unit"
 * vector can be off by 15%+; this divides component-wise in shifted integer
 * space instead. Zero-length ⇒ (0, 0).
 */
export const vNorm = (a: Vec2): Vec2 => {
  const x = Math.trunc(a.x / VEC_SHIFT_DIV);
  const y = Math.trunc(a.y / VEC_SHIFT_DIV);
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
  const h = Math.trunc(hyp / VEC_SHIFT_DIV);
  const l = Math.trunc(leg / VEC_SHIFT_DIV);
  const d = h * h - l * l;
  return (d <= 0 ? 0 : (isqrt(d) * VEC_SHIFT_DIV) | 0) as Fx;
};

/**
 * Squared length as an `Fx`. DANGER: only valid while |a| < 181 world units —
 * beyond that the square leaves the Fx range and wraps silently. Kept for small
 * local vectors (screen-space, per-tick deltas) where it is exact; anywhere the
 * magnitude can reach world scale, use `vLenSq2` (double) or `vLen`.
 */
export const vLenSq = (a: Vec2): Fx => add(mul(a.x, a.x), mul(a.y, a.y));
