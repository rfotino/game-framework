# @gf/framework

A workbench for building 2D games (roguelike deck builders, platformers, multiplayer
dungeon crawlers, ...) iteratively with an LLM coding agent. The designer plays and
judges fun; the agent implements against a pure, deterministic, headlessly-testable
core.

## Model

- **This repo** is a versioned package + template. Games do NOT live here.
- **Each game is its own repo**, scaffolded from `template/` via
  `npx degit rfotino/game-framework/template <slug>`, depending on this package
  through a pinned git tag: `"@gf/framework": "github:rfotino/game-framework#v0.1.0"`.
- **Shared conventions** live in `docs/CONVENTIONS.md`; each game's `CLAUDE.md`
  imports it from `node_modules` and layers game-specific rules on top.
- **Global changes** ship as tagged releases with CHANGELOG migration notes; an
  agent applies them across game repos ("update all my games to v0.2").

## The architectural bet

1. **Pure sim core** — `(state, inputs, ctx) -> newState`, fixed timestep,
   fixed-point math, seeded RNG. Buys: replays, invariant testing,
   server-authoritative multiplayer with shared code, and cheap future ports
   (golden replay hashes verify a C#/Haxe translation of a small, platform-free
   surface).
2. **Everything else is a thin adapter** — PixiJS rendering, howler audio, input,
   WebSocket protocol — behind narrow interfaces, reimplementable per platform.
3. **Iteration speed is the feature** — Vite hot reload, live param sliders from
   `params.ts`, data-driven JSON content, and a living `SPEC.md` design journal with
   an experiment graveyard.

## Layout

```
CLAUDE.md            rules for changing THIS repo (tagging, changelog, drift policy)
SETUP.md             interview script the agent runs to start a new game
CHANGELOG.md         release notes + agent-executable migration instructions
docs/CONVENTIONS.md  shared conventions imported by every game's CLAUDE.md
src/engine/          game contract, RNG, fixed-point, replay (platform-free)
src/shell/           renderer/audio/input/debug-panel interfaces, visual manifest
src/net/             message envelope + server-authoritative protocol
template/            scaffold copied into each new game repo (then owned by it)
```

## Starting game 1

1. Push this repo to GitHub and tag it: `git tag v0.1.0 && git push --tags`.
2. Tell the agent: "Run SETUP.md to start a new game."

## Targets

TS ships web (native), Steam (Tauri/Electron), mobile (Capacitor). Consoles are a
fund-the-port-when-earned decision, de-risked by the pure core + golden replays.
