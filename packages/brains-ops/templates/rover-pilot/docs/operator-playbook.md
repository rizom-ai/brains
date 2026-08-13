# Operator Playbook

## Deploy contract files

Treat these as checked-in deploy artifacts in the pilot repo:

- `.env.schema`
- `deploy/kamal/deploy.yml`
- `deploy/scripts/`
- `.github/workflows/build.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/directory-sync-stress.yml`
- `.github/workflows/reconcile.yml`

`.env.schema` is the single source of truth for required and sensitive deploy vars.
The deploy scripts and workflows should read from that contract instead of inventing a second list.

The default pilot image tag is `brain-${brainVersion}`:

- build publishes `brain-${brainVersion}` for users without a site override
- a site override gets an isolated `brain-${brainVersion}-sites-${packageHash}` image
- generated `users/<handle>/.env` carries `BRAIN_VERSION=<brainVersion>`
- build and deploy derive the same effective image tag from the resolved registry

## Version bump flow

When `pilot.yaml.brainVersion` changes and you push:

1. build publishes the new default image and any required site images
2. reconcile refreshes generated `users/<handle>/.env`
3. deploy runs for handles whose generated config changed
4. generated file commits happen once in a final aggregation step after the deploy matrix finishes

Every external site and theme package has its own exact version pin. A cohort or
pilot brain-version bump never changes those package versions implicitly; update each
pin deliberately from reviewed package and image evidence.

When a push changes only deploy contract files and no generated `users/<handle>/.env` or `users/<handle>/brain.yaml` files, the deploy workflow exits through its explicit no-op path and prints `No affected user configs; skipping deploy.`

They are scaffolded from `@rizom/ops`, then versioned in this repo like any other deploy contract.

## Canonical contract crossover maintenance window

Do not run this procedure without explicit operator approval. The canonical desired state, canonical `@rizom/ops`, and unified runtime image form one contract and must move or roll back together. Complete `docs/canonical-crossover-record.md` as the approval evidence without adding secret values.

Before the window, record and review:

- the prior pilot commit and exact `@rizom/ops` version;
- every prior runtime image tag and immutable digest;
- the reviewed canonical pilot commit;
- the exact unified `@rizom/brain` and `@rizom/ops` versions;
- every unified image tag and immutable digest;
- canary-first rollout order, followed by the remaining cohorts;
- expected `/health/operate` version, unauthenticated MCP response, site marker, and content repository identity for each posture.

Run `bunx brains-ops reconcile-all <canonical-review-copy> --dry-run` against the isolated review copy. The command blocks external content-repository access, leaves the review copy untouched, lists both passes' changed files, and must report second-pass zero drift. Reconciliation owns generated per-user config; only `render` owns the observational `views/users.md` projection.

During the approved window:

1. Freeze unrelated merges and releases. Wait for active Build, Reconcile, and Deploy runs to finish, then disable all three pilot workflows with `gh workflow disable build.yml`, `gh workflow disable reconcile.yml`, and `gh workflow disable deploy.yml`.
2. Publish and verify the reviewed unified runtime and matching ops artifacts. Do not update pilot desired state until the exact versions are installable and the expected images can be built.
3. Apply the reviewed canonical pilot revision while automation remains disabled. Confirm repository names, server/domain identity, content repositories, secret selectors, image names, and tag identity against the review diff.
4. Enable only Build, run it for the canonical desired-state revision, and record every resulting image digest. Stop if the observed digest set differs from the cutover record.
5. Enable only Reconcile, run it once, and review its generated per-user config commit. It must not rewrite `views/users.md`, and no generated file may combine canonical config with a retired image version.
6. Enable Deploy and deploy one handle at a time in the approved order. After each deploy, run `bunx brains-ops verify-user . <handle>`, render observed fleet status, and complete the manual identity, content-sync, and app-managed site checks.
7. Run Reconcile a second time. Require no reconciler-owned generated diff and no deploy work before re-enabling normal automation and lifting the merge/release freeze. Observed status rendering remains separate from this convergence gate.

If any gate fails, disable all three workflows again. Restore the prior pilot desired-state and dependency revision, reconcile with the prior ops version, and redeploy the prior image tag/digest as one rollback pair. Verify the prior `/health/operate` version and identity/content/site checks before re-enabling automation. Never restore only config or only an image.

## Directory-sync stress gate

Use the manual `Directory Sync Stress` workflow only against a disposable smoke user. It refuses a target unless the handle, domain, and content repository all identify smoke, the confirmation input exactly matches `stress:<handle>`, and the user desired state declares the hermetic posture below. Reconcile and deploy this posture before running the workload:

```yaml
embeddingEnabled: false
topicExtractionEnabled: false
```

Before authorizing a workload, dispatch the workflow once with `verify_only: true`. That mode loads the same Bitwarden/Varlock content credential, clones the smoke content repository, and runs `git push --dry-run` against a temporary stress ref. It creates no ref, performs no content write, does not contact the deployed runtime, and skips cleanup because no probes were created.

Profiles are deterministic and reversible:

- `regression`: 20 probes;
- `load`: ramps to 350 probes, updates all, renames 100, updates again, then deletes all;
- `stress`: ramps to 700 probes and renames 200 before cleanup.

The workflow loads operator credentials through Bitwarden/Varlock, but it is separate from Deploy and cannot deploy an image. It creates a rollback branch before the first content write, gates on health timeouts, watchdog restarts, and external AI usage during the monitored workload window, preserves warmup and cleanup samples as evidence, uploads JSON/Markdown/runtime artifacts, and runs an independent idempotent cleanup job with `if: always()`. Once cleanup confirms that no probes remain, it also prunes retained `ops/directory-sync-stress-backup-*` branches; if probes remain, the branches stay available for recovery.

Treat any gated health failure, restart, OOM, residual probe, or entity-baseline drift as a failed gate. Do not restart the target during measurement. Recovery is a separate operator action after evidence collection.

## Stale deploy lock recovery

Kamal intentionally leaves its remote deploy lock in place when a deployment is cancelled or interrupted. Confirm that no deployment for the user is still active before releasing the lock, then use the deploy workflow's explicit recovery input:

```sh
gh workflow run Deploy --ref main \
  -f handle=<handle> \
  -f release_stale_lock=true
```

Recovery is opt-in and scoped to one handle. Normal push, reconcile, and manual deploy runs never remove a lock automatically.

## Bootstrap flow

For this fleet, operator-local secret material remains the source of truth during onboarding and rotation. The repo stores encrypted per-user secrets, not raw values.

For a new pilot user, the operator bootstrap order is:

1. `bunx brains-ops age-key:bootstrap <repo> --push-to gh`
2. `bunx brains-ops ssh-key:bootstrap <repo> --push-to gh`
3. `bunx brains-ops cert:bootstrap <repo> --push-to gh`
4. `bunx brains-ops secrets:encrypt <repo> <handle>`
5. `bunx brains-ops onboard <repo> <handle>`

`age-key:bootstrap` keeps a repo-local canonical age identity under `.brains-ops/age/identity.txt`, writes the matching public recipient to `pilot.yaml.agePublicKey`, and can push the private key to GitHub as `AGE_SECRET_KEY`.

The shared cert bootstrap writes local cert artifacts under `.brains-ops/certs/shared/`, which stays repo-local and ignored by git.

Preview hosts use the shape `<handle>-preview.rizom.ai`, so one wildcard origin cert for `*.rizom.ai` covers both the primary and preview hosts for every pilot user.

## Upgrading operator behavior

The pilot repository pins `@rizom/ops` in `package.json`. The scheduled and manually dispatched Upgrade workflow owns routine upgrades to that pin. It refreshes the scaffold on a branch and opens a reviewable PR; it does not change runtime desired state or authorize a deployment.

Because scaffold refreshes can update `.github/workflows/*`, the workflow must not push with its Actions `GITHUB_TOKEN`. Configure a dedicated GitHub App:

1. Install it only on this pilot repository.
2. Grant repository permissions `Contents: Read and write`, `Pull requests: Read and write`, and `Workflows: Read and write`; grant nothing else.
3. Store its App ID as the repository Actions variable `OPS_UPGRADE_APP_ID`.
4. Store its private key as the repository Actions secret `OPS_UPGRADE_APP_PRIVATE_KEY`.

The workflow mints a short-lived, repository-scoped installation token and explicitly requests only those three permissions. Its own `GITHUB_TOKEN` remains read-only. If App token creation, branch push, or PR creation fails, stop and repair the CI credential path; never fall back to an operator's personal SSH key or token.

Adopting this credential flow in an existing pilot repository requires one explicitly reviewed bootstrap PR because the old Upgrade workflow cannot update itself. After that merge, routine upgrades run entirely in CI:

1. dispatch Upgrade with an exact version, or let its schedule select `latest`;
2. review the generated package, lockfile, deploy-script, and workflow diff;
3. merge the upgrade PR only after its checks pass;
4. change runtime desired state separately through the approved canary or fleet rollout flow.

## Canonical verification notes

Use the verification script after deploy:

```sh
bunx brains-ops verify-user . <handle>
```

For every bundle posture it checks:

- `https://<handle>.rizom.ai/health/operate` returns `200`;
- unauthenticated `POST https://<handle>.rizom.ai/mcp` returns the expected auth failure;
- background jobs are not repeatedly failing, except for missing optional integrations.

A `core`-only instance is MCP-only; a bare `GET /` may return `401` without indicating a bad deploy. When `site` is selected, verification also checks the browser and CMS/login surfaces.

Manual checks that remain:

- initial app-managed site output is correct for the expected content/theme;
- content repository identity and runtime sync are healthy;
- passkey setup/handoff is completed from the setup email.

## One-user canonical site canary

Run this before adding custom site/theme packages or rolling a larger browser/CMS-first cohort.

1. Create or choose a canary cohort with explicit bundles:

   ```yaml
   bundles:
     - core
     - site
     - publishing
   ```

2. Add exactly one canary user to that cohort.
3. For browser/CMS-first onboarding, configure setup email in `users/<handle>.yaml`:

   ```yaml
   setup:
     delivery: email
     email: user@example.com
   ```

4. Encrypt the user's secrets and commit only the `.age` file.
5. Run `bunx brains-ops onboard . <handle>`.
6. Run `bunx brains-ops verify-user . <handle>` with no custom site/theme overrides.
7. Ask the user to complete passkey setup from the setup email.
8. Continue to visual customization only after the canary is healthy.

Rollback must restore the prior desired-state revision and prior runtime image together. Never pair canonical config with the retired image, or retired config with the canonical image.

## Hosted site and theme package contract

Start with the public [site mockup migration guide](https://github.com/rizom-ai/brains/blob/main/docs/site-mockup-migration.md), then apply these hosted-fleet requirements:

- A site package must default-export `defineSite(...)` and import its authoring API only from `@rizom/site`.
- A theme package must default-export its CSS as a string. Hosted custom themes currently use the `@rizom/*` scope so the fleet image installs them with the site package; `@brains/*` themes are bundled with `@rizom/brain`.
- Site and custom theme packages must be public npm packages that install without registry credentials.
- Site, theme, and brain packages publish independently. Hosted configuration requires exact site and external-theme version pins and never derives one package version from another.
- Keep site structure and theme CSS in separate packages. Do not put private content or secrets in either package.

Configure a user in `users/<handle>.yaml`:

```yaml
siteOverride:
  package: "@rizom/site-example"
  version: <exact-site-version>
  theme: "@rizom/theme-example"
  themeVersion: <exact-theme-version>
```

Missing external package versions fail desired-state validation. A site override
produces an isolated per-instance image; it never changes the fleet's shared default
image. Bundled `@brains/*` themes omit `themeVersion` because they are not installed as
separate packages.

### Custom-package canary and rollback

1. Confirm the exact site/theme versions are public-installable without npm credentials.
2. Apply the exact package names and versions to one healthy canonical site canary.
3. Reconcile the canary, push the generated output, and let build/deploy create its site image.
4. Run `bunx brains-ops verify-user . <handle>`.
5. Manually verify the site, theme, CMS, content sync, and passkey sign-in before adding more users.

To roll back, remove or change `siteOverride`, reconcile, and redeploy that user.
The default image and other users remain untouched.

## Setup email checklist

Use this for browser/CMS-first users who should receive their own first-passkey setup link by email.

1. Add setup delivery to the user file:

   ```yaml
   setup:
     delivery: email
     email: user@example.com
   ```

2. Configure these GitHub Secrets before deploy:
   - `SETUP_EMAIL_API_KEY`
   - `SETUP_EMAIL_FROM`

3. Reconcile/deploy the user or cohort:
   - `bunx brains-ops onboard . <handle>`
   - or `bunx brains-ops reconcile-cohort . <cohort>`

4. Verify the generated `users/<handle>/brain.yaml` contains `auth-service.setupEmail` and `email` interface config.
5. Ask the user to complete passkey setup from the email link, then use:
   - Dashboard: `https://<handle>.rizom.ai/`
   - CMS: `https://<handle>.rizom.ai/cms`

Notes:

- The setup URL is generated and sent by the running brain; operators should not scrape logs or SSH into the instance to retrieve it.
- The auth service owns setup email dedupe. It should not resend for the same persisted setup token after restart, but should retry failed delivery and resend after token rotation.
- `SETUP_EMAIL_FROM` is not marked required because fleets without email setup can omit it, but it is required for users with `setup.delivery: email`.

## AT Protocol smoke/config checklist

Use this when enabling AT Protocol publishing for a single pilot user.

1. Add the public PDS identifier to the user file. Prefer the account DID as
   the identifier — it survives handle changes. Add `accountDid` too when the
   member wants their handle verified against their subdomain
   (`@<handle>.<domainSuffix>`): the brain then serves it at
   `/.well-known/atproto-did` and Bluesky's "I have my own domain" HTTP
   verification passes with no DNS records.

   ```yaml
   atproto:
     identifier: did:plc:example123
     accountDid: did:plc:example123
   ```

   Only for the PDS account designated by the protocol authority's `_lexicon`
   DNS TXT record, also set `lexiconAuthority: true`. Every other fleet user
   must omit it.

2. Put the app password in `users/<handle>.secrets.yaml`:

   ```yaml
   atprotoAppPassword: <app-password>
   ```

3. Encrypt the per-user secret payload:
   - `bunx brains-ops secrets:encrypt . <handle>`
4. Reconcile/deploy the user or cohort:
   - `bunx brains-ops onboard . <handle>`
   - or `bunx brains-ops reconcile-cohort . <cohort>`
5. Verify the generated `users/<handle>/brain.yaml` contains `plugins.atproto.identifier` (plus `accountDid` and `lexiconAuthority` when configured) and `appPassword: ${ATPROTO_APP_PASSWORD}`.

Notes:

- The ATProto identifier and authority flag are public instance config and belong in `users/<handle>.yaml`. Only the DNS-designated authority account may set `lexiconAuthority: true`.
- The ATProto app password is secret and belongs only in the encrypted per-user secret payload.
- For smoke deployments, pin only the smoke cohort/user to the released brain version that contains ATProto support.

## Discord application credential checklist

Use this when enabling Discord for a pilot user.

1. Pick the user handle (for example `smoke`).
2. Open the Discord Developer Portal.
3. Create a **new application** for that user's brain.
4. Add a **Bot** to the application.
5. Copy the bot token, application public key, and application ID.
6. Put those values in `.env` or `.env.local` while onboarding that user:
   - `DISCORD_BOT_TOKEN=...`
   - `DISCORD_PUBLIC_KEY=...`
   - `DISCORD_APPLICATION_ID=...`
7. Keep `discord.enabled: true` in `users/<handle>.yaml` unless you explicitly want to disable the primary pilot interface.
8. Encrypt the current per-user credential payload:
   - `bunx brains-ops secrets:encrypt . <handle>`
9. Reconcile/deploy the user or cohort:
   - `bunx brains-ops onboard . <handle>`
   - or `bunx brains-ops reconcile-cohort . <cohort>`
10. In the Discord Developer Portal, generate an install URL and invite the bot to the right server.
11. Send a test message in Discord and confirm the brain responds.

Notes:

- Use **one Discord application credential set per user/brain**.
- Do not reuse the same Discord application across multiple pilot users.
- Discord is the default pilot interface moving forward.
- The encrypted `users/<handle>.secrets.yaml.age` file is the durable checked-in deploy input; your local env is only the operator staging source.
- Direct MCP client access should use OAuth/passkey-capable clients where possible.
- When explaining the content workflow, describe it first as a normal **git repo** of **markdown/text files**.
- Position **Obsidian** as optional: it is just one possible editor for those same files, not the default requirement.

## Recovery notes

Document known failure modes, recovery steps, and operator notes here.
