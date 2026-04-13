# Backport plan: shared wildcard TLS for rover-pilot fleets

## Status / recommendation

The wildcard TLS change should **definitely** be backported.

This is not a repo-specific customization. It fixes a real template/design issue in rover-pilot:

- shared TLS secrets are global
- preview hosts are currently shaped in a way that a single wildcard cert does not cover
- per-handle cert bootstrap can overwrite the shared secrets with user-specific cert material

So the wildcard TLS / preview-domain fix should be treated as an upstream correctness fix.

Separately, this repo also picked up newer `@rizom/ops` rover-pilot template behavior and one follow-up bugfix in content seeding. Those are worth noting, but they are secondary to the TLS backport.

## Summary

We found a template-level issue in the rover-pilot deploy contract.

Today the template combines:

- preview hosts shaped like `preview.<handle>.<zone>`
- shared GitHub secrets for TLS material:
  - `CERTIFICATE_PEM`
  - `PRIVATE_KEY_PEM`
- a per-handle cert bootstrap command:
  - `brains-ops cert:bootstrap <repo> <handle> --push-to gh`

That combination is inconsistent.

A wildcard cert for `*.rizom.ai` covers:

- `max.rizom.ai`
- `smoke.rizom.ai`

But it does **not** cover:

- `preview.max.rizom.ai`
- `preview.smoke.rizom.ai`

And because the TLS secrets are shared, running per-handle cert bootstrap overwrites the global secrets with a cert that only matches one user domain.

## Decision

Standardize rover-pilot fleets on:

- primary host: `<handle>.<zone>`
- preview host: `<handle>-preview.<zone>`
- one shared Cloudflare Origin CA cert for `*.${zone}`
- one shared secret pair:
  - `CERTIFICATE_PEM`
  - `PRIVATE_KEY_PEM`

This keeps the deploy model simple and makes the TLS story correct for multi-user fleets.

## Why this approach

Benefits:

- one wildcard cert covers both primary and preview hosts for every user
- no per-user TLS secret selection logic in deploy workflows
- no accidental secret overwrite from handle-specific cert bootstrap
- simpler operator docs and bootstrap flow

Alternatives considered:

1. Keep `preview.<handle>.<zone>`
   - would require per-user certs
   - would also require per-user cert secret names and workflow selection logic
   - more complexity for little benefit

2. Keep current shared secrets and current hostnames
   - incorrect; do not do this

## Scope to backport upstream

There are two buckets here.

### Bucket A: definitely backport

Backport the wildcard TLS / preview-domain fix.

This includes:

- preview hostname shape change
- shared wildcard cert bootstrap flow
- workflow wiring for preview domain
- deploy template updates
- docs/checklist updates

### Bucket B: also worth backporting / syncing

This repo also incorporated newer rover-pilot template behavior from `@rizom/ops@0.2.0-alpha.12`, plus two small but important hygiene fixes.

These are not the primary purpose of this doc, but they are upstream-relevant:

- content repo sync/seed support in deploy
- deploy triggers for `users/*/content/**`
- handle resolution that notices content changes
- `sync-content-repo.ts` execution-order bugfix via `main()`
- `.gitignore` updates for local secret files (`.env`, `.env.local`, and preferably `.kamal/secrets` upstream)

### Do **not** backport

- repo-local pilot users like `max`
- cohort membership changes
- generated user config
- local `.brains-ops/` artifacts
- content repos such as `rover-max-content`
- any secrets

## Proposed upstream changes

### 1) Change preview host naming

From:

- `preview.<handle>.<zone>`

To:

- `<handle>-preview.<zone>`

This allows a single wildcard cert like `*.rizom.ai` to cover:

- `<handle>.rizom.ai`
- `<handle>-preview.rizom.ai`

### 2) Add a shared origin cert bootstrap flow

Add a shared bootstrap path that:

- reads `pilot.yaml.domainSuffix`
- derives the zone, e.g. `.rizom.ai` -> `rizom.ai`
- requests a Cloudflare Origin CA cert for `*.rizom.ai`
- stores local artifacts under:
  - `.brains-ops/certs/shared/origin.pem`
  - `.brains-ops/certs/shared/origin.key`
- optionally pushes to GitHub secrets:
  - `CERTIFICATE_PEM`
  - `PRIVATE_KEY_PEM`
- sets Cloudflare SSL mode to `strict`

### 3) Stop recommending per-handle cert bootstrap for rover-pilot

For rover-pilot specifically, docs should no longer recommend:

- `brains-ops cert:bootstrap <repo> <handle> --push-to gh`

That command is fine for a single-domain setup, but not for a shared-secret multi-user fleet template.

### 4) Pass preview domain explicitly through deploy resolution

The deploy workflow should derive and pass both:

- `BRAIN_DOMAIN`
- `PREVIEW_DOMAIN`

Then:

- Kamal proxy hosts use both values
- Cloudflare DNS upserts use both values
- preview DNS should target `<handle>-preview.<zone>`

## Downstream files changed as reference

These are the files changed in the pilot repo to prove out the fix. Use them as a reference when patching the upstream rover-pilot template.

### TLS / preview-domain backport reference

- `.github/workflows/deploy.yml`
- `deploy/kamal/deploy.yml`
- `deploy/Caddyfile`
- `deploy/scripts/resolve-user-config.ts`
- `deploy/scripts/bootstrap-shared-origin-cert.ts` **(new)**
- `docs/operator-playbook.md`
- `docs/onboarding-checklist.md`

### Additional upstream-relevant template sync / bugfix reference

- `package.json` (`@rizom/ops` updated locally to `0.2.0-alpha.12`)
- `bun.lock`
- `.github/workflows/deploy.yml`
- `deploy/scripts/resolve-deploy-handles.ts`
- `deploy/scripts/sync-content-repo.ts` **(new in alpha.12; then locally fixed with a `main()` refactor)**
- `.gitignore` **(local secret-file ignore fix; upstream should include `.env`, `.env.local`, and likely `.kamal/secrets`)**

Note: upstream paths will be the template source equivalents, not the generated repo paths.

## Additional upstream-relevant changes from this repo

These are separate from the wildcard TLS decision, but should be tracked so nothing useful gets lost when backporting/syncing.

### 1) Content repo sync support from newer rover-pilot template

The newer rover-pilot template includes content seeding/sync behavior that this repo now uses.

Relevant pieces:

- workflow trigger for `users/*/content/**`
- `deploy/scripts/sync-content-repo.ts`
- deploy artifact upload including `users/${handle}/content`
- handle resolution that includes `users/<handle>/content/**`
- workflow wiring that provides `GIT_SYNC_TOKEN` before running `brains-ops onboard` in CI

### 2) `sync-content-repo.ts` bugfix

After adopting that newer template behavior, we hit a runtime error:

- `ReferenceError: Cannot access 'STALE_ANCHOR_PROFILE_MARKERS' before initialization`

Cause:

- top-level execution called helper logic before a later `const` had initialized

Correct fix:

- wrap script execution in `main()`
- keep constants/helpers declared before `await main()`

This fix should also be backported upstream if upstream still has the earlier top-level execution shape.

### 3) `.gitignore` hygiene fix

The rover-pilot template/docs assume operators will use local secret files such as:

- `.env`
- `.env.local`

But the generated `.gitignore` did not ignore them.

That should be fixed upstream.

Recommended upstream `.gitignore` additions:

- `.env`
- `.env.local`
- `.kamal/secrets`

Note: in this repo we ignored `.kamal/` broadly for convenience, but upstream should probably prefer the narrower `.kamal/secrets` rule because the template intentionally tracks `.kamal/hooks/pre-deploy`.

### 4) Suggested PR split upstream

Recommended split:

- **PR 1 (must-have):** wildcard TLS + preview-domain fix
- **PR 2 (recommended):** rover-pilot template sync for content seeding + `sync-content-repo.ts` bugfix + `.gitignore` hygiene fix

That keeps the correctness-critical TLS fix easy to review and land quickly.

## Recommended upstream implementation shape

### Template changes

1. `deploy/kamal/deploy.yml`
   - replace `preview.<%= ENV['BRAIN_DOMAIN'] %>` with `<%= ENV['PREVIEW_DOMAIN'] %>`

2. `deploy/scripts/resolve-user-config.ts`
   - parse `brainDomain`
   - derive `previewDomain` as `${handle}-preview.${zone}`
   - emit `preview_domain` in GitHub outputs

3. `.github/workflows/deploy.yml`
   - pass `PREVIEW_DOMAIN` into DNS update step
   - upsert DNS for both main and preview host
   - pass `PREVIEW_DOMAIN` into Kamal deploy step

4. `deploy/Caddyfile`
   - make preview host matcher compatible with `*-preview.*`

### Bootstrap changes

Short-term acceptable:

- add a template script like `deploy/scripts/bootstrap-shared-origin-cert.ts`
- document usage in rover-pilot docs

Better long-term:

- add a first-class CLI command, something like:
  - `brains-ops cert:bootstrap-shared <repo> --push-to gh`
- then update rover-pilot template docs to use that command

## Suggested operator flow after backport

For a new pilot user:

1. `bunx brains-ops ssh-key:bootstrap <repo> --push-to gh`
2. `bunx brains-ops cert:bootstrap-shared <repo> --push-to gh`
   - or template-script equivalent until CLI support exists
3. `bunx brains-ops secrets:push <repo> <handle>`
4. `bunx brains-ops onboard <repo> <handle>`

## Migration plan for existing fleets

1. Update deploy contract/template to use `<handle>-preview.<zone>`.
2. Generate and push a shared wildcard origin cert for `*.${zone}`.
3. Replace existing shared TLS secrets with the wildcard cert:
   - `CERTIFICATE_PEM`
   - `PRIVATE_KEY_PEM`
4. Update Cloudflare preview DNS records from:
   - `preview.<handle>.<zone>`
     to:
   - `<handle>-preview.<zone>`
5. Redeploy affected users.
6. Remove any operator docs that still instruct per-handle cert bootstrap for rover-pilot.

## Acceptance criteria

The backport is complete when all of the following are true:

- rover-pilot template preview hosts use `<handle>-preview.<zone>`
- one shared wildcard cert for `*.${zone}` is sufficient for all generated deployments
- rover-pilot docs no longer instruct per-handle cert bootstrap
- deploy workflow passes and uses `PREVIEW_DOMAIN`
- DNS update logic creates both:
  - `<handle>.<zone>`
  - `<handle>-preview.<zone>`
- no per-user TLS secret naming is required
- operators can onboard multiple users without TLS secret collisions

## Validation checklist

Use a fresh generated rover-pilot repo and verify:

1. bootstrap shared cert
2. onboard two users
3. confirm generated deploy config contains:
   - main host `<handle>.<zone>`
   - preview host `<handle>-preview.<zone>`
4. confirm Cloudflare DNS records exist for both hosts
5. confirm origin TLS succeeds for both hosts
6. confirm no later user bootstrap breaks earlier users' TLS

## Open question

Should this land as:

- a rover-pilot template-only helper script first, then a CLI command later
- or a first-class `brains-ops` command immediately

Recommendation:

- land template fix + helper script first
- follow up with a polished shared-cert CLI command

## Copy/paste PR description

Backport rover-pilot TLS fix for multi-user fleets.

This changes preview domains from `preview.<handle>.<zone>` to `<handle>-preview.<zone>` so a single wildcard origin cert for `*.${zone}` covers both main and preview hosts. It also replaces the rover-pilot docs/bootstrap flow that recommended handle-specific cert bootstrap even though the template uses shared `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM` secrets.

This wildcard TLS change should definitely be backported because it fixes a real multi-user fleet correctness issue rather than a repo-specific preference.

Result:

- correct shared-cert model
- no secret overwrite collisions across users
- simpler operator bootstrap flow
- cleaner deploy contract for rover-pilot fleets
