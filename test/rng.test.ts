import { describe, expect, it } from "vitest";
import { Rng } from "../src/engine/rng.js";

describe("rng state is the wrapped word", () => {
  it("keeps `s` a uint32 across many draws", () => {
    const r = new Rng(0xdeadbeef);
    for (let i = 0; i < 10_000; i++) r.nextUint32();
    const s = r.save().s;
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });

  it("a restored twin drawing the identical stream holds the identical raw state", () => {
    const a = new Rng(1234);
    for (let i = 0; i < 777; i++) a.nextUint32();
    const b = Rng.restore(a.save());
    for (let i = 0; i < 4096; i++) {
      expect(b.nextUint32()).toBe(a.nextUint32());
      expect(b.save().s).toBe(a.save().s);
    }
  });

  it("wrapping the accumulator does not change the stream", () => {
    // The draw always wrapped its local copy; only the retained field moved. The first
    // 2^32/K draws of a fresh seed never wrapped at all, so any historical stream is
    // reproduced exactly — pinned against literals drawn before the fix.
    const r = new Rng(42);
    expect([r.nextUint32(), r.nextUint32(), r.nextUint32()]).toEqual([2581720956, 1925393290, 3661312704]);
  });
});
