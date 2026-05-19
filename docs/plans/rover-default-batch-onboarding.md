# Rover default batch onboarding

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running `rover:default`, with safe per-user customization, predictable builds, and clear operator rollback.

## Active scope

The next batch needs user-specific presentation without letting users edit generated deploy artifacts directly.

Operators should express desired state in `users/<handle>.yaml`; `brains-ops` should render the effective `users/<handle>/brain.yaml` and deploy metadata.

For this batch:

- custom site/theme packages must be public npm packages
- private npm registry/auth support is out of scope
- arbitrary user edits to generated `brain.yaml` are out of scope
- cohort-level site/theme inheritance is out of scope

## Phase 1 — Per-user visual customization

### 1. Public npm package site/theme overrides

Add optional user-level site override fields with exact package refs:

```yaml
# users/<handle>.yaml
site:
  package: "@scope/rover-site@1.2.3"
  theme: "@scope/rover-theme@0.4.0"
```

Behavior:

- site/theme choices are per-user identity and branding choices, not cohort rollout controls
- cohorts must not define site/theme overrides
- no user/cohort merge behavior is needed for site/theme
- `site.package` and `site.theme` are rendered into generated `users/<handle>/brain.yaml` when present
- refs must be exact public npm package refs that can be installed without private registry credentials
- no `latest`, semver ranges, `^`, `~`, or `*`; prerelease versions are allowed when exact
- package upgrades and rollbacks must be explicit user YAML changes
- if a package ref changes while the brain version stays the same, the fleet image must still rebuild and redeploy affected users

Update `packages/brains-ops`:

- `src/schema.ts`
- `src/load-registry.ts`
- `src/default-user-runner.ts`
- `src/render-users-table.ts` if we want site/theme columns or a compact customization indicator
- registry/reconcile/render tests
- operator docs

Update deploy support:

- fleet Dockerfile/build path must install selected public npm site/theme packages in addition to `@rizom/brain@$BRAIN_VERSION`
- generated deploy metadata must include the effective package set, not just `brainVersion`
- package-set metadata should be derived from registry/generated config, not stored in `.env`
- GitHub build/deploy workflows must rebuild/redeploy when user site/theme refs change

Suggested image identity:

```text
brain-${brainVersion}-pkg-${packageSetHash}
```

The package-set hash should be derived from the unique exact package refs used by the deployed users. A simpler first step is acceptable only if it reliably rebuilds whenever refs change.

### Runtime vs install-time contract

The app already dynamically imports package refs from `brain.yaml` at runtime through `registerOverridePackages()`, but those imports only work if the packages are already available in `node_modules`. The current fleet image only installs `@rizom/brain@$BRAIN_VERSION`, so custom site/theme packages still need an install step before runtime.

For this batch:

- user YAML should store exact install refs, including versions
- generated `brain.yaml` should remain the canonical runtime declaration
- `.env` should not store package refs, package hashes, or image identity
- if runtime import needs a bare import specifier, derive it from the exact install ref rather than asking operators to enter two values
- a generated checked-in manifest under `views/` is acceptable for derived build metadata, for example package set hash and image tag

Target architecture later:

- keep the same `brain.yaml` contract
- move package installation/resolution into the app runtime with a persistent package cache and integrity checks
- stop rebuilding the shared image just to change site/theme refs
- migrate by changing the resolver/install implementation, not user config

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

Rollback:

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

1. Registry/schema/render support for per-user public npm site/theme refs
2. Deploy image installation and image identity for effective package sets
3. Package authoring docs/templates
4. One-user custom-theme canary
5. Per-user custom domains
6. `preflight`, if still useful after the batch workflow is clearer
