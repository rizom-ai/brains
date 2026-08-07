---
"@rizom/ui": minor
---

Drop the dead background-canvas mount from `RizomFrame`, and hold release configuration to the live workspace: `changeset:check` now fails when `.changeset/config.json` or `.syncpackrc.json` names a package that has left the workspace, the way consumed changesets already are. Retires the stale `@brains/ranger`, `@brains/relay`, `@brains/rover`, `@rizom/site-rizom-foundation`, and `@rizom/site-rizom-work` entries those files still carried.
