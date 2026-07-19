# Framework Conventions

These conventions apply to every game built on `@gf/framework`. Each game imports this
file from its `CLAUDE.md`; game-specific rules and overrides live below the import in
that file and take precedence on conflict.

This is a workbench for building games iteratively with a human designer. The human
plays and judges fun; you (the agent) implement, refactor, and generate ideas. Nothing
is one-shotted. Optimize for fast feel-feedback and cheap experimentation.

## Architecture (non-negotiable)

1. **Pure sim core.** All game logic lives in `src/sim/` and imports only
   `@gf/framework/engine`. No DOM, no `fetch`, no `performance.now`, no `Date`,
   no `Math.random`, no Node APIs, no timers. Only plain serializable data, engine
   math, and the provided RNG. The core is `(state, inputs, ctx) -> newState` and
   must be deterministic.
2. **Fixed timestep.** The sim advances in fixed ticks. Tick rate is the single
   `TICK_HZ` constant in `src/config.ts` — never hardcode tick duration assumptions.
   The renderer always interpolates between the last two sim states.
3. **Fixed-point math in the sim.** Use `Fx`/`Vec2` from `@gf/framework/engine` for
   positions, velocities, and anything replay-critical. Floats are allowed only in
   rendering code.
4. **Two RNG streams.** `ctx.rng` (seeded, replay-critical, sim only) and a separate
   cosmetic RNG in the render layer for particles/screenshake/etc. Cosmetic code must
   NEVER consume `ctx.rng` — this silently desyncs replays.
5. **Params, not constants.** All tuning values (speeds, costs, cooldowns, spawn
   rates, damage numbers) live in `src/params.ts` with defaults. The debug panel
   auto-generates sliders from it. Inline magic numbers in sim code are a bug.
6. **Data-driven content.** Cards, enemies, items, levels live in JSON under
   `content/`, validated by schemas in `content/schemas/`. Adding content means
   editing data, not code, wherever feasible.
7. **Schema versioning.** Every save, replay, and network message is stamped with
   `schemaVersion`. Policy: replays are disposable across versions; saves get
   migration functions only once a game has real players.
8. **Adapters, not engines.** Rendering (PixiJS), audio (howler), input, and
   networking sit behind the interfaces in `@gf/framework/shell` and
   `@gf/framework/net`. Sim code never imports them, or any platform library.
9. **Prefer deletable code over general code.** Build features as small isolated
   modules with narrow interfaces. We don't know what's fun yet; ripping things out
   must be cheap. Do not build abstractions for hypothetical future needs.

## Workflow

- **One experiment per branch.** Branch names: `exp/<short-description>`.
- **Commit at every working checkpoint** with small, focused messages.
- **Squash-merge to main.** The squash message summarizes the experiment's outcome.
- **Update the design journal.** `SPEC.md` is a living design journal, not a
  contract. When an experiment is abandoned, add it to the Graveyard with the reason —
  never re-suggest ideas listed there. When mechanics change, update Current Design.
- **Run the invariant suite before merging.** Tests are regression protection, not
  completion criteria. Keep them small: state serializes round-trip, physics doesn't
  NaN, golden replays still match their hashes (regenerate hashes intentionally,
  never to silence a failure you don't understand).
- **Reproduce bugs via replays.** If the designer says "replay 4482 felt wrong at
  tick 300", load the replay, step to the tick, inspect state.

## Framework dependency

- The game pins `@gf/framework` to a git tag in `package.json`. Never point it at a
  branch. Upgrades are deliberate: read the framework `CHANGELOG.md` entries between
  the pinned tag and the target tag, apply the migration notes, bump the pin, run
  the test suite.
- If a change seems to belong in the framework (engine bug, generally useful
  helper), do not fork it locally — flag it to the designer as a framework
  candidate, and work around it minimally in the meantime.

## Commands (uniform across games)

- `npm run dev` — Vite dev server with hot reload + debug panel
- `npm run sim` — headless bot simulation, prints hashes + invariant violations
- `npm test` — invariant + golden replay suite
- `npm run deploy` — build and deploy to the VPS (pm2 + nginx)
