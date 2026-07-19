# SPEC.md — <Game Name>

A living design journal, not a contract. The agent updates this as the game evolves.
Its most important job: never let an abandoned idea be re-suggested.

## Pitch

One sentence.

## Setup decisions

Recorded from the SETUP.md interview:

- **Genre / references:**
- **Tick rate:** <30|60|tick-on-input> — reasoning:
- **Multiplayer / netcode:** <none | server-authoritative | lockstep> — reasoning:
- **Asset strategy (current tier):** <shapes | free packs | custom> — manifest at `src/render/manifest.ts`
- **Content types & schemas:**
- **Repo:** <url>, squash-merge, branches `exp/*`

## Current design

The state of the game as implemented right now. Mechanics, rules, win/loss, controls.
Keep this accurate — it is the agent's ground truth between sessions.

## Currently exploring

Open questions and the active experiment branch(es).

## Experiment graveyard

Ideas tried and rejected. NEVER re-suggest these. Format:

| Experiment | Branch | Verdict & why |
| --- | --- | --- |
| (example) enemies drop coins | exp/coin-drops | Rejected — cluttered the screen, pickup detour broke combat flow |

## Backlog / someday

Ideas not yet tried, roughly ordered. The designer prunes this; the agent may append
with a note when ideating.
