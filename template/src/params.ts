/**
 * All tuning values live here (CONVENTIONS.md #5). A debug panel — the game's own;
 * the framework ships only the `DebugPanel` interface — generates sliders from this
 * object so the designer tweaks feel live. No magic numbers in sim code.
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
