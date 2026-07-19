/**
 * The game contract. Every game implements GameDefinition.
 *
 * The sim core is pure and deterministic: same seed + same params + same input
 * sequence => identical states, forever, on every platform. This is what buys us
 * replays, headless testing, server-authoritative netcode, and cheap console ports.
 *
 * Real-time games tick every 1000/TICK_HZ ms with the current InputFrame.
 * Turn-based games tick once per submitted action (InputFrame carries the action).
 */

import type { Rng } from "./rng.js";

/** All sim state must be plain serializable data (JSON-safe, no classes/functions). */
export type SimState = Record<string, unknown>;

/**
 * Inputs for one tick. Real-time: held keys / analog values per player.
 * Turn-based: the action object (e.g. { type: "playCard", cardId, target }).
 * Must be plain serializable data — this is what replays and lockstep record.
 */
export type InputFrame = Record<string, unknown>;

/** Tuning values. Flat-ish object of numbers/booleans; debug panel generates sliders. */
export interface Params {
  [key: string]: number | boolean | Params;
}

export interface TickCtx<P extends Params> {
  /** Seeded sim RNG. NEVER use for cosmetics — see CLAUDE.md rule 4. */
  rng: Rng;
  /** Live-tunable params (debug panel writes here between ticks). */
  params: P;
  /** Current tick index, starting at 0. Derive all sim time from this. */
  tick: number;
}

export interface GameDefinition<
  S extends SimState,
  I extends InputFrame,
  P extends Params,
> {
  id: string;
  /** Bump when S, I, or replay format changes shape. Stamped on saves/replays/messages. */
  schemaVersion: number;
  /** Single source of truth for sim rate. Renderer interpolates; never assume a value. */
  tickHz: number;
  defaultParams: P;

  /** Build the initial state. Pure: same seed + params => same state. */
  init(seed: number, params: P): S;

  /**
   * Advance one tick. Pure: no I/O, no wall clock, no Math.random.
   * Return a new state (structural sharing is fine; don't mutate the argument).
   */
  tick(state: S, inputs: I, ctx: TickCtx<P>): S;

  /** Terminal check, used by the sim runner and bots. */
  isOver(state: S): boolean;

  /**
   * Invariants asserted by tests and the headless sim runner after every tick.
   * Return a list of violation messages (empty = healthy).
   * Examples: "hp must be >= 0", "deck+hand+discard must equal total cards".
   */
  invariants(state: S): string[];
}

/** A bot for headless simulation: given a state, produce an input frame. */
export type Bot<S extends SimState, I extends InputFrame> = (
  state: S,
  rng: Rng,
  tick: number,
) => I;
