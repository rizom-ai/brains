# Plan: Standalone Image Publish Contract

## Context

This contract shipped.

`brain init --deploy` now scaffolds standalone repos that:

- publish their **own** image
- deploy the exact commit SHA that was published
- keep deploy build assets inside the repo itself
- read deploy/runtime secrets from the instance env-schema contract

`yeehaa.io` is the proof case: the standalone repo was regenerated from the published CLI path and deployed successfully end to end.

## Final contract

### Image identity

Standalone repos publish repo-owned images:

```text
ghcr.io/<github.repository_owner>/<github.event.repository.name>
```

Not shared model images like `ghcr.io/rizom-ai/rover`.

### Tags

Each publish produces:

- `latest`
- full commit SHA

Deploy uses the full commit SHA.

### Workflows

`brain init --deploy` scaffolds:

- `.github/workflows/publish-image.yml`
- `.github/workflows/deploy.yml`

Contract:

1. `Publish Image` builds repo-local deploy image assets.
2. it pushes `latest` and `${{ github.sha }}` to repo-owned GHCR path.
3. `Deploy` triggers from successful `Publish Image` completion and also supports manual dispatch.
4. `Deploy` checks out the exact commit that was published.
5. `Deploy` sets `VERSION` to workflow-run SHA, not `latest`.

### Repo-local build assets

Standalone repos own the files needed to build and deploy their image:

- `deploy/Dockerfile`
- `deploy/Caddyfile`
- `.kamal/hooks/pre-deploy`
- `scripts/extract-brain-config.rb`

No standalone workflow should depend on monorepo-only paths.

### Deploy config contract

`config/deploy.yml` uses workflow-derived identity:

- `IMAGE_REPOSITORY`
- `REGISTRY_USERNAME`

Not hardcoded `rizom-ai/<model>` assumptions.

## Shipped fixes that made contract real

The real-user rollout surfaced several published-path bugs. Those are now fixed in shipped CLI behavior:

- built-in env schemas are available from published installs
- standalone deploy workflow no longer shells through fragile YAML greps
- multiline secrets are not pushed through `$GITHUB_ENV`
- provider-specific step secrets are passed directly via step `env:`
- `brain secrets:push` reads `.env` and `.env.local`
- file-backed secret inputs via `<SECRET>_FILE` are supported
- `~/...` in `_FILE` paths resolves against operator home
- `brain ssh-key:bootstrap` is first-class
- workflow writes explicit SSH client config and waits for SSH readiness
- `brain init . --deploy --regen` regenerates derived deploy artifacts for existing repos

## Operator flow

Current supported bootstrap flow for standalone repos:

```bash
brain ssh-key:bootstrap --push-to gh
brain secrets:push --push-to gh
brain cert:bootstrap --push-to gh
```

Then normal deploys run from the scaffolded GitHub workflows.

## What remains

No critical contract work remains before operators can use the standalone path.

Remaining work is maintenance, not contract design:

- keep docs aligned with shipped scaffold shape
- decide when remaining monorepo apps should extract
- keep generated deploy artifacts current as scaffold evolves

## Verification

A standalone repo satisfies the contract when:

1. `brain init <dir> --deploy` produces repo-local deploy assets and both workflows.
2. `Publish Image` pushes to `ghcr.io/<owner>/<repo>`.
3. `Deploy` uses matching commit SHA image.
4. bootstrap flow works using GitHub Actions secrets.
5. published `@rizom/brain` path works without monorepo source resolution.

## Related

- `docs/plans/deploy-kamal.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/rover-pilot.md`
