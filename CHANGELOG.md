# Changelog

Entries newest-first. Every entry that requires action in game repos includes a
**Migration** section written as agent-executable instructions.

## v0.5.0 — the constructor, the square root and the draw

v0.3.0 widened `Fx` from an int32 to an exact integer and v0.4.0 made every
magnitude helper exact. Three things were left holding the old shape, and all
three are on the paths a game reaches for first.

- **`fx()` was still an int32 constructor, and it still flipped sign.** It ended
  in `| 0`, so `fx(2**31)` returned a NEGATIVE number and there was a
  2^31…2^37 u band the type documented but could not build. The wall did not go
  away in v0.3.0; it moved, on the one function every value enters through. It
  is now `n · 2^16`, exact across the range, with `-0` collapsed.
  - It no longer truncates a non-integer argument either. `fx(1.5)` was `1.0`
    and is now exactly 1.5 u; an argument finer than 2^-16 lands between two
    `Fx` and fails `fxIsExact`, which is where a leaked float should surface
    rather than being silently rounded at the door.
- **`sqrt` was the one magnitude helper never rewritten.** Past 2^21 u it floored
  the answer to WHOLE world units — coarser than `vLen` at the same magnitude,
  from the function that promised a square root. It now sheds bits from the
  operand in pairs and gives them back to the result one at a time, so the step
  degrades smoothly from 2^-16 instead of collapsing, and it is exact where the
  product fits. Under 2^21 u — every magnitude a sim forms — results are
  unchanged.
- **`rng.int` drew from one uint32, so it truncated its range and was biased.**
  A span past 2^32 — only 65536 world units once the operands are `Fx`, the same
  order as the wall v0.3.0 removed — returned values from the bottom of the
  requested range and nothing above it, silently. And `%` on a raw draw favours
  the low end of any span that does not divide 2^32 evenly, which is most spans.
  It now draws 53 bits and rejects the uneven tail. `chance(num, den)` is
  `int(1, den) <= num` and inherits both fixes.
- **`fxIsExact` is wired up.** v0.3.0 shipped it as "the guard that replaces the
  coercion" and then nothing called it. `runReplay` now walks the whole state on
  the hash's cadence via the new **`fxStateViolations(state)`** and reports each
  offending path as a violation. This is not belt-and-braces: `hashState` hashes
  a number's DECIMAL TEXT, so a leaked non-integer hashes consistently under V8
  and differently under another runtime's double-to-string — exactly the
  divergence the golden-hash mechanism exists to catch, and the one case it
  cannot catch by itself.
- **The template shipped on v0.1.0.** `template/package.json` and `README.md`
  pinned the original tag, so every game scaffolded since started on the int32
  `Fx`, the ±181 u `vLenSq` and `vLenSq2`, then had to walk three migrations at
  once. The pin is now part of the release checklist in `CLAUDE.md`, and the
  template's `invariants()` uses `fxIsExact` rather than `Number.isInteger`.
- **Two new spellings, both found by migrating a game onto this release.**
  `vDistSq(a, b)` is `vLenSq(vSub(a, b))` without the intermediate `Vec2` — that
  allocation dominates a per-pair-per-tick loop and made the squared form slower
  than the `vDist` it exists to beat. `vRot(v, f)` rotates a body-local vector by
  a unit facing; there is no trig in a sim, so this complex product IS rotation,
  and one game had grown four private copies of it.
- **`docs/CONVENTIONS.md` rule 3 states the contract.** The range, the
  no-bitwise-operators rule, one-exact-spelling-per-operation, and `fxIsExact`.
  All four were previously discoverable only in `fixed.ts` JSDoc and CHANGELOG
  entries an agent reads during an upgrade.

**Determinism: every golden hash in every game moves**, because the RNG draw
changed. Nothing else here alters a value a game was already computing —
`fx`, `sqrt` and the helpers all return exactly what they returned below their
old ceilings — so a hash that moves does so through the RNG stream.

### Migration

1. Re-baseline golden replay/state hashes in one deliberate pass. Expect every
   pinned hash to move and every RNG-dependent tick count to shift slightly;
   intent gates that assert shapes should hold unchanged.
2. **Add `fxIsExact` to your `invariants()`** for the values you care about
   naming, and expect `runReplay` to start reporting `fxStateViolations` paths.
   A hit is a real float leak into sim state — fix the leak, do not filter the
   report.
3. **Seed a min/max sweep from element 0, not a sentinel.** `0x7fffffff` is
   32767.99 u; `±Infinity` is not an integer, so it widens every comparison in
   the loop. A game's narrowphase suite ran 3x faster seeded from element 0.
4. **Delete range-driven reformulations.** Grep for comments citing overflow,
   16.16, int32, 32768 or 2^21, for divide-before-multiply written to "stay in
   range", and for distance-instead-of-squared written to dodge an overflow. All of them are now working around a limit that
   is not there, and several are less accurate than the direct spelling.
5. **Grep for bitwise operators applied to an `Fx`** — `>>`, `<<`, `| 0`, `~~`,
   `>>> 0`. Each one re-imposes the ±32768 u wall. Constants that fold at build
   time are harmless but should still go, so the pattern does not read as
   sanctioned.
6. Content gates asserting coordinates stay under 30000 / 32768 exist only to
   respect the removed wall. Delete them.

## v0.4.0 — one spelling per operation, and it is exact

The magnitude helpers had two problems and they were the same problem. `vDot`,
`vCross` and `vLenSq2` returned "shifted-fx units" whose SCALE depended on how
big the inputs were, so two results were only comparable when both were formed at
the same magnitude — a rule no type could enforce, that every caller had to
remember, and that a game had already worked around in five places. And the
spelling that bought that range divided BOTH operands by 256 at every scale,
including the scales where the square was already exact.

Measured on the shipped code, against the true value computed in BigInt:

| vector | old `vLen` error | now |
|---|---|---|
| acceleration, 0.2 u/tick² | **2.54%** | exact |
| velocity, 7 u/tick | 0.08% | exact |
| unit vector | **0.78%** (0.042° after `vNorm`) | exact |
| ship offset, 40 u | 0.008% | exact |
| arena, 2200 u | 0.0002% | unchanged (1/256 u step) |

The loss was worst where the vectors were smallest, which is backwards: a `vNorm`
of a unit vector kept about 8 significant bits per component. Nothing in the type
said so.

- **`vDot` / `vCross` / `vLenSq` now return `Fx` in world units.** A dot is a
  length times a length. The `…Wide` fall-throughs are gone, and so is the
  "comparisons and ratios only, at the same scale" caveat.
- **`vLenSq2` is DELETED**, and `vLenSq` — which used to carry a "DANGER: only
  valid below 1448 u" note — is now the single squared-length spelling, exact to
  |a| < 370000 u.
- **`mul` and `div` are exact across the range.** Both split at the point when the
  direct product would leave 2^53, so `mul(d, d)` no longer stops being exact at
  1448 u and `div` no longer needs |a| < 2^21 u. `div` also corrects a rounded
  quotient against its remainder, which was off by one at the top of the range.
- **`vLen` / `vDist` / `vNorm` / `pythLeg` are exact while both components are
  under 1024 u** — every per-tick, unit and ship-scale vector — and keep the old
  1/256 u step above that, where a float64 cannot hold the square at all.
- **`vNorm` seats its operands in [2^24, 2^26) first**, so flooring the length
  costs 2^-24 of it rather than 2^-13. This is what fixes normalizing a per-tick
  vector.
- **It is also faster**: 10–14% at accel/velocity/unit/ship scale (the fast path
  forms no quotient), parity at arena scale. The v0.3.0 note warned that testing
  the OPERANDS rather than the live square cost up to 13% — that warning was
  really about a variable divisor defeating constant folding. With literal
  divisors, operand-testing measures 6% against 44% for computing the square and
  discarding it, so this version tests operands. The arrangement is benchmarked;
  do not rearrange it on taste.
- **`test/fixed-exact.test.ts` is new** and proves the above against BigInt rather
  than against another float, at every scale, including the extremes of the range.

**Determinism: every golden hash in every game moves.** Not a semantic change —
the numbers are simply more correct — but every replay hash, render-command hash
and state hash needs re-baselining in one deliberate pass.

### Migration

1. `vLenSq2(a)` → `vLenSq(a)`. The units change from shifted to true fx, so any
   threshold it was compared against must be built the same way: a radius
   comparison is now plainly `vLenSq(d) < mul(r, r)`.
2. `vDot` / `vCross` results are now `Fx`. Sign-only uses (winding,
   point-in-polygon, facing tests) need no change. A use that compared a dot
   against a constant must have that constant re-derived in world units.
3. **Delete local workarounds for the old imprecision.** Grep for `/ 256`,
   `* 256`, `Math.trunc(… / 256)`, hand-rolled `isqrt`, and any comment
   mentioning "truncates"/"sub-1/256". Anything that pre-scaled its operands to
   defeat `vLen`'s truncation, or that hand-inlined the /256 squared distance to
   match `vDist` bit-for-bit, is now WRONG rather than merely redundant: the
   helper it was mirroring no longer rounds that way.
4. Re-baseline golden hashes in one pass, after 1–3, and read any test asserting
   sub-unit tolerances — several will now be tighter than they need to be.

## v0.3.0 — `Fx` is an exact integer, not an int32

`FX_SHIFT` stays at 16 and `FX_ONE` stays at 65536: **the point does not move,
so no value changes meaning and no game needs to re-tune anything.** What moves
is the container.

Every op used to end in `| 0`, capping an `Fx` at int32 — |value| < 32768 world
units — and a product past that wrapped NEGATIVE. It wrapped *deterministically*,
so every machine agreed on the wrong answer and no golden-replay hash could ever
catch it. The `| 0` is gone. An `Fx` is now an exact integer held in a float64,
which uses all 53 of the bits that represent integers exactly, so the range is
|value| < 2^37 u.

The trade this makes is worth stating plainly, because the obvious alternative
is to move the point instead. A JS number has 53 exact integer bits and the old
type used 32 of them; spending the other 21 on range costs nothing, whereas
moving the point buys range by spending resolution the game may well be using.
Widen the container first; move the point only when the host type is genuinely
out of bits.

- **Determinism is unchanged, and so is every existing result.** IEEE-754 pins
  add, subtract, multiply and floor exactly, and integers below 2^53 are exact,
  so the arithmetic is still bit-identical on every platform. Below the old
  int32 ceiling the new ops return exactly what the old ones did — verified by
  running a game's full test suite, headless sim, playtest and render
  command-stream baseline against both: **every hash identical, zero
  rebaseline.** An int64 port reproduces these results directly; nothing here
  relies on 32-bit wrapping any more, which it previously did.
- **Over-range now rounds instead of wrapping.** `mul` is exact while
  |a|·|b| < 2^21 u² (so `mul(d, d)` to d ≈ 1448 u, up from 181 u). Past that it
  sheds low bits at a relative error around 1e-9 that *shrinks* with magnitude —
  it does not flip sign. A silent catastrophe became a bounded rounding error.
- **`vLen` / `vDist` / `vNorm` / `vDot` / `vCross` / `vProj` / `pythLeg` lost
  their ceiling.** They still divide components by 256 before squaring at every
  scale a game reaches — identical results — and fall through to a /65536
  spelling only past 262144 u, where 1 u is already far below the rounding of
  the answer. **[SUPERSEDED by v0.4.0: the fast path forms no quotient at all
  and is exact below 1024 u per component.]**
  - **How the fall-through is decided is load-bearing, so do not "simplify" it.**
    It tests the SQUARE that was going to be computed anyway rather than the
    inputs, and the divisor stays a literal. Two earlier spellings were measured
    and rejected: a rest parameter allocated an array per call (+7% sim CPU),
    and testing the inputs with the divisor passed as a variable stopped the
    engine folding `/ 256` (up to +13% in a game that calls `vLen` per entity
    pair per tick). Guarding on the live square costs one comparison and lands
    inside run-to-run noise. **[SUPERSEDED by v0.4.0: this measured a variable
    divisor defeating constant folding, not operand-testing as such. With
    literal divisors the operand test wins, and that is what ships.]**
- **`vLenSq` is kept and is no longer a trap at arena scale** — exact to
  ~1448 u instead of ~181 u. `vLenSq2` remains the right call where the
  magnitude is unbounded. **[SUPERSEDED by v0.4.0: `vLenSq2` is deleted and
  `vLenSq` is the only squared-length spelling.]**
- **New: `fxIsExact(v)`** — whether a value is still an integer this arithmetic
  can hold. For a game's state invariants, not for a tick. With `| 0` gone,
  nothing coerces a leaked float back to an integer, and a non-integer `Fx` is
  the one thing here that drifts per-platform instead of being reproducible.
  This is the guard that replaces the coercion.
- **Negative zero is collapsed** in `neg` / `mul` / `div` / `fxFromFloat`, which
  `| 0` did as a side effect. A `-0` is arithmetically equal to `0` but not under
  `Object.is`, and JSON round-trips it to `0` — left alone it makes a serialized
  state differ from itself while every value in it matches.
- **`fx()` multiplies instead of shifting and `toInt()` floors instead of
  shifting** — `<<` and `>>` are int32 operators and would have re-imposed the
  wall inside the widened type.

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
   Fx". Where one seeds a min/max sweep, prefer `Infinity` or
   `Number.MAX_SAFE_INTEGER` and re-read any that is asserted against.
4. Range-guard invariants keyed to the 32768 u wall can be relaxed or deleted.
   Where one asks "is this still fixed-point", `fxIsExact` is the direct
   spelling; a plain `Number.isInteger` check is already most of it.
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
