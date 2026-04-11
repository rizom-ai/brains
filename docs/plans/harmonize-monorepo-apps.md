# Plan: Unify App Shape

## Context

After Tier 1 library exports + the `brain init` package.json scaffolding
change, **standalone brains** (created by `brain init` outside the
brains monorepo) have this shape:

```
my-brain/
├── brain.yaml
├── tsconfig.json
├── package.json     # ← @rizom/brain dep + preact peer
├── .env
├── .gitignore
├── README.md
└── src/             # custom site/theme/plugin code
```

**Monorepo apps** (`apps/rizom-ai`, `apps/rizom-work`, `apps/rizom-foundation`, etc.)
are config-only directories with no `package.json`:

```
apps/rizom-ai/
├── brain.yaml
├── tsconfig.json    # JSX config only
├── deploy/
└── brain-data/      # gitignored
```

This inconsistency is acceptable in the short term — the monorepo
apps lean on workspace deps, the standalone case is the user-facing
shape. Both work today. But long term we want one shape so the
mental model and tooling are uniform.

## Why harmonize

- **Single mental model.** "An app is a directory with brain.yaml
  and a package.json." No "monorepo apps are different" footnote.
- **`brain init` works inside the monorepo too.** Today running
  `brain init` from `apps/` produces the standalone shape, which
  doesn't match the existing apps. After harmonization, init's
  output is consistent everywhere.
- **Easier extraction.** Pulling an app out to a standalone repo
  becomes `cp -r apps/foo ~/foo-standalone` with no shape changes,
  not "rewrite the dir layout".
- **Consistent dev workflow.** `cd apps/foo && bun install &&
bunx brain start` works whether the app is in the monorepo or
  outside it.

## Why not now

- **Figuring out the workspace dep story is non-trivial.** The
  monorepo apps need `@rizom/brain` in their `package.json`. Three
  options, none obviously right:
  - **(a) `workspace:*`** — turns the apps back into workspace members,
    which we explicitly removed. Reverses an architectural decision.
  - **(b) `file:../../packages/brain-cli`** — explicit local path,
    works without workspace membership. Slightly ugly. Breaks if
    someone moves the app dir.
  - **(c) `*` + hoisted node_modules** — relies on bun finding
    `@rizom/brain` in the root `node_modules` from the workspace
    install. Brittle, depends on bun's resolution algorithm.
- **No user-facing pressure.** Users only see the standalone shape.
  The monorepo case is a developer convenience used by us.
- **Migration touches every app.** 5 apps × testing each one's
  `bunx brain start` works post-migration.
- **The goal post may move.** Per `standalone-apps.md`, the long-term
  plan is to extract apps out of the monorepo entirely. If we do
  that first, harmonization becomes moot — there are no monorepo
  apps to harmonize.

## Phases

### Phase 1: Extract mylittlephoney as the first standalone (NOW)

mylittlephoney has to leave the public monorepo anyway (per
`public-release-cleanup.md` Phase 3b). It becomes the first
consumer of the new shape and proves the `brain init` scaffolding
works end-to-end.

**Steps:**

1. Update `brain init` to scaffold the unified shape: `package.json`
   (with `@rizom/brain` + `preact`), `.gitignore`, `README.md`,
   `src/` stub, in addition to the existing `brain.yaml` +
   `tsconfig.json` + optional `.env`.
2. Run `brain init mylittlephoney` in `~/Documents/` (sibling of
   the brains monorepo) to scaffold the new dir.
3. Copy mylittlephoney's existing config into the scaffolded dir:
   - `apps/mylittlephoney/brain.yaml` → root (preserve plugin overrides)
   - `apps/mylittlephoney/deploy/` → root
   - `apps/mylittlephoney/.env` → root
   - `sites/mylittlephoney/src/index.ts` → `src/site.ts`, rewriting
     imports from `@brains/site-personal` / `@brains/plugins` /
     `@brains/app` to `@rizom/brain/site`
   - `shared/theme-mylittlephoney/src/theme.css` → `src/theme.css`
4. `bun install` in the new dir (uses `file:` ref to brains monorepo
   for `@rizom/brain` until npm publish).
5. Verify `bunx brain start` boots the brain.
6. Delete `apps/mylittlephoney`, `sites/mylittlephoney`,
   `shared/theme-mylittlephoney` from the brains monorepo.
7. Verify brains monorepo still typechecks/tests/builds.

**Status:** the new dir lives as a folder on disk, NOT yet a git
repo. Folder → repo conversion is a separate step (`git init &&
git remote add origin && git push`) done when ready. The `file:`
ref dep flips to git ref / npm version at the same time.

**Effort:** ~half day.

### Phase 2: Decide trigger for remaining monorepo apps (post-v0.1.0)

Two apps stay in the public monorepo with the config-only shape:
`rizom-ai`, `rizom-foundation`. (`yeehaa.io` has already been extracted to a standalone repo.) Phase 2 is the
decision moment, not work:

- If `standalone-apps.md` extraction is imminent (weeks), skip
  harmonization entirely — the apps will leave the monorepo before
  the inconsistency matters.
- If extraction is far off (months) OR a real annoyance has hit
  (a developer trips over the inconsistency, `brain init`
  produces something that doesn't drop into `apps/` cleanly),
  proceed to Phase 3.

**Trigger:** post-v0.1.0 review meeting.

### Phase 3: Migrate remaining apps to unified shape (LATER)

For each of `apps/rizom-ai`, `apps/rizom-foundation`:

1. Add `package.json` with the chosen workspace dep strategy
   (decided in Phase 2):
   ```json
   {
     "name": "@brains/app-rizom-ai",
     "private": true,
     "type": "module",
     "dependencies": {
       "@rizom/brain": "workspace:*",
       "preact": "^10.27.2"
     }
   }
   ```
2. Add the app dir back to root `package.json` workspaces glob
   (or use explicit list).
3. Verify `bun install` and `bunx brain start` from the app dir.
4. Verify `bun run typecheck`, `bun run test`, `bun run lint`
   still pass for the whole monorepo.
5. Update README in the app explaining the dev workflow.

**Effort:** ~1-2 hours per app + testing. ~half day total for 3 apps.

## Status

- [x] **Phase 1:** Extract mylittlephoney as the first standalone
  - [x] Update `brain init` to scaffold unified shape
  - [x] Run `brain init mylittlephoney` in sibling dir
  - [x] Migrate config + custom code
  - [x] Verify boot
  - [x] Delete from brains monorepo
- [ ] **Phase 2:** Decide trigger for remaining apps (post-v0.1.0)
- [ ] **Phase 3:** Migrate `rizom-ai`, `rizom-foundation`
      (only if Phase 2 says go)
- [ ] Document unified shape in `docs/architecture/package-structure.md`

## Related

- `docs/plans/library-exports.md` — Tier 1 enables the standalone shape
- `docs/plans/standalone-apps.md` — long-term extraction (the goal-post)
- `docs/plans/public-release-cleanup.md` — Phase 3 deletions/extractions
