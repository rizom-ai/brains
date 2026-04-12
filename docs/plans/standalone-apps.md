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
- app-specific site/theme code lives locally in `src/site.ts` and `src/theme.css`
- the monorepo ends with no `apps/*` directories

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

| App                     | Brain model | Domain(s)          | Current content repo            | Deploy scaffold in app repo                                                  | Monorepo-only site/theme coupling                          | Notes                    |
| ----------------------- | ----------- | ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------ |
| `apps/rizom-work`       | `ranger`    | `rizom.work`       | none configured in `brain.yaml` | no `package.json`, no `.env.schema`, no deploy scaffold                      | `site.package: "@brains/site-rizom"`, variant `work`       | simplest starting point  |
| `apps/rizom-foundation` | `relay`     | `rizom.foundation` | none configured in `brain.yaml` | no `package.json`, no `.env.schema`, no deploy scaffold                      | `site.package: "@brains/site-rizom"`, variant `foundation` | likely second move       |
| `apps/rizom-ai`         | `ranger`    | `rizom.ai`         | `rizom-ai/rizom-ai-content`     | partial only: `package.json`, `.env.schema`, Kamal hook, `config/deploy.yml` | `site.package: "@brains/site-rizom"`, variant `ai`         | flagship site; move last |

### Shared Rizom packages can stay

This migration does **not** require removing `sites/rizom` or `shared/theme-rizom` from the monorepo.

Today those packages are still referenced by framework-owned code:

- `brains/ranger/src/index.ts`
- `brains/relay/src/index.ts`
- `packages/brain-cli/src/commands/init.ts`

That is acceptable.

Current recommendation:

- move the remaining `apps/*` repos out first
- keep `sites/rizom` and `shared/theme-rizom` in the monorepo as shared public packages
- revisit their ownership only later if they become maintenance drag or stop being useful as public examples

### Standard extraction procedure

For each app:

1. scaffold a fresh repo with the published CLI
2. copy in app-specific config (`brain.yaml`, `.env.schema`, `.env.example`, deploy config)
3. move app-specific site/theme ownership into local `src/site.ts` and `src/theme.css`
4. run `brain init . --deploy --regen`
5. boot locally from the repo itself
6. create and push the standalone repo
7. run the standard bootstrap flow for SSH/secrets/certs
8. deploy from the published package path
9. verify the live site
10. remove the old monorepo app
11. update docs/tests

### Extraction order

Use the lowest-risk order first:

1. `apps/rizom-work`
2. `apps/rizom-foundation`
3. `apps/rizom-ai`

`rizom-ai` should move last because it is the flagship public site and the most likely to rely on monorepo assumptions.

### Shared branded code policy

Do not invent a new cross-repo abstraction during extraction.

Default rule:

- standalone apps may continue using the existing shared `sites/rizom` and `shared/theme-rizom` packages
- if an extracted app later needs one-off ownership, it can move to local `src/site.ts` / `src/theme.css`
- do not force local duplication as part of the extraction itself

This keeps the extraction focused on repo ownership and deploy ownership instead of bundling in a branding refactor.

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

1. `rizom-work`, `rizom-foundation`, and `rizom-ai` each live in their own repo.
2. each deploys successfully from the published `@rizom/brain` path.
3. the monorepo has no remaining `apps/*` directories.
4. shared Rizom site/theme packages remain only if they are still useful shared public packages.

## Related

- `docs/plans/public-release-cleanup.md`
