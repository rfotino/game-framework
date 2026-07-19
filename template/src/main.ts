/**
 * Client entry: the canonical fixed-timestep loop with render interpolation.
 * The sim ticks exactly TICK_HZ times per second regardless of display refresh;
 * the renderer draws every animation frame, interpolating between the last two
 * sim states by `alpha`.
 *
 * Rendering here is a throwaway canvas2d placeholder so `npm run dev` shows
 * something on day zero. Walking-skeleton task: replace it with a PixiJS
 * implementation of the Renderer interface from @gf/framework/shell, driven by
 * src/render/manifest.ts. Do not touch the loop structure or the sim.
 */

import { Rng, toFloat, ReplayRecorder } from "@gf/framework/engine";
import { TICK_MS } from "./config.js";
import { defaultParams, type GameParams } from "./params.js";
import { game, type OrbInput, type OrbState } from "./sim/game.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx2d = canvas.getContext("2d")!;

// --- session setup -----------------------------------------------------------
const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0; // boundary code: floats OK here
const params: GameParams = structuredClone(defaultParams);
const simRng = new Rng(seed); // sim stream: only ever passed into game.tick
const recorder = new ReplayRecorder<OrbInput, GameParams>(
  game.id,
  game.schemaVersion,
  seed,
  params,
);

let prev: OrbState = game.init(seed, params);
let curr: OrbState = prev;
let tick = 0;

// --- input (placeholder keyboard adapter) ------------------------------------
const held = new Set<string>();
addEventListener("keydown", (e) => held.add(e.key));
addEventListener("keyup", (e) => held.delete(e.key));
function sampleInput(): OrbInput {
  const dx = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
  const dy = (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0);
  return { dx: dx as OrbInput["dx"], dy: dy as OrbInput["dy"] };
}

// --- the loop ----------------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now: number) {
  acc += Math.min(now - last, 250); // clamp: tab-switch pauses don't spiral
  last = now;

  while (acc >= TICK_MS) {
    const input = sampleInput();
    recorder.record(input);
    prev = curr;
    curr = game.tick(curr, input, { rng: simRng, params, tick });
    tick++;
    acc -= TICK_MS;
  }

  draw(prev, curr, acc / TICK_MS);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- placeholder renderer (replace with PixiJS Renderer implementation) ------
function draw(p: OrbState, c: OrbState, alpha: number) {
  const w = canvas.width, h = canvas.height;
  ctx2d.fillStyle = "#111";
  ctx2d.fillRect(0, 0, w, h);
  // interpolate world [-100,100]^2 -> screen
  const lerpF = (a: number, b: number) => a + (b - a) * alpha;
  const x = lerpF(toFloat(p.pos.x), toFloat(c.pos.x));
  const y = lerpF(toFloat(p.pos.y), toFloat(c.pos.y));
  ctx2d.fillStyle = "#4fc3f7";
  ctx2d.beginPath();
  ctx2d.arc(((x + 100) / 200) * w, ((y + 100) / 200) * h, 8, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.fillStyle = "#888";
  ctx2d.font = "12px monospace";
  ctx2d.fillText(`seed ${seed} tick ${tick} (arrow keys)`, 8, 16);
}

// Expose the replay for grabbing from the console during play sessions:
// copy(JSON.stringify(__replay())) then save to replays/<n>.json
(globalThis as Record<string, unknown>).__replay = () => recorder.replay;
