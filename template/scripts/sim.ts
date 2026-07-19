/**
 * Headless bot simulation: `npm run sim [-- --ticks 2000 --seed 42]`
 * Runs random-walk bots through the sim core, printing state hashes and any
 * invariant violations. This is the agent's primary verification loop —
 * extend the bot with scripted scenarios as mechanics grow.
 */

import { Rng, runReplay, type Replay } from "@gf/framework/engine";
import { defaultParams, type GameParams } from "../src/params.js";
import { game, type OrbInput } from "../src/sim/game.js";

const args = process.argv.slice(2);
const argVal = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const ticks = argVal("ticks", 1000);
const seed = argVal("seed", 1234) >>> 0;

// Bot input stream uses its own RNG (it is part of the recorded replay, so
// determinism of the *sim* doesn't depend on it — but seeding it makes the
// whole run reproducible from the command line).
const botRng = new Rng(seed ^ 0xbadc0de);
const frames: OrbInput[] = [];
for (let t = 0; t < ticks; t++) {
  frames.push({
    dx: (botRng.int(-1, 1)) as OrbInput["dx"],
    dy: (botRng.int(-1, 1)) as OrbInput["dy"],
  });
}

const replay: Replay<OrbInput, GameParams> = {
  gameId: game.id,
  schemaVersion: game.schemaVersion,
  seed,
  params: defaultParams,
  frames,
};

const result = runReplay(game, replay, { hashEvery: Math.max(1, Math.floor(ticks / 10)) });

console.log(`sim: ${result.ticks} ticks, seed ${seed}`);
for (const h of result.hashes) console.log(`  tick ${h.tick}\thash ${h.hash.toString(16)}`);
if (result.violations.length) {
  console.error(`INVARIANT VIOLATIONS (${result.violations.length} ticks affected):`);
  for (const v of result.violations.slice(0, 10))
    console.error(`  tick ${v.tick}: ${v.messages.join("; ")}`);
  process.exit(1);
}
console.log("invariants: clean");
