/**
 * Fixed-point math: 16.16 signed (1 world unit = 65536). All sim positions,
 * velocities, and physics use Fx values (branded numbers, stored as plain ints).
 *
 * Why: float math differs subtly across CPUs/JITs/languages, which breaks
 * cross-platform determinism and golden-replay verification of future ports.
 * Integer math is exact everywhere. Convert to float only at the render boundary.
 *
 * Range: |value| < 32768 world units. Fine for 2D games; tile coords and screen
 * spaces fit comfortably. Watch mul() of large magnitudes (see note below).
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
 * Multiply. Uses float64 for the intermediate product (exact for products up to
 * 2^53, i.e. |a*b| within ±2^37 world units² — ample for 2D gameplay), then
 * truncates deterministically.
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

/** Integer sqrt of a fixed value, result fixed. Deterministic (Newton, int-only). */
export const sqrt = (a: Fx): Fx => {
  if (a <= 0) return 0 as Fx;
  // sqrt(a / 2^16) * 2^16 = sqrt(a * 2^16) = isqrt(a << 16)
  let n = a * FX_ONE; // exact below 2^53
  let x = Math.floor(Math.sqrt(n)); // float seed…
  // …then correct to the exact integer floor deterministically:
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return (x | 0) as Fx;
};

export interface Vec2 {
  x: Fx;
  y: Fx;
}

export const vec = (x: Fx, y: Fx): Vec2 => ({ x, y });
export const vAdd = (a: Vec2, b: Vec2): Vec2 => vec(add(a.x, b.x), add(a.y, b.y));
export const vSub = (a: Vec2, b: Vec2): Vec2 => vec(sub(a.x, b.x), sub(a.y, b.y));
export const vScale = (a: Vec2, s: Fx): Vec2 => vec(mul(a.x, s), mul(a.y, s));
export const vLenSq = (a: Vec2): Fx => add(mul(a.x, a.x), mul(a.y, a.y));
export const vLen = (a: Vec2): Fx => sqrt(vLenSq(a));
