/**
 * Wire protocol for multiplayer games. Server-authoritative model (default):
 * the server runs the same sim core (same TS code, on telemachus), clients
 * send InputFrames, server broadcasts state snapshots.
 *
 * Every message carries schemaVersion; mismatches are rejected at join.
 */

import type { InputFrame, SimState } from "../engine/game.js";

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
export type WelcomeMsg = Envelope<
  "welcome",
  { playerId: string; seed: number; tickHz: number; tick: number; state: SimState }
>;
export type SnapshotMsg = Envelope<
  "snapshot",
  { tick: number; state: SimState } // full snapshots first; delta-compress only when measured as needed
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
