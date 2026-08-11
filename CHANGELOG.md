# Changelog

Entries newest-first. Every entry that requires action in game repos includes a
**Migration** section written as agent-executable instructions.

## v0.3.0 — `Fx` is an exact integer, not an int32

`FX_SHIFT` stays at 16 and `FX_ONE` stays at 65536: **the point does not move,
so no value changes meaning and no game needs to re-tune anything.** What moves
is the container. Every op used to end in `| 0`, capping an `Fx` at int32 —
|value| < 32768 world units — and a product past that wrapped NEGATIVE. It
wrapped *deterministically*, so every machine agreed on the wrong answer and no
golden-replay hash could ever catch it. The `| 0` is gone. An `Fx` is now an
exact integer held in a float64, so the range is |value| < 2^37 u.

Reported from a shipping game that had hit the wall six times and worked around
it six different ways: a boss health pool that came back as −7845 and tripped
its own `coreHp < 0` invariant; two more pools reformulated to divide before
multiplying; an arclength coordinate longer than the arena is wide, which had to
buy range with three of its fraction bits; a centroid that summed into a plain
`number` because two ships 19000 u apart overflowed `add`; and a monotonic age
counter clamped so it could not wrap.

- **Determinism is unchanged, and so is every existing result.** IEEE-754 pins
  add, subtract, multiply and floor exactly, and integers below 2^53 are exact,
  so the arithmetic is still bit-identical on every platform. Below the old
  int32 ceiling the new ops return exactly what the old ones did — verified by
  running a game's full suite, headless sim, playtest and render command-stream
  baseline against both: **every hash identical, zero rebaseline.** An int64
  port reproduces these results directly; nothing here relies on 32-bit wrapping
  any more, which it previously did.
- **Over-range now rounds instead of wrapping.** `mul` is exact while
  |a|·|b| < 2^21 u² (so `mul(d, d)` to d ≈ 1448 u, up from 181 u). Past that it
  sheds low bits at a relative error around 1e-9 that *shrinks* with magnitude —
  it does not flip sign. A silent catastrophe became a bounded rounding error.
- **`vLen` / `vDist` / `vNorm` / `vDot` / `vCross` / `vProj` / `pythLeg` lost
  their ceiling.** They still divide components by 256 before squaring at every
  scale a game reaches — identical results — and step to 65536 only past
  262144 u, where 1 u is already far below the rounding of the answer. They are
  spelled at fixed arity deliberately: a rest parameter allocated an array per
  call and cost 7% of sim CPU. At fixed arity the cost is inside run-to-run
  noise.
- **`vLenSq` is kept and is no longer a trap at arena scale** — exact to
  ~1448 u instead of ~181 u. `vLenSq2` remains the right call where the
  magnitude is unbounded.
- **New: `fxIsExact(v)`** — whether a value is still an integer this arithmetic
  can hold. For a game's state invariants, not for a tick. With `| 0` gone,
  nothing coerces a leaked float back to an integer, and a non-integer `Fx` is
  the one thing here that drifts per-platform instead of being reproducible.
  This is the guard that replaces the coercion.
- **`fx()` multiplies instead of shifting and `toInt()` floors instead of
  shifting** — `<<` and `>>` are int32 operators and would have re-imposed the
  wall inside the widened type.

**Why not 20.12, the obvious alternative.** Moving the point buys range with
resolution — 16x more range for a 1/4096 u step — and that is the change the
reporting game had written down to do. It was measured against that game's
actual numbers first, and it does not survive contact:

- An orbiting hazard field's angular rate is `div(speed, radius)`, and `div`
  truncates. At 1/4096 the outer bodies' rate — 1.9e-4 rad/tick — floors to
  **zero**. The field stops.
- The mid-ring bodies keep 1 or 2 ulps, so neighbours run 5–46% slow *relative
  to each other*: the formation shears apart rather than merely drifting.
- A current's acceleration clamp becomes dead code: its magnitude truncates to
  0 inside `vLen`'s pre-divide, so the clamp never fires.
- Three hulls tuned to converge on one top speed spread out, because the
  quantum lands on `1 − damping`, which is the small quantity.

None of that is visible in the arithmetic; it only shows up against real
content. **The lesson worth carrying: a fixed-point ceiling should be raised by
widening the container, not by spending resolution, whenever the host type has
the bits.** JavaScript's does — 53 of them.

### Migration

Bump the pin. Then, in each game repo:

1. `grep -rn "Int32Array" src/` — any typed array **storing Fx values** must
   become `Float64Array`, or it silently truncates the values this release
   exists to permit. (Typed arrays holding indices, counts or colours are fine.)
2. `grep -rnE "(>>|<<|\| 0)" src/sim/` — bitwise operators coerce to int32.
   On an `Fx` they re-impose the old wall inside the new type. Replace `x >> k`
   with `Math.floor(x / 2 ** k)` and `x << k` with `x * 2 ** k`. Shifts on
   indices, hashes, colours and flags are unaffected.
3. Sentinels spelled `0x7fffffff` still work but no longer mean "larger than any
   Fx". Where one is a max-distance seed, that is still true in practice; where
   one is asserted against, re-read it.
4. Range-guard invariants keyed to the 32768 u wall can be relaxed or deleted.
   Replace the "is this still fixed-point" half with `fxIsExact`.
5. Workarounds that reformulated a magnitude to dodge the wall — divide-before-
   multiply, integer-scaled shares, arclength shift parameters, sums promoted to
   `number` — can be written the direct way again. Each of those is a behaviour
   change (a different rounding), so land them **after** the pin bump and
   separately from it: the bump itself moves no hash, and keeping that true is
   what makes the rebaseline of each removal readable.
6. No `schemaVersion` bump is required by this release on its own. The wire
   format is unchanged and values are unchanged. Bump it if you take step 5,
   because that is when state values actually move.

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
