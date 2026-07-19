/**
 * Baseline regression suite (CONVENTIONS.md: tests are protection, not
 * completion criteria). Grow it with golden replays: after a play session that
 * exercised new mechanics, save the replay JSON under replays/ and add a case
 * pinning its final hash.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hashState,
  Rng,
  runReplay,
  type Replay,
} from "@gf/framework/engine";
import { defaultParams, type GameParams } from "../src/params.js";
import { game, type OrbInput } from "../src/sim/game.js";

function randomReplay(seed: number, ticks: number): Replay<OrbInput, GameParams> {
  const rng = new Rng(seed ^ 0xbadc0de);
  const frames: OrbInput[] = [];
  for (let t = 0; t < ticks; t++) {
    frames.push({
      dx: rng.int(-1, 1) as OrbInput["dx"],
      dy: rng.int(-1, 1) as OrbInput["dy"],
    });
  }
  return { gameId: game.id, schemaVersion: game.schemaVersion, seed, params: defaultParams, frames };
}

describe("determinism", () => {
  it("same replay twice => identical hashes", () => {
    const replay = randomReplay(42, 500);
    const a = runReplay(game, replay);
    const b = runReplay(game, replay);
    expect(a.hashes).toEqual(b.hashes);
    expect(hashState(a.finalState)).toBe(hashState(b.finalState));
  });

  it("state survives JSON round-trip exactly", () => {
    const { finalState } = runReplay(game, randomReplay(7, 200));
    const roundTripped = JSON.parse(JSON.stringify(finalState));
    expect(canonicalJson(roundTripped)).toBe(canonicalJson(finalState));
  });

  it("no invariant violations under random play", () => {
    const { violations } = runReplay(game, randomReplay(99, 1000));
    expect(violations).toEqual([]);
  });

  it("rejects replays from other schema versions", () => {
    const replay = { ...randomReplay(1, 10), schemaVersion: game.schemaVersion + 1 };
    expect(() => runReplay(game, replay)).toThrow(/schemaVersion/);
  });
});
