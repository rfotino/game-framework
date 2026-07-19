# Changelog

Entries newest-first. Every entry that requires action in game repos includes a
**Migration** section written as agent-executable instructions.

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
