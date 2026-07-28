/**
 * Compile-time coverage for the TYPE-only surfaces — `Params` leaves, the
 * welcome/snapshot payloads, the `path` visual. `npm test` typechecks this file
 * (tsconfig.test.json), so these declarations failing to compile IS the failure;
 * the runtime assertions below only keep vitest from reporting an empty file.
 */
import { describe, expect, it } from "vitest";
import type { Params, InputFrame } from "../src/engine/game.js";
import type { RngState } from "../src/engine/rng.js";
import type { SnapshotMsg, WelcomeMsg } from "../src/net/protocol.js";
import type { Visual, VisualManifest } from "../src/shell/adapters.js";

describe("Params leaves", () => {
  it("holds numbers, booleans, strings, leaf arrays and nested groups", () => {
    const p = {
      physics: { LAMBDA: 1.8, DEBUG_DRAW: false },
      // Id-valued config: the reason strings exist. Encoding this as an index
      // into a frozen list forces that list to stay append-only forever.
      encounter: { ACTIVE: "furnace-heart" },
      // Per-slot config, indexed by seat.
      squad: { hulls: ["bastion", "lance", "herald"], SIZE: 3 },
      weapon: { lance: { DMG: 12, PIERCE: true } },
    } satisfies Params;

    expect(p.encounter.ACTIVE).toBe("furnace-heart");
    expect(p.squad.hulls[1]).toBe("lance");
  });
});

describe("welcome / snapshot payloads", () => {
  it("carry seat assignment, server params and RNG state for prediction", () => {
    const rngState: RngState = { s: 12345 };
    const welcome: WelcomeMsg = {
      v: 1,
      schemaVersion: 1,
      type: "welcome",
      room: "ABCD",
      seq: 0,
      payload: {
        playerId: "p1",
        seed: 7,
        tickHz: 60,
        tick: 0,
        state: {},
        slot: 2,
        squadSize: 3,
        params: { physics: { LAMBDA: 1.8 } },
        rngState,
      },
    };
    const inputs: InputFrame[] = [{ thrust: 1 }, { thrust: 0 }, { thrust: -1 }];
    const snapshot: SnapshotMsg = {
      v: 1,
      schemaVersion: 1,
      type: "snapshot",
      room: "ABCD",
      seq: 1,
      payload: { tick: 42, state: {}, inputs, rngState },
    };

    expect(welcome.payload.slot).toBe(2);
    expect(snapshot.payload.inputs?.length).toBe(3);
  });

  it("keeps the prediction fields optional — a non-seated game omits them", () => {
    const welcome: WelcomeMsg = {
      v: 1,
      schemaVersion: 1,
      type: "welcome",
      room: "ABCD",
      seq: 0,
      payload: { playerId: "p1", seed: 7, tickHz: 60, tick: 0, state: {} },
    };
    expect(welcome.payload.slot).toBeUndefined();
  });
});

describe("path visual", () => {
  it("expresses stroked-path-with-bloom, shape-only or coloured", () => {
    const shapeOnly: Visual = {
      kind: "path",
      polylines: [{ points: [-1, 0, 1, 0, 0, 0.6], closed: true, width: 0.06 }],
      bloom: 1,
    };
    const coloured: Visual = {
      kind: "path",
      polylines: [{ points: [0, -1, 0, 1], closed: false, width: 0.03 }],
      color: 0x00ffff,
    };
    const manifest: VisualManifest = { ship: shapeOnly, beam: coloured };

    expect(manifest.ship.kind).toBe("path");
    expect(shapeOnly.kind === "path" && shapeOnly.color).toBeUndefined();
  });
});
