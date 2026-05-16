# Rover default batch onboarding

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running `rover:default` instead of `rover:core`, while keeping the rollout safe, customizable, reversible, and clear for operators and users.

## Context

The first pilot batch used the core-oriented flow. `rover:default` adds the website and publishing surface, including site-building, browser/CMS expectations, and more background AI work. The existing ops tooling can already resolve cohort-level `presetOverride: default`, but the onboarding flow should be tightened before adding a larger batch.

The second batch is expected to need per-user visual customization. Users do not edit generated `brain.yaml`; operators capture customization in desired-state user/cohort files, then `brains-ops` renders the effective `brain.yaml`.

For now, custom site and theme packages may be required to be public npm packages. Private package registry/auth support is explicitly out of scope for this batch.

## Phase 1 — Must-have before onboarding

### 1. Public npm package site/theme overrides

Add optional user-level and cohort-level site override fields:

```yaml
# users/<handle>.yaml
site:
  package: "@scope/rover-site"
  theme: "@scope/rover-theme"
```

```yaml
# cohorts/default-batch-2.yaml
presetOverride: default
site:
  package: "@scope/default-site"
  theme: "@scope/default-theme"
```

Behavior:

- user `site` overrides win over cohort `site` overrides
- cohort `site` overrides win over the Rover model defaults
- `site.package` and `site.theme` are rendered into generated `users/<handle>/brain.yaml`
- refs must be npm package refs that can be installed by the deploy build without private registry credentials
- if a package ref changes while the brain version stays the same, the fleet image must still rebuild and redeploy affected users

Update `packages/brains-ops`:

- `src/schema.ts`
- `src/load-registry.ts`
- `src/default-user-runner.ts`
- `src/render-users-table.ts` if we want site/theme columns or a compact customization indicator
- registry/reconcile/render tests
- operator and user docs

Update deploy support outside `packages/brains-ops`:

- `shared/deploy-support` Dockerfile rendering so fleet images can install the selected public npm site/theme packages in addition to `@rizom/brain@$BRAIN_VERSION`
- `packages/brains-ops` generated env/deploy metadata so image identity includes the effective package set, not just `brainVersion`
- GitHub build workflow/template so changes to user/cohort site/theme refs trigger a build and affected deploys

Suggested image identity:

```text
brain-${brainVersion}-pkg-${packageSetHash}
```

The package-set hash should be derived from the unique package refs used by the deployed users/cohort. A simpler first step is acceptable if it reliably rebuilds whenever refs change.

Out of scope for this batch:

- private npm packages
- per-user registry credentials
- arbitrary user editing of generated `brain.yaml`

### 2. Per-user custom domain support

Add optional user-level domain fields:

```yaml
# users/<handle>.yaml
domainOverride: custom.example.com
previewDomainOverride: custom-preview.example.com # optional
```

Update:

- `packages/brains-ops/src/schema.ts`
- `packages/brains-ops/src/load-registry.ts`
- `packages/brains-ops/src/default-user-runner.ts`
- `packages/brains-ops/templates/rover-pilot/deploy/scripts/resolve-user-config.ts`
- registry, reconcile, and deploy config tests
- operator docs and checklist

Behavior:

- default remains `<handle><domainSuffix>`
- `domainOverride` replaces the primary domain for that user
- `previewDomainOverride` replaces deploy's derived preview domain when provided
- if the custom domain is outside the configured Cloudflare zone/cert coverage, docs should flag that manual DNS/cert work may be required

### 3. Add `user:add --no-discord`

Add CLI support:

```sh
bunx brains-ops user:add . alice --cohort batch-2 --no-discord
```

Update:

- `packages/brains-ops/src/run-command.ts`
- `packages/brains-ops/src/user-add.ts`
- CLI/user-add tests
- onboarding docs

Behavior:

- keep Discord enabled by default for backward compatibility
- `--no-discord` writes:

```yaml
discord:
  enabled: false
```

### 4. Default-preset verification checklist

Update the operator checklist for `rover:default` deployments:

- `GET /health` returns `200`
- `GET /` loads the browser/site surface with the selected site/theme package
- `GET /cms` loads the CMS/login surface
- unauthenticated `POST /mcp` returns the expected auth failure
- initial site build completes
- content repo exists and syncs
- passkey setup/handoff is completed
- background jobs are not repeatedly failing, except for expected missing optional integrations

## Phase 2 — Safer rollout flow

### 5. Document a one-user canary procedure

Recommended flow:

```text
create batch-2 cohort with presetOverride: default
choose public npm site/theme package refs
add one canary user
encrypt secrets
onboard canary
verify web/CMS/site/theme/sync/auth
then add remaining users
```

Include rollback notes:

- remove the user from the default cohort, or set the cohort back to `core`
- remove or change site/theme overrides if the package fails
- reconcile generated outputs
- rebuild/redeploy the affected user image/config

### 6. Clarify passkey handoff

Document two handoff modes:

- **operator-first:** operator registers the first passkey, verifies the instance, then helps the user add their own access
- **user-first:** operator retrieves the setup URL and sends it securely to the user

Also document setup URL expiry and one-shot behavior.

## Phase 3 — Nice-to-have tooling

### 7. Add `brains-ops preflight`

Potential command:

```sh
bunx brains-ops preflight . --cohort batch-2
```

Checks:

- registry loads
- cohort exists
- users resolve to expected preset/version/domain/site/theme
- site/theme package refs are public-installable or at least syntactically valid package refs
- encrypted secrets exist
- generated config is present, or shows what would be generated
- custom domain and preview domain assumptions are visible
- warns if Discord is enabled without obvious bot-token staging
- warns if default-preset users are missing browser/passkey handoff notes

### 8. Better package authoring docs/templates

Document minimal package contracts:

- theme package exports a CSS string as default export
- site package exports a valid `SitePackage`
- packages must be compatible with the pinned `@rizom/brain` public API
- packages must be public npm packages for this batch

Optionally add starter templates for:

- `rover-theme-*`
- `rover-site-*`

## Suggested implementation order

1. Public npm site/theme package overrides and deploy image installation
2. Custom domains
3. `--no-discord`
4. Docs/checklist/canary/passkey updates
5. Run tests/build
6. Onboard one `rover:default` canary with a custom public npm theme
7. Add `preflight` after batch 2 if still useful
