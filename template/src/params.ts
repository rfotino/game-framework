/**
 * All tuning values live here (CONVENTIONS.md #5). The debug panel generates
 * sliders from this object; the designer tweaks feel live. No magic numbers in sim code.
 */
import type { Params } from "@gf/framework/engine";

export interface GameParams extends Params {
  accel: number; // world units per tick^2
  drag: number; // velocity multiplier per tick, (0, 1]
}

export const defaultParams: GameParams = {
  accel: 0.5,
  drag: 0.9,
};
