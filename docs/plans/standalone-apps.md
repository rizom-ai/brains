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

Current proof points:

- `yeehaa.io` has been extracted to its own public standalone repo and deploys successfully from the published `@rizom/brain` path.
- `mylittlephoney` has also been extracted out of the monorepo.
- Remaining in-repo apps are `apps/rizom-ai`, `apps/rizom-work`, and `apps/rizom-foundation`.

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

See:

- [deploy-kamal.md](./deploy-kamal.md)
- [standalone-image-publish-contract.md](./standalone-image-publish-contract.md)

## Remaining monorepo apps

Current monorepo apps stay lightweight instance directories until there is a reason to extract them:

- `apps/rizom-ai`
- `apps/rizom-work`
- `apps/rizom-foundation`

Extraction trigger is practical, not doctrinal. Extract when one or more are true:

- app needs its own deploy cadence
- app has one-off local site/theme code better owned beside the instance
- app ownership or access control differs from framework repo ownership
- app changes create too much noise in framework repo review flow

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

## Related

- `docs/plans/deploy-kamal.md`
- `docs/plans/standalone-image-publish-contract.md`
- `docs/plans/public-release-cleanup.md`
