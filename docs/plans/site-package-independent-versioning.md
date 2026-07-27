# Plan: Independent site and theme package versioning

## Status

Implementation in progress. Phase 0's release-group split, pre-publish
manifest preparation, compatibility metadata, and registry verifier are
implemented. Its exit gate remains open until freshly published site and theme
versions pass the verifier against the npm registry; package resolution must
not ship before that gate closes.

This plan gives deployable site and theme packages genuinely independent npm
versions and decouples their deployment pins from `brainVersion`. The monorepo
is only their current publishing location. Resolution and deployment depend on
standard published npm metadata, so packages can later move to independent
repositories without changing the pilot contract.

## Problem

Site and theme packages are separately published npm packages, but two forms of
lockstep still exist.

### Release lockstep

`.changeset/config.json` currently fixes every `@brains/*` and `@rizom/*`
package into one version group. Any release therefore gives unchanged site and
theme packages a new version alongside `@rizom/brain`.

### Deployment lockstep

The rover pilot also derives package versions from the brain version:

- `packages/brains-ops/src/load-registry.ts` resolves an omitted
  `siteOverride.version` as `brainVersion`.
- `packages/brains-ops/src/images.ts` installs the theme at the site version;
  the theme has no independent version field.

Consequences:

- A site-only fix cannot move independently through the canary and production
  deployment flow.
- A site and theme cannot carry different versions.
- A package moved to its own release line can be resolved at a nonexistent
  brain version.
- A floating canary cannot safely resolve in the current parallel Build and
  Reconcile workflows: the two jobs could observe different npm states.

The exact-version parser is not a blocker. It already accepts stable and
prerelease semver strings.

## Goals

1. Deployable site and theme packages receive npm versions only when they or
   their relevant dependencies change.
2. `brainVersion` remains an explicit exact pin and is never a source for site
   or theme versions.
3. Site and theme packages resolve independently against their published brain
   compatibility ranges.
4. Every build and deploy consumes committed exact package resolutions.
5. The Smoke canary may follow newest-compatible packages without making
   production float.
6. Nothing in resolution assumes a package lives in this monorepo or under the
   `@rizom` npm scope.

## Settled decisions

### True independent releases

Deployable public `@rizom/site*` and `@rizom/theme*` packages leave the broad
Changesets fixed group. Unchanged packages are not republished for unrelated
brain releases. Internal runtime packages may remain fixed; the exact fixed
inventory is reviewed explicitly in Phase 0 rather than replaced with another
broad glob.

Internal package dependency updates still propagate normally. For example, a
theme that pins `@rizom/theme-default` receives a release when that dependency
changes.

### Standard npm compatibility metadata

A deployable site or external theme declares brain compatibility in:

```json
{
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0"
  }
}
```

This is the only compatibility signal consumed by brains-ops. External
repositories publish ordinary `peerDependencies`; they do not need Rizom's
monorepo build tooling.

Monorepo packages may retain an authoring-only manifest field if required to
avoid workspace cycles, but the npm registry packument must contain the
standard `peerDependencies` field. Resolver behavior never recognizes
`publishPeerDependencies`.

### Semver behavior

- Versions and compatibility ranges use the `semver` package.
- Prerelease brains are evaluated with `includePrerelease: true`.
- Resolution chooses the highest non-deprecated, valid semver version whose
  `@rizom/brain` peer range includes the configured brain version.
- Missing or malformed compatibility metadata is incompatible, with a
  descriptive error.
- Exact pins are also compatibility-checked during reconciliation and explicit
  updates.

### Desired policy and resolved lock are separate

`users/<handle>.yaml` expresses operator intent:

```yaml
siteOverride:
  package: "@scope/my-site"
  version: 1.4.2 # exact | latest | absent
  theme: "@scope/my-theme"
  themeVersion: 3.1.0 # exact | latest | absent
```

Per package:

- exact version: retain that version and validate compatibility;
- `latest`: resolve newest-compatible on every reconcile;
- absent: resolve newest-compatible once, then write the exact pin back to the
  desired user config.

A generated, committed lock records what Build and Deploy must use, including
for `latest`:

```yaml
schemaVersion: 1
brainVersion: 0.2.0-alpha.230
site:
  package: "@scope/my-site"
  version: 1.4.2
  brainRange: ">=0.2.0-alpha.217 <0.3.0"
theme:
  package: "@scope/my-theme"
  version: 3.1.0
  brainRange: ">=0.2.0-alpha.217 <0.3.0"
```

The lock contains no timestamp or other nondeterministic field. A second
reconcile with the same registry state is a no-op.

The source sentinel and exact lock solve the canary race: `latest` remains
visible intent, while image tags and deploys always use one committed snapshot.

### External versus bundled themes

`@brains/*` themes are bundled runtime choices and do not resolve from npm.
They reject `themeVersion`. Any valid npm package outside the bundled namespace
may be an external theme and receives an independently resolved version. The
current `@rizom/*`-only installation check is removed.

### Network boundary

Npm access belongs to reconciliation and explicit update operations, not every
local registry read.

- The npm client fetches one packument per package per run, with an injectable
  fetch implementation, timeout, bounded retries, and in-run cache.
- Reconcile resolves and validates before writing any files, preventing partial
  pin updates.
- Build, deploy, render, and verification read committed exact locks and do not
  re-resolve npm state.
- A missing or stale lock fails with an instruction to reconcile; it never
  silently falls back to `brainVersion`.

## Migration safety

Changing the meaning of an omitted version without migration would silently
upgrade production. Historical npm versions also cannot have their registry
metadata repaired in place.

Rollout therefore follows this order:

1. Publish new metadata-correct site and theme versions.
2. Verify those exact versions against every currently deployed brain version.
3. Add schema support for `themeVersion` while retaining the old runtime
   behavior for one migration release.
4. Pin existing production site and theme selections explicitly to
   metadata-correct versions.
5. Only then remove the `brainVersion` and site-to-theme fallbacks.

No production config reaches the new resolver with an ambiguous omission.
Smoke moves to `latest` only after the lock-backed path is deployed.

## Phases

Each phase is independently releasable and carries targeted tests.

### Phase 0 — Independent publishing and registry metadata

#### 0A. Split release groups

1. Inventory public deployable site/theme packages and their supporting public
   dependencies.
2. Remove deployable `@rizom/site*` and `@rizom/theme*` packages from the broad
   Changesets fixed group.
3. Keep only the reviewed runtime packages fixed; avoid a replacement wildcard
   that accidentally recaptures ecosystem packages.
4. Prove with Changesets fixture tests that:
   - a brain-only changeset does not bump unchanged site/theme packages;
   - a site-only changeset does not bump `@rizom/brain`;
   - an internal site/theme dependency change bumps affected dependants.

#### 0B. Publish real peer metadata

The current `prepack` transform is too late for registry metadata. Verified on
`@rizom/site-smoke-canary@0.2.0-alpha.230`:

- the registry packument has no `peerDependencies` and retains
  `publishPeerDependencies`;
- the downloaded tarball has the correctly transformed `peerDependencies`.

Therefore a tarball-only test already passes and is not the gate.

1. Prepare publish manifests before `changeset publish` reads and publishes
   them, while preserving normal `prepublishOnly` builds.
2. Make lifecycle preparation idempotent so a root prepare step and package
   `prepack` cannot overwrite the original manifest backup.
3. Restore source manifests in a `finally`/shell trap on success or failure.
4. Add required brain ranges to every deployable top-level site and external
   theme package; composite packages must not rely on a transitive package's
   peer metadata.
5. Add a post-publish registry smoke check with npm propagation retries. It
   verifies both:
   - npm packument: standard `peerDependencies`, no
     `publishPeerDependencies`;
   - tarball manifest: the same compatibility range and no authoring-only
     fields.

Exit gate: a freshly published independent site and theme version expose valid
brain ranges through `npm view <pkg>@<version> peerDependencies`.

### Phase 1 — Compatibility-preserving schema and production migration

1. Add the `latest`-or-exact version intent schema and independent
   `themeVersion` field.
2. For this migration release only, preserve existing image behavior when
   `themeVersion` is absent.
3. Publish metadata-correct package versions from Phase 0.
4. Update rover-pilot production site users to explicit site and theme versions
   verified against their pinned brains.
5. Confirm the migration produces only intended per-site images and deploys.

Exit gate: every existing production npm site/theme selection is explicit and
points at metadata-correct versions. No production omission depends on legacy
fallback semantics.

### Phase 2 — Resolver and committed lock, site walking skeleton

1. Implement an injectable npm packument client and pure
   `resolveCompatibleVersion` function.
2. Resolve and validate the site package during reconcile.
3. Write `users/<handle>/site-packages.lock.yaml` atomically.
4. For an absent site version, write the resolved exact version into
   `users/<handle>.yaml` using a comment-preserving YAML document update.
5. Make Build and Deploy consume the exact site lock; remove the site
   `?? brainVersion` fallback.
6. Align workflow ordering/triggers so reconciliation materializes the lock
   before an image is selected. Build and Deploy must never resolve npm
   independently.

Tests cover highest-compatible selection, prerelease ranges, deprecated and
malformed versions, missing metadata, no-compatible-version errors, first-run
pinning, second-run no-op, comment preservation, stale locks, and Build/Deploy
agreement.

Exit gate: an unpinned site resolves once and pins; an exact compatible site is
reproducible offline from committed state; incompatible input fails before an
image build.

### Phase 3 — Independent theme resolution

1. Resolve external themes through the same client and lock contract.
2. Install the theme at `themeVersion`, independent of the site version.
3. Generalize external theme installation beyond the `@rizom` scope while
   keeping bundled `@brains/*` themes versionless.
4. Remove the migration-only site-version fallback for themes.

Tests cover different site/theme versions, external third-party scopes,
bundled themes, independent pinning, and compatibility failures naming the
correct package.

Exit gate: site and theme versions can differ, and both exact resolutions drive
one deterministic image tag.

### Phase 4 — Floating canary and update command

1. Implement `brains-ops site:update <repo> <handle>` to resolve
   newest-compatible site and theme versions, update exact production pins,
   and refresh the lock.
2. Support `--dry-run` with the old/new versions and compatibility ranges.
3. Set Smoke to `version: latest` and `themeVersion: latest`.
4. Keep production exact. Promote versions only after the Smoke package canary
   passes.
5. Document the resolve, canary, promote, and rollback flow in the rover-pilot
   operator guide.

Tests prove that `latest` updates the lock without replacing the sentinel,
`site:update` advances exact pins, unchanged resolution is a no-op, and
rollback commits restore exact package locks.

Exit gate: Smoke continuously tests newest-compatible published packages;
production moves only through an explicit update and remains reproducible.

## Resolver error requirements

Resolution failures identify:

- package name;
- configured brain version;
- requested version or policy;
- valid versions and brain ranges considered, bounded to a readable summary;
- missing, malformed, or deprecated metadata reason;
- the command needed to reconcile or update when a lock is stale.

Errors never include npm authentication headers or tokens.

## Validation strategy

- Pure resolver fixtures; no network in unit tests.
- Mock npm packuments for brains-ops integration tests.
- Changesets fixture/release-plan tests for independent bump behavior.
- Publish-manifest unit tests plus packed-consumer smoke tests.
- Post-publish checks against actual npm registry metadata.
- Rover-pilot image derivation tests proving site/theme/brain versions are
  independent inputs to the image tag.
- A live Smoke rollout before production migration or promotion.

## Non-goals

- Moving packages to separate repositories during this plan. The contract is
  deliberately repository-independent so that later moves require no pilot or
  runtime redesign.
- Inferring or floating `@rizom/brain`.
- Resolving source branches, git URLs, local paths, or npm dist-tags as package
  versions.
- Making ordinary production users float.
