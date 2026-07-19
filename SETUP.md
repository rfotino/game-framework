# SETUP.md — Starting a New Game

You are the agent. Run this as an interview with the designer, one section at a time.
Record every answer (and the reasoning) in the new game's `SPEC.md` under "Setup
decisions". Suggest defaults, but the designer decides.

Each game is its own git repository, scaffolded from this framework's `template/`
directory and depending on `@gf/framework` via a pinned git tag.

## 1. Identity

- Game name and short slug (used for repo name, package name, deploy path)?
- One-sentence pitch?
- Genre / closest reference games?

## 2. Tick rate

Present the tradeoffs, then suggest a default by genre:

- **30 Hz**: half the sim CPU (matters for multiplayer servers hosting many rooms,
  and mobile battery), half the snapshot bandwidth, more per-tick budget for heavy
  logic (proc-gen, big entity counts). Cost: up to ~33ms added input latency and
  easier tunneling through thin colliders unless collision is swept.
- **60 Hz**: tight, responsive feel — jump buffering, coyote time, landing precision.
  Costs CPU/bandwidth and shrinks per-tick compute budget.

Genre defaults: platformer → 60. Turn-based/deck builder → tick-on-input; set
`TICK_HZ` to 30 for animation timers. Dungeon crawler / top-down action → 30 with
swept collision if movement is fast.

Global rule regardless of choice: `TICK_HZ` is one constant in `src/config.ts`, and
the renderer interpolates. Changing tick rate later must remain a one-line experiment.

## 3. Multiplayer & netcode

- Single-player, local co-op, or online multiplayer?
- If online, present the models:
  - **Server-authoritative snapshots** (default for co-op): server runs the same sim
    core, clients send inputs, server broadcasts state. Robust to desync, supports
    mid-game join, cheat-resistant. Costs bandwidth (mitigated by 30 Hz + delta
    compression later).
  - **Deterministic lockstep**: clients exchange only inputs; tiny bandwidth. But one
    desync ruins the session, mid-game join is hard, and it demands strict
    determinism discipline everywhere. Consider only for small, fixed-player-count
    games.
- Record the choice. Single-player games still keep the sim/render split — netcode
  can be added later without rearchitecting.

## 4. Asset strategy

Present the menu; the answer can differ per game and can evolve:

- **Pure shapes** (tinted rects/circles via the visual manifest): zero friction,
  starts today, ugly. Best while finding the fun.
- **Free packs (e.g. Kenney)**: decent cohesive look, small manifest-wiring cost,
  constrains art direction to what packs offer.
- **Commissioned / custom art later**: real identity, real money and lead time. Only
  once a game has earned it.

Global rule: rendering goes through the manifest in `src/render/manifest.ts` mapping
entity type → visual, so upgrading tiers never touches sim or game code.

## 5. Content & data

- What content types does this game need (cards? enemies? rooms? levels?)?
- Define a JSON schema per type under `content/schemas/` before authoring content.
- Proc-gen or authored? If proc-gen, generation runs in the sim core off `ctx.rng`.

## 6. Repo setup

1. **Scaffold from the template directory:**
   `npx degit rfotino/game-framework/template <slug> && cd <slug>`
2. **Fill in the scaffold:** rename in `package.json`; set `TICK_HZ` in
   `src/config.ts`; record interview answers in `SPEC.md`; add game-specific rules
   to `CLAUDE.md` below the conventions import. Confirm the `@gf/framework` pin
   points at the latest framework tag.
3. **Create the remote:**
   `git init && gh repo create <slug> --private --source=. --push`
4. **Configure merge style:**
   `gh repo edit --enable-squash-merge --disable-merge-commit --disable-rebase-merge --delete-branch-on-merge`
5. **Confirm CI** (`.github/workflows/ci.yml` ships in the template) runs `npm test`
   on PRs.
6. First commit: scaffold + SPEC.md. First branch: `exp/walking-skeleton` — smallest
   playable loop (render a state, accept an input, tick the sim).

## 7. Definition of "playable today"

Ask: what is the smallest thing the designer can play this week to start judging
feel? That becomes the walking skeleton. Do not build past it before the designer
plays.
