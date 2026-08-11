# CLAUDE.md — Framework Repo

This repo is `@gf/framework`: the shared engine, adapter interfaces, net protocol,
conventions doc, and the `template/` directory that new game repos are scaffolded
from. Multiple game repos depend on this package via pinned git tags.

## Rules for changing this repo

- **Every change here potentially affects all games.** Keep the engine surface small
  and platform-free (`src/engine` must never import DOM, Node, or third-party libs).
- **Tag releases; games pin tags.** After merging changes: bump `version` in
  `package.json`, bump the pin in `template/package.json` and `README.md` to the same
  tag, add a `CHANGELOG.md` entry, then `git tag vX.Y.Z && git push --tags`. Never
  expect games to track a branch. **The template pin is part of the release, not a
  separate chore** — left behind, every newly scaffolded game starts on an ancient
  engine and has to walk every migration at once, which is how `template/` sat on
  v0.1.0 through three releases.
- **CHANGELOG entries must include migration notes** whenever a change requires game
  repos to do anything beyond bumping the pin — API renames, behavior changes,
  template file changes worth back-porting. Write them as instructions an agent can
  execute in a game repo ("rename X to Y; add Z to config.ts").
- **Template drift policy.** Files in `template/` are copied once at scaffold time
  and then owned by each game. Structural improvements to the template (e.g. a new
  CI workflow) are propagated via CHANGELOG migration notes, not mechanical syncs.
- **Determinism is the product.** Any engine change touching `rng.ts`, `fixed.ts`,
  or `replay.ts` semantics invalidates golden replay hashes in every game — call
  this out loudly in the CHANGELOG and treat it as a major-ish bump.
- **Test before tagging:** `npm test` (engine unit tests) and `npm run build` must
  pass.

## Propagating a change to in-progress games

The standard request from the designer will look like: "update all my games to
framework vX.Y". Procedure per game repo: read CHANGELOG entries between its pinned
tag and the target, apply migration notes, bump the pin, `npm install`, run
`npm test`, fix breakage, commit on a branch, PR with squash-merge.
