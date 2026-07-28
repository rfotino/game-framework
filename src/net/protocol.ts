/**
 * Wire protocol for multiplayer games. Server-authoritative model (default):
 * the server runs the same sim core (same TS code, on telemachus), clients
 * send InputFrames, server broadcasts state snapshots.
 *
 * Every message carries schemaVersion; mismatches are rejected at join.
 */

import type { InputFrame, Params, SimState } from "../engine/game.js";
import type { RngState } from "../engine/rng.js";

export interface Envelope<T extends string, P> {
  v: number; // protocol version (this file)
  schemaVersion: number; // game schema version
  type: T;
  room: string;
  seq: number; // per-sender monotonically increasing
  payload: P;
}

// ---- Client -> Server ----
export type JoinMsg = Envelope<"join", { name: string; token?: string }>;
export type LeaveMsg = Envelope<"leave", Record<string, never>>;
export type InputMsg = Envelope<"input", { tick: number; frame: InputFrame }>;

// ---- Server -> Client ----
/**
 * Join acknowledgement: everything a client needs to start simulating.
 *
 * `slot`/`squadSize` model "one player, one seat": in a game whose `InputFrame`
 * is keyed by slot, a joiner cannot predict its own entity or index a snapshot
 * until it is told WHICH seat it owns and how many exist. `params` and
 * `rngState` are what CLIENT PREDICTION needs — the server's exact tuning, and
 * the sim RNG at `tick` so a rollback re-simulates the same world rather than a
 * divergent one. All optional: a single-entity or non-predicting game ignores them.
 */
export type WelcomeMsg = Envelope<
  "welcome",
  {
    playerId: string;
    seed: number;
    tickHz: number;
    tick: number;
    state: SimState;
    /** This client's seat index, if the game seats players. */
    slot?: number;
    /** How many seats the room has. */
    squadSize?: number;
    /** The server's authoritative tuning — predict with these, not with defaults. */
    params?: Params;
    /** Sim RNG state at `tick`, so client-side re-simulation stays exact. */
    rngState?: RngState;
  }
>;
/**
 * Authoritative state at `tick`. Full snapshots first; delta-compress only when
 * measured as needed.
 *
 * `inputs` is each seat's last-applied frame, indexed by slot: a rolling-back
 * client has no other way to extrapolate the ships it does not own (it replays
 * them as "hold last input"). `rngState` restores the sim stream before that
 * replay. Both optional, for the same reason as on the welcome.
 */
export type SnapshotMsg = Envelope<
  "snapshot",
  {
    tick: number;
    state: SimState;
    /** Last-applied input per seat, indexed by slot. */
    inputs?: InputFrame[];
    /** Sim RNG state at `tick`. */
    rngState?: RngState;
  }
>;
export type PeersMsg = Envelope<"peers", { players: { id: string; name: string }[] }>;
export type ErrorMsg = Envelope<"error", { code: string; message: string }>;

export type ClientMsg = JoinMsg | LeaveMsg | InputMsg;
export type ServerMsg = WelcomeMsg | SnapshotMsg | PeersMsg | ErrorMsg;

export const PROTOCOL_VERSION = 1;

/** Parse + minimally validate an incoming message. Returns null on garbage. */
export function parseMsg(raw: string): ClientMsg | ServerMsg | null {
  try {
    const m = JSON.parse(raw);
    if (typeof m?.type !== "string" || typeof m?.v !== "number") return null;
    return m as ClientMsg | ServerMsg;
  } catch {
    return null;
  }
}
