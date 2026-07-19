/**
 * Stub game: an orb the player steers around a box. It exists to prove the
 * pipeline end-to-end (dev loop, headless sim, determinism test) and to serve
 * as a concrete reference for the patterns. Replace it during the
 * walking-skeleton experiment — but keep the shape: pure functions, fixed-point
 * math, params from params.ts, rng from ctx.
 */

import {
  add,
  clamp,
  fx,
  fxFromFloat,
  mul,
  type Fx,
  type GameDefinition,
  type TickCtx,
  type Vec2,
  vec,
} from "@gf/framework/engine";
import { SCHEMA_VERSION, TICK_HZ } from "../config.js";
import { defaultParams, type GameParams } from "../params.js";

export interface OrbState {
  [key: string]: unknown; // satisfies SimState's serializable-record constraint
  pos: Vec2;
  vel: Vec2;
  ticksAlive: number;
}

export interface OrbInput {
  [key: string]: unknown;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

const BOUND: Fx = fx(100); // world is [-100, 100]^2 units

export const game: GameDefinition<OrbState, OrbInput, GameParams> = {
  id: "template-orb",
  schemaVersion: SCHEMA_VERSION,
  tickHz: TICK_HZ,
  defaultParams,

  init(_seed: number, _params: GameParams): OrbState {
    return { pos: vec(fx(0), fx(0)), vel: vec(fx(0), fx(0)), ticksAlive: 0 };
  },

  tick(state: OrbState, inputs: OrbInput, ctx: TickCtx<GameParams>): OrbState {
    const accel = fxFromFloat(ctx.params.accel as number);
    const drag = fxFromFloat(ctx.params.drag as number);
    let vel = vec(
      mul(add(state.vel.x, mul(fx(inputs.dx), accel)), drag),
      mul(add(state.vel.y, mul(fx(inputs.dy), accel)), drag),
    );
    const pos = vec(
      clamp(add(state.pos.x, vel.x), fx(-100), BOUND),
      clamp(add(state.pos.y, vel.y), fx(-100), BOUND),
    );
    return { pos, vel, ticksAlive: state.ticksAlive + 1 };
  },

  isOver(_state: OrbState): boolean {
    return false;
  },

  invariants(state: OrbState): string[] {
    const out: string[] = [];
    if (state.pos.x < fx(-100) || state.pos.x > BOUND) out.push("pos.x out of bounds");
    if (state.pos.y < fx(-100) || state.pos.y > BOUND) out.push("pos.y out of bounds");
    if (!Number.isInteger(state.pos.x) || !Number.isInteger(state.pos.y))
      out.push("position must stay fixed-point (integer)");
    return out;
  },
};
