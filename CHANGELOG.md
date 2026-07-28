# Changelog

Entries newest-first. Every entry that requires action in game repos includes a
**Migration** section written as agent-executable instructions.

## v0.2.0 — arena-scale fixed-point math, wider params, seated netcode, path visuals

Upstreamed from Neon Void's `FRAMEWORK-NOTES.md` ledger — every item below was a
real workaround in a shipping game.

- **Engine (`fixed.ts`) — `vLen` was wrong past ~181 world units.** A squared
  length in 16.16 leaves the `Fx` range once the length passes
  √(2³¹/65536) ≈ 181 u, so `vLenSq`'s `mul(x,x) + mul(y,y)` wrapped silently and
  `vLen` returned garbage — first seen as a ship teleporting off an asteroid it
  was not touching, in a world of radius 1200 u. `vLen` is reimplemented to shift
  each component down 8 bits before squaring (integer-only, so determinism holds),
  and the family it needs is now complete: **`vDist`, `vNorm`, `vDot`, `vCross`,
  `vLenSq2`, `vProj`, `pythLeg`.** `vDot`/`vCross`/`vLenSq2` return a `number`,
  not an `Fx`: at world scale the true value does not fit int32, so they are for
  comparisons and ratios only.
  - `vLenSq` is KEPT, but it is only correct for |a| < 181 u, and now says so.
    Use `vLenSq2` wherever the magnitude can reach world scale.
  - The `mul` JSDoc claimed exactness to ±2³⁷ world units². **That was wrong** —
    the `| 0` caps the RESULT at ±2³¹ fx = ±32768 u², the same range as any other
    `Fx`. Corrected, with the squaring hazard called out.
  - Trade: the new helpers drop sub-1/256-unit precision from their inputs.
    Negligible for distance, collision and normals; it is the price of being
    correct across the documented |value| < 32768 u range.
- **Engine (`game.ts`) — `Params` leaves widened.** Was
  `number | boolean | Params`; now `ParamLeaf | ParamLeaf[] | Params` with
  `ParamLeaf = number | boolean | string`. Strings are for id-valued config
  (which level/mode is active, which entity sits in which slot). Without them a
  game encodes ids as indices into a frozen list, which then has to stay
  append-only forever or saved params silently repoint at a different thing.
  Arrays cover per-slot config. Purely additive.
- **Net (`protocol.ts`) — the wire now models "one player, one seat".**
  `WelcomeMsg` gains optional `slot`, `squadSize`, `params` and `rngState`;
  `SnapshotMsg` gains optional `inputs` (last-applied frame per seat) and
  `rngState`. A client that predicts its own entity cannot start without knowing
  which seat it owns, and cannot roll back correctly without the server's exact
  tuning and the sim RNG state. All optional — a single-entity or non-predicting
  game ignores them.
- **Shell (`adapters.ts`) — `Visual` gains a `path` kind.** Normalized
  `StrokePolyline[]` plus optional `color` and a `bloom` hint in [0, 1]. The union
  could express rects, circles and sprites but not stroked-path-with-bloom, so a
  line-art game had no way to use the visual manifest at all. Animated sub-parts /
  clip channels are deliberately NOT included — no game has built the player yet.
- **Docs — CONVENTIONS #5 stops promising a component that does not exist.** The
  framework ships the `DebugPanel` *interface*, not an implementation; the rule
  now says so, and names which leaf types are live-tunable. Same correction in
  `template/src/params.ts`.
- **Tests.** `test/fixed.test.ts` covers the magnitude helpers at world scale
  (including a pin on `vLenSq`'s documented wrap, so the hazard stays visible);
  `test/types.test.ts` + `tsconfig.test.json` typecheck the type-only surfaces.
  `npm test` now runs `tsc --noEmit` before vitest.

**Migration:**

1. Bump the pin in `package.json` to `github:rfotino/game-framework#v0.2.0` and
   `npm install`.
2. **If your game worked around the `vLen` overflow with its own vector helpers**
   (look for a `vmath.ts`, or grep for `isqrt`): delete them and switch call sites
   to the engine — `lenFx → vLen`, `distFx → vDist`, `normFx → vNorm`,
   `dotFx → vDot`, `crossFx → vCross`, `projFx → vProj`, `legFx → pythLeg`. The
   engine implementations use the same shift-then-isqrt arithmetic, so results are
   bit-identical to that workaround and hashes do NOT move. **If you were calling
   the OLD `vLen`/`vLenSq` at world scale, they do move** — the old values were
   garbage. Re-record golden replays and re-pin acceptance hashes deliberately,
   after confirming the new behaviour is the correct one.
3. **If you encoded ids as indices into a frozen list** to satisfy the old
   `Params` type: you can now store the id string directly, delete the order list
   and its coverage guard, and read the param straight. This changes save/replay
   payload shape — bump your `schemaVersion`, and do it at a deliberate gate, not
   mid-feature.
4. Nothing else is breaking: the `WelcomeMsg`/`SnapshotMsg` additions and the
   `path` visual are additive, and existing `Params` objects still typecheck.
5. If your renderer exhaustively switches on `Visual.kind`, add a `path` arm.

## v0.1.0 — initial release

- Engine: `GameDefinition` contract, seeded RNG (mulberry32, two-stream discipline),
  16.16 fixed-point math + `Vec2`, replay recording/running with FNV-1a golden
  hashes and invariant checking.
- Shell: `Renderer` / `AudioAdapter` / `InputAdapter` / `DebugPanel` interfaces,
  visual manifest types.
- Net: versioned message envelope, server-authoritative message set.
- Docs: `docs/CONVENTIONS.md` (imported by game CLAUDE.md files), `SETUP.md`
  (new-game interview), `template/` scaffold.

**Migration:** none (initial release).
