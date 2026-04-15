# Plan: Standalone App Repos

## Context

Apps are instance config, not framework code. Standard instance shape now comes from `brain init` and works both for local development and standalone deploys.

That shape is no longer just `brain.yaml` + deploy config. A fresh standalone repo now typically contains:

```text
my-brain/
├── brain.yaml
├── .env.example
├── .env.schema
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── site.ts
│   └── theme.css
├── config/
│   └── deploy.yml            # with --deploy
├── deploy/
│   ├── Dockerfile            # with --deploy
│   └── Caddyfile             # with --deploy
├── .kamal/hooks/pre-deploy   # with --deploy
├── .github/workflows/
│   ├── publish-image.yml     # with --deploy
│   └── deploy.yml            # with --deploy
└── scripts/
    └── extract-brain-config.rb # with --deploy
```

Current scope:

- remaining in-repo apps are `apps/rizom-ai`, `apps/rizom-work`, and `apps/rizom-foundation`
- future extractions should use the standard `brain init` standalone shape directly

## Decision

Prefer **extraction over harmonization**.

We are not trying to make in-repo apps imitate the full standalone shape first. When an app wants independent ownership, deploy cadence, or repo history, extract it directly into the standard standalone shape scaffolded by `brain init`.

## Why

- App repos own instance-specific code: `brain.yaml`, local site/theme code, deploy config, repo-local workflows.
- Standalone repos now own their own GHCR image namespace and rollout cadence.
- Content can still live in a separate git-synced content repo when desired.
- The user-facing operator story should match the standalone path, not an internal monorepo convenience shape.

## Repository split

### Standalone app repo

Owns instance-specific config and code:

- `brain.yaml`
- local `src/site.ts` and `src/theme.css` when customized
- deploy config and workflows
- bootstrap files such as `.env.schema`
- repo-local image publication and deploy history

### Content repo

Still separate when directory-sync is used against a dedicated content repository.

That split remains useful because content changes are high-churn while app config changes are low-churn.

## Deploy contract

Standalone repos do **not** deploy shared model images like `ghcr.io/rizom-ai/rover`.

They publish and deploy their own repo image:

```text
ghcr.io/<owner>/<repo>
```

Deploys use the image built from the same commit SHA that triggered `Publish Image`.

This repo-level publish/deploy contract is part of the standard standalone app shape.

## Open work: extract the remaining monorepo apps

Remaining app directories:

- `apps/rizom-work`
- `apps/rizom-foundation`
- `apps/rizom-ai`

The target end state is simple:

- each app lives in its own standalone repo
- each repo follows the standard `brain init` shape
- each repo deploys from the published `@rizom/brain` path
- the monorepo ends with no `apps/*` directories

That does **not** mean every app should move immediately. Unfinished app mockups should be implemented first, so extraction happens after site ownership is clear enough to avoid double churn.

### Preflight for each app

Before extraction, capture:

- target repo slug
- production domain(s)
- current `brain.yaml`
- current `.env.schema` and secret inventory
- current content repo
- current deploy config
- whether any monorepo-only site/theme/package refs remain
- whether infra should be reused or replaced

Current preflight snapshot:

| App                     | Brain model | Domain(s)          | Current content repo                | Deploy scaffold in app repo                                                                           | Monorepo-only site/theme coupling                                                                            | Notes                                                                                            |
| ----------------------- | ----------- | ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `apps/rizom-work`       | `ranger`    | `rizom.work`       | `rizom-ai/rizom-work-content`       | no `package.json`, no `.env.schema`, no deploy scaffold                                               | `site.package: "@brains/site-rizom-work"` thin wrapper over shared Rizom base                                | wrapper-owned routes + tracked site-content now in place; still needs standalone extraction prep |
| `apps/rizom-foundation` | `relay`     | `rizom.foundation` | `rizom-ai/rizom-foundation-content` | no `package.json`, no `.env.schema`, no deploy scaffold                                               | `site.package: "@brains/site-rizom-foundation"` thin wrapper over shared Rizom base                          | wrapper-owned routes + tracked site-content now in place; still needs standalone extraction prep |
| `apps/rizom-ai`         | `ranger`    | `rizom.ai`         | `rizom-ai/rizom-ai-content`         | partial only: `package.json`, `.env.schema`, Kamal hook, `config/deploy.yml`; no tracked GH workflows | `site.package: "@brains/site-rizom-ai"` thin wrapper over shared Rizom base; deploy still model-image-shaped | best extraction candidate; wrapper seam now exists                                               |

### `rizom.ai` extraction preflight

`rizom.ai` is still the best next extraction candidate. One blocker remains.

Current blocker:

- the Rizom site packages used by the monorepo app (`@brains/site-rizom`, `@brains/site-rizom-ai`) are not published consumable packages, so a standalone repo cannot depend on them directly today

The previously-flagged `init --deploy` regression against `@rizom/brain@0.2.0-alpha.5` is resolved: the current published CLI (verified at `alpha.18`) scaffolds all expected files cleanly (`brain.yaml`, `.env.schema`, `config/deploy.yml`, `deploy/Caddyfile`, `deploy/Dockerfile`, `.github/workflows/deploy.yml` + `publish-image.yml`, `.kamal/hooks/pre-deploy`, `scripts/extract-brain-config.rb`).

Current state to carry forward:

- app package: `apps/rizom-ai`
- brain model: `ranger`
- domain: `rizom.ai`
- content repo: `rizom-ai/rizom-ai-content`
- site package: `@brains/site-rizom-ai`
- tracked env files: `.env.example`, `.env.schema`
- tracked deploy files: `config/deploy.yml`, `.kamal/hooks/pre-deploy`

Known gaps versus standard standalone `brain init --deploy` shape:

- no tracked `.github/workflows/publish-image.yml`
- no tracked `.github/workflows/deploy.yml`
- no tracked `deploy/Dockerfile`
- no tracked `deploy/Caddyfile`
- no tracked `scripts/extract-brain-config.rb`
- current `config/deploy.yml` still uses model-image shape (`image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>`) instead of repo-image shape
- app still has monorepo-local start script assumptions in `package.json`
- local working tree contains ignored runtime junk (`brain-data/.git`, `dist/`, `data/`, `.env`, `.env.local`, `node_modules/`) that must not be copied into extraction

Recommended next step for `rizom.ai` is choosing one site-package unblock path:

1. either make the Rizom site/theme runtime consumable outside the monorepo (publish `@brains/site-rizom` and `@brains/site-rizom-ai`)
2. or vendor `rizom.ai` site ownership into app-local `src/site.ts` and `src/theme.css` during extraction

Once that blocker is cleared:

1. scaffold fresh standalone repo from published CLI with `--deploy`
2. copy over only intentional app-owned files:
   - `brain.yaml`
   - `.env.schema`
   - `.env.example`
   - app README content as needed
   - final `src/site.ts` or wrapper dependency choice
3. preserve content repo slug `rizom-ai/rizom-ai-content`
4. regenerate derived deploy artifacts from published CLI inside new repo
5. diff generated deploy/image workflow shape against current `apps/rizom-ai` partial setup and keep only current values that are still intentional
6. boot locally from new repo
7. bootstrap secrets/SSH/certs using standard flow
8. deploy and verify before removing `apps/rizom-ai`

### Shared Rizom packages can stay

This migration does **not** require removing shared Rizom packages from the monorepo.

Today those packages are still referenced by framework-owned code:

- `brains/ranger/src/index.ts`
- `brains/relay/src/index.ts`
- `packages/brain-cli/src/commands/init.ts`

That is acceptable.

Current recommendation:

- keep shared Rizom theme tokens and shared site building blocks in the monorepo
- stop treating `sites/rizom` as the one final site package for all three branded apps
- move app repos out only after each app's site composition is clear enough to own directly
- revisit package ownership later only if the shared pieces become maintenance drag or stop being useful as public examples

### Rizom site strategy: shared base, app-owned composition

`rizom.ai`, `rizom.foundation`, and `rizom.work` now differ enough that they should not keep growing behind one shared `variant` switch.

Working rule:

- shared packages keep reusable primitives
- each app owns its final site composition
- extraction moves that composition into app-local `src/site.ts`

Detailed cut plan lives in `docs/plans/rizom-site-composition.md`.

### Gating rule for unfinished apps

Do not extract an app while its site mockup is still obviously unfinished.

Instead:

1. split shared base pieces from app-specific site composition
2. implement the missing mockup with app-owned composition while shared primitives stay reusable
3. only then extract the app repo

This avoids doing the repo move and the site redesign at the same time, and avoids growing `sites/rizom` into a hard-to-maintain variant switchboard.

### Standard extraction procedure

For each app that has cleared that gate:

1. scaffold a fresh repo with the published CLI
2. copy in app-specific config (`brain.yaml`, `.env.schema`, `.env.example`, deploy config)
3. move the app's final site composition into local `src/site.ts`
4. keep shared Rizom theme/base primitives only where they are still genuinely reusable
5. move app-only styling into local `src/theme.css` when needed
6. run `brain init . --deploy --regen`
7. boot locally from the repo itself
8. create and push the standalone repo
9. run the standard bootstrap flow for SSH/secrets/certs
10. deploy from the published package path
11. verify the live site
12. remove the old monorepo app
13. update docs/tests

### Extraction order

Implement unfinished mockups first, then extract whichever app is stable enough.

Current recommendation:

1. carve shared base pieces out of the current Rizom site code
2. implement `rizom.foundation` with app-owned composition first
3. implement `rizom.work` the same way after the pattern is proven
4. move `rizom.ai` on its own track once that repo/ownership decision is desirable
5. extract each app only after its own composition is stable

The key rule is readiness and ownership clarity, not doctrinal ordering.

### Shared branded code policy

Do not invent a new deep abstraction or inheritance system during extraction.

Default rule:

- keep only genuinely reusable Rizom primitives shared
- let each extracted app own its final `src/site.ts`
- let each extracted app own `src/theme.css` whenever styling stops being broadly reusable
- do not keep app-specific route trees trapped behind a single shared `variant` package

This keeps ownership explicit and prevents branding differences from turning into framework-level complexity.

## Explicit non-goals

- Do not force current monorepo apps into a fake standalone shape inside the monorepo first.
- Do not collapse content repos back into app repos just for symmetry.
- Do not require all apps to leave the monorepo at once.

## Verification

An extracted app repo is correct when:

1. `bun install && bunx brain start` works from the repo itself.
2. `brain init . --deploy --regen` can regenerate derived deploy artifacts safely.
3. `Publish Image` publishes to `ghcr.io/<owner>/<repo>`.
4. `Deploy` consumes the matching commit-SHA image.
5. app-specific site/theme code lives with the app, not in one-off monorepo packages.
6. content sync still works against the chosen content repo.

The overall plan is done when:

1. each extracted app lives in its own repo.
2. each extracted app deploys successfully from the published `@rizom/brain` path.
3. unfinished apps are not extracted until their mockup/site ownership is clear enough to avoid double churn.
4. when the migration is fully complete, the monorepo has no remaining `apps/*` directories.
5. shared Rizom site/theme packages remain only if they are still useful shared public packages.

## Related

- `docs/plans/public-release-cleanup.md`
- `docs/plans/rizom-site-composition.md`
