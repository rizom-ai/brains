# Plan: Final Site/Theme Placement

## Context

Foundation already done:

- themes decoupled from sites
- `brain.yaml` can resolve site and theme independently
- standalone repos can use local `src/site.ts` and `src/theme.css`
- `brain init` scaffolds local convention files
- `mylittlephoney` already proved standalone pattern
- `yeehaa.io` already lives in standalone repo and deploys successfully

So next question not architecture. Next question is ownership:

- which sites stay in monorepo
- which themes stay in monorepo
- which packages should be deleted first
- which branded code should later move into standalone repos

## Inventory: actual theme usage now

Based on current code references in repo:

### Active runtime themes

These still have real runtime consumers in code paths, not just docs/tests:

- `shared/theme-base`
- `shared/theme-default`
- `shared/theme-rizom`
- `shared/theme-brutalist`

### Deleted unused themes

These had no active runtime consumer and were removed from monorepo:

- `shared/theme-editorial`
- `shared/theme-geometric`
- `shared/theme-neo-retro`
- `shared/theme-swiss`
- `shared/theme-yeehaa`

That leaves only active/shared themes in repo before any yeehaa-local cut.

## Decision summary

### Rule 1 — keep only active or shared themes in monorepo

Theme stays in `brains` only if at least one of these is true:

- active runtime consumer exists
- shared by more than one app/brain
- part of public/default framework surface

### Rule 2 — delete dead themes before moving branded active themes

If theme has no active runtime consumer, delete it first.
Do not keep dead themes around because they might maybe be useful later.

### Rule 3 — single-instance branding can move later

For extracted standalone apps like `yeehaa.io`, local `src/site.ts` and `src/theme.css`
are still preferred end state. But that comes **after** dead-package cleanup, not before.

## Final placement map

## Themes

### Keep in monorepo

| Theme                    | Why                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `shared/theme-base`      | framework base layer                                                               |
| `shared/theme-default`   | active default runtime theme                                                       |
| `shared/theme-rizom`     | active shared Rizom theme                                                          |
| `shared/theme-brutalist` | still active via yeehaa package refs; delete later only after yeehaa local cutover |

### Deleted

| Theme                    | Why                                            |
| ------------------------ | ---------------------------------------------- |
| `shared/theme-editorial` | no active runtime consumer found               |
| `shared/theme-geometric` | no active runtime consumer found               |
| `shared/theme-neo-retro` | no active runtime consumer found               |
| `shared/theme-swiss`     | no active runtime consumer found               |
| `shared/theme-yeehaa`    | legacy/orphaned; not current live yeehaa theme |

## Sites

### Keep in monorepo

| Site                 | Why                                           |
| -------------------- | --------------------------------------------- |
| `sites/default`      | core reusable site                            |
| `sites/personal`     | public authoring surface / reusable structure |
| `sites/professional` | public authoring surface / reusable structure |
| `sites/rizom`        | shared Rizom site package                     |

### Keep for now, decide later

| Site           | Why                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `sites/yeehaa` | still backs current yeehaa package ref path; local cutover can happen after dead theme cleanup |

## Order of work

### Phase 1 — delete all unused themes

Deleted:

- `shared/theme-editorial`
- `shared/theme-geometric`
- `shared/theme-neo-retro`
- `shared/theme-swiss`
- `shared/theme-yeehaa`

Also clean references in:

- docs
- package inventory docs
- export tests
- `bun.lock`
- any package manifests or examples that still mention them

Goal:

- monorepo contains only active/shared themes
- no dead branded or stock themes remain

### Phase 2 — verify surviving theme set

After Phase 1, surviving monorepo theme set should be:

- `theme-base`
- `theme-default`
- `theme-rizom`
- `theme-brutalist`

At that point theme inventory becomes small and intentional.

### Phase 3 — handle yeehaa final cut

Only after dead-theme cleanup:

Option A:

- keep `sites/yeehaa` + `theme-brutalist` in monorepo longer

Option B:

- move yeehaa structure and styling into `rizom-ai/yeehaa-io`
  - `src/site.ts`
  - `src/theme.css`
- then delete:
  - `sites/yeehaa`
  - `shared/theme-brutalist`

Current preference remains local convention for standalone repos, but this is second step, not first.

## Why this order

Because right now biggest source of confusion is dead theme inventory.

If we first localize yeehaa while dead themes still sit in monorepo, package inventory stays muddy.
If we first remove dead themes, remaining decisions become obvious:

- framework/shared themes stay
- active yeehaa theme stays temporarily
- later yeehaa cut can be done cleanly

## Validation

### Phase 1 validation

After deleted-theme cleanup:

- theme export tests updated or reduced appropriately
- docs no longer advertise deleted themes
- package inventory docs match reality
- root install / lockfile consistent
- targeted tests pass for touched areas

### Phase 3 validation

If/when yeehaa local cut happens later:

- `bunx brain start` in standalone repo uses local convention correctly
- deploy still passes
- `yeehaa.io` still returns `200`

## Non-goals

- redesign yeehaa now
- move yeehaa site/theme now as part of same cleanup
- preserve dead themes for hypothetical future reuse
- expand public theme catalog before real consumers exist

## Status

- [x] decouple themes from sites
- [x] support standalone `src/site.ts` and `src/theme.css`
- [x] make `brain init` scaffold local convention files
- [x] extract and deploy `yeehaa.io` as standalone repo
- [x] delete unused themes from monorepo
- [x] clean docs/tests/manifests after deletion
- [ ] decide final yeehaa local cut after dead-theme cleanup

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/harmonize-monorepo-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/architecture/package-structure.md`
- `docs/theming-guide.md`
