# Plan: Kamal Deploy

## Context

Kamal is now the standard deploy shape for standalone brain repos scaffolded by `brain init --deploy`.

The important architectural shift is not only tool choice. It is ownership:

- framework repo ships runtime and shared packages
- instance repo owns deploy config, workflows, local site/theme code, and rollout cadence

`yeehaa.io` is the current proof case for the published-path standalone flow.

## Current deploy contract

A standalone repo scaffolded with `brain init --deploy` owns:

```text
brain.yaml
.env.schema
config/deploy.yml
deploy/Dockerfile
deploy/Caddyfile
.kamal/hooks/pre-deploy
.github/workflows/publish-image.yml
.github/workflows/deploy.yml
scripts/extract-brain-config.rb
```

## Image contract

Standalone repos publish repo-owned images:

```text
ghcr.io/<owner>/<repo>
```

Not shared model images like `ghcr.io/rizom-ai/rover`.

`Publish Image` pushes:

- `latest`
- full commit SHA

`Deploy` consumes the matching commit SHA.

## Deploy workflow contract

### Publish Image

Runs on push to `main` and manual dispatch.

Responsibilities:

1. build image from repo-local deploy assets
2. push to repo-owned GHCR image path
3. tag both `latest` and exact commit SHA
4. include Kamal-required image label `service=brain`

### Deploy

Runs after successful `Publish Image` and also supports manual dispatch.

Responsibilities:

1. check out exact published commit
2. load/validate env via instance `.env.schema`
3. write `.kamal/secrets`
4. provision server if needed
5. update Cloudflare DNS before Kamal deploy
6. run `kamal deploy` with `VERSION` set to published commit SHA

## `config/deploy.yml` contract

The generated deploy config is instance-generic and workflow-fed.

Important inputs:

- `IMAGE_REPOSITORY`
- `REGISTRY_USERNAME`
- `SERVER_IP`
- `BRAIN_DOMAIN`

It should not hardcode old assumptions like `rizom-ai/<model>`.

## `brain.yaml` delivery

`brain.yaml` is uploaded by the scaffolded pre-deploy hook before each deploy.

That keeps the instance config in source control beside the repo that owns the deployment.

## Secrets contract

Supported operator path:

- local files and env values live in `.env.local`, `.env`, or process env
- `.env.schema` is the contract for what deploy/runtime secrets exist
- `brain secrets:push --push-to gh` syncs env-backed secrets to GitHub Actions

Important shipped behavior:

- `.env.local` is read
- `<SECRET>_FILE` is supported
- `~/...` paths resolve against operator home
- multiline secrets are read from files cleanly

## Bootstrap flow

Use official bootstrap commands, not ad hoc manual secret wiring:

```bash
brain ssh-key:bootstrap --push-to gh
brain secrets:push --push-to gh
brain cert:bootstrap --push-to gh
```

What they do:

- `ssh-key:bootstrap` creates or validates deploy SSH key, registers public key with Hetzner, can push private key to GitHub
- `secrets:push` syncs env-backed secrets from local contract to GitHub Actions
- `cert:bootstrap` issues Cloudflare Origin CA cert, sets SSL mode to Full (strict), can push cert/key to GitHub

## SSL and DNS

Current deploy path assumes:

- Cloudflare fronts the public hostname
- Cloudflare Origin CA cert is used between Cloudflare and origin
- DNS is updated before Kamal deploy so healthchecks resolve correctly

This keeps zero-downtime deploys compatible with Cloudflare proxying.

## Regeneration for existing repos

Generated deploy artifacts evolve.

Current maintenance path:

```bash
brain init . --deploy --regen --no-interactive
```

`--regen` rewrites only derived deploy artifacts, not operator-owned files like:

- `brain.yaml`
- `.env`
- `.env.schema`
- `config/deploy.yml`

## Current proof

Validated from published `@rizom/brain` path with `yeehaa.io`:

- scaffold regenerated from published package
- bootstrap flow succeeded
- `Publish Image` succeeded
- `Deploy` succeeded
- live site and preview both returned `200`

## Remaining work

No blocker remains in the core standalone Kamal path.

Remaining work is follow-on adoption:

- decide when other apps extract to standalone repos
- keep docs aligned with scaffold evolution
- keep generated deploy artifacts current as the scaffold changes

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/standalone-image-publish-contract.md`
- `docs/plans/public-release-cleanup.md`
