# Rover default batch onboarding

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running `rover:default` instead of `rover:core`, while keeping the rollout safe, customizable, reversible, and clear for operators and users.

## Context

The first pilot batch used the core-oriented flow. `rover:default` adds the website and publishing surface, including site-building, browser/CMS expectations, and more background AI work. The existing ops tooling can already resolve cohort-level `presetOverride: default`, but the onboarding flow should be tightened before adding a larger batch.

The second batch is expected to need per-user visual customization. Users do not edit generated `brain.yaml`; operators capture customization in desired-state user files, then `brains-ops` renders the effective `brain.yaml`.

For now, custom site and theme packages may be required to be public npm packages. Private package registry/auth support is explicitly out of scope for this batch.

## Phase 1 — Per-user visual customization

### 1. Public npm package site/theme overrides

Add optional user-level site override fields:

```yaml
# users/<handle>.yaml
site:
  package: "@scope/rover-site"
  theme: "@scope/rover-theme"
```

Behavior:

- site/theme choices are per-user identity and branding choices, not batch/cohort rollout controls
- cohorts must not define site/theme overrides
- no user/cohort merge behavior is needed for site/theme
- `site.package` and `site.theme` are rendered into generated `users/<handle>/brain.yaml` when present
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
- GitHub build workflow/template so changes to user site/theme refs trigger a build and affected deploys

Suggested image identity:

```text
brain-${brainVersion}-pkg-${packageSetHash}
```

The package-set hash should be derived from the unique package refs used by the deployed users. A simpler first step is acceptable if it reliably rebuilds whenever refs change.

Out of scope for this batch:

- private npm packages
- per-user registry credentials
- arbitrary user editing of generated `brain.yaml`

### 2. Package authoring docs/templates

Document minimal package contracts before asking users/operators to supply packages:

- theme package exports a CSS string as default export
- site package exports a valid `SitePackage`
- packages must be compatible with the pinned `@rizom/brain` public API
- packages must be public npm packages for this batch

Optionally add starter templates for:

- `rover-theme-*`
- `rover-site-*`

### 3. Custom-theme canary procedure

After site/theme refs and package docs exist, extend the canary flow:

```text
choose public npm site/theme package refs
apply them to one canary user
reconcile generated outputs
build/redeploy
verify web/CMS/site/theme/sync/auth
then add remaining users
```

Include rollback notes:

- remove or change site/theme overrides if the package fails
- reconcile generated outputs
- rebuild/redeploy the affected user image/config

## Phase 2 — Domain customization

### 4. Per-user custom domain support

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

## Phase 3 — Nice-to-have tooling

### 5. Add `brains-ops preflight`

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

## Suggested implementation order

1. Public npm site/theme overrides and deploy image installation
2. Package authoring docs/templates
3. One-user custom-theme canary
4. Per-user custom domains
5. `preflight`, if still useful after the batch workflow is clearer
