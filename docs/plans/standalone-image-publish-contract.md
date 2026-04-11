# Plan: Standalone Image Publish Contract

## Context

`apps/rizom-ai` now has a working publish-then-deploy pipeline, but that pipeline is still shaped around the monorepo:

- monorepo publishes shared model images like `ghcr.io/rizom-ai/ranger`
- deploy consumes immutable commit-SHA tags from that shared model namespace
- `brain init --deploy` still scaffolds an older, partially hardcoded image contract (`rizom-ai/<model>`, `VERSION: latest`)

That is the wrong long-term contract for standalone repos.

A standalone repo is not just a consumer of `@rizom/brain`. It also owns:

- its own `brain.yaml`
- its own deploy config
- its own content and local site/theme sources
- its own Git history and rollout cadence

So the deployable image for a standalone repo should belong to that repo, not to the shared monorepo model-image namespace.

## Goal

Define the permanent image publication and deploy contract for repos scaffolded by `brain init --deploy`.

## Non-goals

- Replacing the monorepo's shared model-image pipeline for `rizom-ai`, `rizom-foundation`, or other in-tree apps
- Switching deploys to package-version tags as the primary artifact identity
- Solving cross-registry publishing beyond GHCR in this slice

## Decision

Standalone repos publish **their own image**.

### Repository identity

For a standalone repo:

- image repository: `ghcr.io/<github.repository_owner>/<github.event.repository.name>`

Example:

- repo: `yeehaa123/my-brain`
- image: `ghcr.io/yeehaa123/my-brain`

This is an **instance/repo-based** image contract, not a shared **model-based** contract.

## Tagging contract

### Published tags

Each publish should produce:

- `latest`
- the exact full commit SHA
- optional version tag(s) when the repo has a meaningful release version

### Deploy tag

Deploys use the **full commit SHA**.

Rationale:

- SHA is exact artifact identity
- reruns are deterministic
- multiple different deployable commits can exist under the same package version
- standalone repo images include repo state beyond the npm package version

Version tags are allowed as convenience tags, but not as the primary deploy contract.

## Workflow contract

### Publish workflow

`brain init --deploy` should scaffold a companion workflow named `Publish Image`.

That workflow should:

1. trigger on pushes to `main` and manual reruns
2. build the repo's deploy image
3. publish to `ghcr.io/<owner>/<repo>`
4. tag `latest` and `${{ github.sha }}`
5. add Kamal's required image label:
   - `service=brain`

### Deploy workflow

The scaffolded deploy workflow should:

1. trigger from successful completion of `Publish Image`
2. still support `workflow_dispatch`
3. check out the exact commit that the publish workflow built
4. deploy with:
   - `VERSION: ${{ github.event.workflow_run.head_sha || github.sha }}`
5. never use `VERSION: latest` as the intended contract

This preserves the same publish-then-deploy ordering that now works for `rizom-ai`, but makes it self-contained for standalone repos.

## `config/deploy.yml` contract

The deploy config should stop hardcoding the monorepo namespace.

Instead of:

- `image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>`
- `registry.username: rizom-ai`

the standalone scaffold should use env-derived identity, e.g.:

- `image: <%= ENV['IMAGE_REPOSITORY'] %>`
- `registry.server: ghcr.io`
- `registry.username: <%= ENV['REGISTRY_USERNAME'] %>`

Those values are workflow-owned deploy inputs, not values committed into `.env.example` / `.env.schema` for operators to hand-maintain.

## Build contract

A standalone repo needs a self-contained way to build its image.

`brain init --deploy` should scaffold the minimal image-build assets the publish workflow needs, instead of depending on monorepo-only files.

That means the scaffold should include repo-local copies of the runtime container assets, at minimum:

- `deploy/Dockerfile`
- `deploy/Caddyfile`
- any other static runtime files the publish workflow needs

The publish workflow must not assume access to monorepo-only paths like:

- `deploy/docker/Dockerfile.model`
- `deploy/docker/package.prod.json`
- `shell/app/scripts/build-model.ts`

## Monorepo vs standalone split

### Monorepo apps

Keep the existing shared model-image contract:

- `ghcr.io/rizom-ai/rover`
- `ghcr.io/rizom-ai/ranger`
- `ghcr.io/rizom-ai/relay`

That contract is still correct for in-tree apps because multiple instances can share the same model image.

### Standalone repos

Use the repo-owned image contract:

- `ghcr.io/<owner>/<repo>`

This keeps standalone repos independent from the monorepo's release cadence and image namespace.

## Backport target in `brain init`

The `brain init --deploy` scaffold should change in one slice:

1. add a companion `publish-image.yml`
2. make `deploy.yml` trigger from `Publish Image`
3. deploy immutable SHA tags
4. stop scaffolding `rizom-ai/<model>` assumptions
5. scaffold the repo-local Docker assets required by publish

### Current state vs target

All five items above are still outstanding. The scaffold in `packages/brain-cli/src/commands/init.ts` has not been updated yet:

| Item                      | File / location              | Current (wrong)                             | Target                                                                         |
| ------------------------- | ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. `writePublishWorkflow` | `init.ts` — missing entirely | no publish workflow scaffolded              | new `writePublishWorkflow()` that writes `.github/workflows/publish-image.yml` |
| 2. deploy trigger         | `init.ts:324-327`            | `on: push: branches: ["main"]`              | `on: workflow_run: workflows: ["Publish Image"]` + `workflow_dispatch`         |
| 3. deploy VERSION         | `init.ts:636`                | `VERSION: latest`                           | `VERSION: ${{ github.event.workflow_run.head_sha \|\| github.sha }}`           |
| 4a. deploy.yml image      | `init.ts:195`                | `image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>` | `image: <%= ENV['IMAGE_REPOSITORY'] %>`                                        |
| 4b. deploy.yml registry   | `init.ts:215`                | `username: rizom-ai`                        | `username: <%= ENV['REGISTRY_USERNAME'] %>`                                    |

These must land together — a half-migrated scaffold (e.g. publish workflow exists but deploy still uses `VERSION: latest`) would be broken.

## Regression coverage

Add scaffold-level tests first in `packages/brain-cli/test/init.test.ts`:

- `config/deploy.yml` uses generic image identity placeholders, not `rizom-ai/<model>`
- `brain init --deploy` writes `.github/workflows/publish-image.yml`
- `brain init --deploy` writes local deploy image assets
- publish workflow pushes to `ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}`
- publish workflow tags both `latest` and `${{ github.sha }}`
- publish workflow adds `service=brain`
- deploy workflow triggers from `Publish Image`
- deploy workflow deploys `${{ github.event.workflow_run.head_sha || github.sha }}`
- deploy workflow does not use `VERSION: latest`

### Current test coverage

`init.test.ts:497-510` already covers the publish workflow shape (items 2-6 above). The following assertions are still missing and need to be added:

- `config/deploy.yml` uses generic image identity, not `rizom-ai/<model>` (item 1)
- deploy workflow triggers from `Publish Image` (item 7)
- deploy workflow uses SHA-based `VERSION`, not `latest` (items 8-9)

## Verification

A fresh standalone repo should be able to:

1. run the scaffolded publish workflow successfully
2. see an image at `ghcr.io/<owner>/<repo>:<sha>`
3. run the scaffolded deploy workflow after publish completes
4. deploy that exact immutable image tag via Kamal

## Published-path blocker found during real-user test

Testing the new scaffold against `~/Documents/mylittlephoney` as a real local package install surfaced one more published-path bug:

- installing the locally packed `@rizom/brain` tarball worked
- running `bunx brain init . --deploy --model rover` then failed with:
  - `Cannot find module '@brains/rover/package.json'`

Root cause:

- `packages/brain-cli/src/lib/env-schema.ts` still resolves built-in model schemas from monorepo workspace packages (`@brains/<model>/package.json`)
- that works in source/monorepo mode, but not from the published/tarball install

Required fix:

- bundle the built-in model env schemas (`rover`, `ranger`, `relay`) into `@rizom/brain`
- make `.env.schema` generation prefer those bundled schemas in published mode instead of depending on workspace resolution

This fix is required before the standalone publish/deploy scaffold can be considered end-to-end verified for real users.

## Reconciliation follow-up for existing repos

A fresh repo now gets the new deploy scaffold, but older standalone repos still keep stale generated files because `brain init` intentionally avoids overwriting existing files.

That is correct for clearly user-owned files, but too conservative for known generated deploy artifacts.

Follow-up contract:

- `brain init --deploy` should overwrite a file only when its current contents match a known older generated scaffold variant
- custom-edited files must still be preserved

Initial reconciliation targets:

- `.env.example`
- `config/deploy.yml`
- `.github/workflows/deploy.yml`

Missing deploy files such as `.github/workflows/publish-image.yml`, `deploy/Dockerfile`, and `deploy/Caddyfile` should continue to be created when absent.

## Live workflow bug found during first standalone GitHub deploy

The first real GitHub deploy attempt for `rizom-ai/mylittlephoney` surfaced one more standalone-specific workflow bug:

- `Publish Image` succeeded
- chained `Deploy` failed in `Load env via varlock`
- GitHub rejected the generated `$GITHUB_ENV` payload with:
  - `Unable to process file command 'env' successfully`
  - `Invalid format '***'`

Root cause:

- the standalone scaffold still tried to forward multiline secrets from `/tmp/varlock-env.json` into `$GITHUB_ENV`
- that is too fragile for secrets like:
  - `KAMAL_SSH_PRIVATE_KEY`
  - `CERTIFICATE_PEM`
  - `PRIVATE_KEY_PEM`

Required fix:

- only write single-line values into `$GITHUB_ENV`
- keep multiline secrets in `/tmp/varlock-env.json`
- make later steps such as `Write Kamal SSH key` read multiline values directly from that JSON file

This fix must land in the scaffold before the standalone deploy workflow can be considered production-ready.

A second live workflow issue surfaced immediately after that fix:

- the standalone deploy got past varlock loading and SSH key setup
- `Provision server` then failed with `Missing HCLOUD_TOKEN`

Follow-up fix:

- steps that call external providers should receive their required secrets directly via step `env:`
- specifically:
  - `Provision server` should get `HCLOUD_TOKEN`, `HCLOUD_SSH_KEY_NAME`, `HCLOUD_SERVER_TYPE`, `HCLOUD_LOCATION` directly
  - `Update Cloudflare DNS` should get `CF_API_TOKEN` and `CF_ZONE_ID` directly

That keeps `$GITHUB_ENV` focused on derived runtime values like `INSTANCE_NAME`, `BRAIN_DOMAIN`, and `SERVER_IP`, instead of treating it as the transport for every secret.

A third live issue then became clear: the remaining SSH failure was no longer workflow transport, but the reproducibility of how multiline secrets are sourced locally before `brain secrets:push` sends them to GitHub.

Permanent fix:

- `brain secrets:push` should read both `.env` and `.env.local`
- it should support file-backed secret inputs via `<SECRET>_FILE`
- for multiline secrets like `KAMAL_SSH_PRIVATE_KEY`, the stable operator contract should be:
  - `KAMAL_SSH_PRIVATE_KEY_FILE=/path/to/private/key`
  - `brain secrets:push --push-to gh`

That avoids shell-heredoc parsing differences and pushes the exact file contents to GitHub Secrets.

## Related

- `docs/plans/rizom-ai-first-deploy.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/npm-packages.md`
