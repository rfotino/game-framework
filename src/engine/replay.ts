/**
 * Replays: seed + params + input frames. Because the sim is deterministic,
 * this reproduces any session exactly — for bug reports ("replay 4482 felt
 * wrong at tick 300"), regression tests (golden hashes), and verifying future
 * platform ports (same inputs must yield same hashes in the C#/Haxe build).
 *
 * Policy (CLAUDE.md #7): replays are disposable across schemaVersion bumps.
 */

import type { GameDefinition, InputFrame, Params, SimState } from "./game.js";
import { Rng } from "./rng.js";

export interface Replay<I extends InputFrame, P extends Params> {
  gameId: string;
  schemaVersion: number;
  seed: number;
  params: P;
  frames: I[]; // frames[t] is the input for tick t
}

export interface RunResult<S extends SimState> {
  finalState: S;
  ticks: number;
  /** hash(state) sampled every `hashEvery` ticks + final. Golden test material. */
  hashes: { tick: number; hash: number }[];
  violations: { tick: number; messages: string[] }[];
}

/** FNV-1a over the canonical JSON of state. Canonical = sorted keys, so hash is stable. */
export function hashState(state: SimState): number {
  const json = canonicalJson(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(v as object).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

/** Run a replay (or a live frame source) through the sim, collecting hashes + violations. */
export function runReplay<S extends SimState, I extends InputFrame, P extends Params>(
  game: GameDefinition<S, I, P>,
  replay: Replay<I, P>,
  opts: { hashEvery?: number; stopAtTick?: number } = {},
): RunResult<S> {
  if (replay.schemaVersion !== game.schemaVersion) {
    throw new Error(
      `Replay schemaVersion ${replay.schemaVersion} != game ${game.schemaVersion}; replays are disposable across versions.`,
    );
  }
  const hashEvery = opts.hashEvery ?? 60;
  const rng = new Rng(replay.seed);
  let state = game.init(replay.seed, replay.params);
  const hashes: RunResult<S>["hashes"] = [];
  const violations: RunResult<S>["violations"] = [];

  let t = 0;
  for (; t < replay.frames.length; t++) {
    if (opts.stopAtTick !== undefined && t >= opts.stopAtTick) break;
    state = game.tick(state, replay.frames[t], { rng, params: replay.params, tick: t });
    if (t % hashEvery === 0) hashes.push({ tick: t, hash: hashState(state) });
    const v = game.invariants(state);
    if (v.length) violations.push({ tick: t, messages: v });
    if (game.isOver(state)) break;
  }
  hashes.push({ tick: t, hash: hashState(state) });
  return { finalState: state, ticks: t, hashes, violations };
}

/** Incremental recorder for live sessions (dev shell writes frames as the player plays). */
export class ReplayRecorder<I extends InputFrame, P extends Params> {
  readonly replay: Replay<I, P>;
  constructor(gameId: string, schemaVersion: number, seed: number, params: P) {
    this.replay = { gameId, schemaVersion, seed, params, frames: [] };
  }
  record(frame: I): void {
    this.replay.frames.push(frame);
  }
  toJson(): string {
    return JSON.stringify(this.replay);
  }
}
