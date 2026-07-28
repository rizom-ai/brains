# Plan: Independent site and theme package versioning

## Status

Implementation in progress. Phase 0 is complete: the release-group split,
pre-publish manifest preparation, compatibility metadata, and registry
verifier are implemented, and the exit gate closed on 2026-07-27 —
`0.2.0-alpha.233` site and theme packuments expose valid `peerDependencies`
brain ranges with no authoring-only fields (root cause of the earlier broken
packuments: the per-package `postpack` restore ran mid-publish, after the
tarball was packed but before npm read registry metadata; restore now happens
once in the release wrapper, with a drift-guard test). Package resolution is
unblocked.

Phase 5 is complete; its exit gate closed on 2026-07-28. Core and site/theme
releases run in fully separate pipelines (Core CI → Release, Site CI → Site
Release, shared publish concurrency), and the first independent site release
shipped the `0.2.0-alpha.234` sites through the site lane in 45 seconds while
core stayed at `0.2.0-alpha.236`. The standalone `rizom-ai/site-smoke-canary`
repository published `0.2.0-alpha.234` to npm via trusted publishing (OIDC,
provenance attestation, no token), and Smoke first deployed that external
release with `theme-signal@0.2.0-alpha.233` baked into its image.

That first site/theme version divergence exposed a lockstep assumption in
`@rizom/ops`: image resolution inherited the theme's version from the site's.
`@rizom/ops@0.2.0-alpha.237` added an explicit `themeVersion` siteOverride
field for independently published `@rizom/*` themes. That compatibility alpha
is historical input to the canonical crossover, not a surviving resolver.

The planned resolver, committed package lock, omitted/`latest` policy, and
floating canary in former Phases 1–4 are cancelled before implementation. There
are only three real hosted sites, so the canonical brain crossover moves all
three directly to explicit exact site and external-theme versions. Active ops
has one strict desired-state contract: it never defaults a site version from
`brainVersion`, infers a theme version from a site version, or resolves floating
npm state. Temporary offline crossover staging requires a separately reviewed
pin manifest and is deleted after crossover convergence plus the one-week soak.

This plan gives deployable site and theme packages genuinely independent npm
versions and decouples their exact deployment pins from `brainVersion`. The
monorepo is only their current publishing location. Packages can later move to
independent repositories without changing the exact-pin pilot contract.

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
2. Brain, site, and external-theme versions are separate required exact pins;
   none is inferred from another.
3. Every build and deploy consumes the exact package refs declared in reviewed
   desired state.
4. The three existing hosted sites cross over together without a compatibility
   release, floating policy, or runtime package resolver.
5. Package publishing remains repository-independent and exposes standard npm
   compatibility metadata for release-time verification.

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

### Release independence is the product, and it has three layers

Sites and themes are a platform product surface: outside authors publish their
own site and theme packages from their own repositories and have them resolved
onto hosted instances. Independent version lines (this plan's original scope)
are only the first layer. The decisions below extend the plan to the other two.

1. **Version lines** — done (Phase 0). Site/theme releases no longer republish
   or version-bump with `@rizom/brain`.
2. **Release pipeline** — site and theme packages leave the core Release
   workflow. They publish through their own workflow with their own verify
   gate and their own changeset queue, so:
   - a core release can never publish a site or theme package, and a
     site/theme release can never publish `@rizom/brain` (enforced by test,
     like the existing release-group tests);
   - site metadata verification gates the _site_ publish and can never land
     after an irreversible core publish;
   - a queued core changeset cannot delay or ride along with a site fix, and
     vice versa.
3. **Repository** — first-party sites ultimately move out of the monorepo and
   consume `@rizom/brain` and `@rizom/site` from npm like any third party. The
   pilot contract already assumes nothing about the monorepo, so the move is
   mechanical once layer 2 exists.

### The fixed core group must be unreachable from the site lane

The mechanism that made every site fix ship a full core release was dependency
propagation into the fixed changeset group: private brain apps (`rover`,
`relay`, `ranger`) and `@brains/theme-rizom` runtime-depend on site/theme
packages with `workspace:*` ranges, so a site patch bumped them, and the fixed
constraint then bumped — and published — `@rizom/brain`, `@rizom/ops`, and
`@rizom/ui`. Settled rules:

- Packages that bump-propagate from the site lane are excluded from the fixed
  group (they are all private; their versions are npm-invisible bookkeeping and
  may drift). A drift-guard test asserts no fixed-group package declares a
  runtime or peer dependency on a site-lane package.
- Type-only usage of `@rizom/site` in core (site-composition, app) lives in
  `devDependencies`, which changesets records as no-op releases.
- The lane guard exempts private packages: a private dependent version-bumping
  inside the other lane's version commit publishes nothing and is allowed.
  Publishable crossings remain a hard failure, validated against the assembled
  release plan (including pre-mode state) in CI and in both release workflows.

### First-party sites dogfood the public path

The privileged monorepo path is why the public path shipped broken metadata
unnoticed: nothing consumed it. The reference implementation of "releasing a
site" must therefore be the public path itself. `@rizom/site-smoke-canary`
(already content-independent by design) is extracted to a standalone
repository and released the way an outside author would: plain `npm publish`,
hand-authored `peerDependencies`, no `@brains` build tooling, no changesets.
The Smoke instance then consumes it through ordinary resolution, so the
public path — not the internal one — is what the canary continuously
exercises.

### Compatibility ranges require a stated breaking-change rule

A brain peer range only means something if the hosting contract is versioned
honestly. While `@rizom/brain` remains on a perpetually bumping prerelease
line, the rule is: a change that breaks the site hosting contract (the
`@rizom/site` authoring surface or the runtime's site loading behavior) must
be called out in the release notes and must advance the lower bound that new
site/theme releases declare; ranges are authored as
`>=<first-compatible> <0.3.0`. When the platform opens to outside authors,
the contract graduates to plain semver (breaking hosting changes bump the
range ceiling). Compatibility metadata without this rule is decorative.

### Standard npm compatibility metadata

A deployable site or external theme declares brain compatibility in:

```json
{
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.217 <0.3.0"
  }
}
```

This is the compatibility signal verified when publishing and reviewing a
hosted package. Active brains-ops does not query npm or resolve a compatible
version during registry loading or reconciliation. External repositories
publish ordinary `peerDependencies`; they do not need Rizom's monorepo build
tooling.

Monorepo packages may retain an authoring-only manifest field if required to
avoid workspace cycles, but the npm registry packument must contain the
standard `peerDependencies` field.

### Exact desired state

`users/<handle>.yaml` declares complete install refs:

```yaml
siteOverride:
  package: "@rizom/site-example"
  version: 1.4.2
  theme: "@rizom/theme-example"
  themeVersion: 3.1.0
```

`version` is always required for a site override. `themeVersion` is required
for an external `@rizom/*` theme. Bundled `@brains/*` themes ship inside
`@rizom/brain`, reject `themeVersion`, and are not installed separately.
Missing or malformed pins fail Zod validation before registry loading.

Build and Deploy derive the image package set directly from these exact values.
There is no generated package lock, `latest` sentinel, absent-version policy, or
npm resolution step. Reconciliation remains offline with respect to package
repositories. Publish verification and crossover evidence prove that each
reviewed exact ref exists and declares a compatible brain peer range.

## Migration safety

There is no compatibility release. Before the authorized canonical crossover:

1. Enumerate the three existing real hosted sites in a reviewed pin manifest.
2. Verify every exact site and theme version against package, lockfile, and
   current image evidence.
3. Use temporary offline staging to materialize missing exact pins in a
   secret-free review copy while leaving the pilot source untouched.
4. Require strict canonical desired-state validation and two-pass zero-drift
   reconciliation on the isolated copy.
5. During the frozen crossover, move config and image together; rollback
   restores their prior pair.

The active canonical loader has no fallback or old-format union. The offline
stager survives only through convergence plus the one-week soak.

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

### Phase 1 — Strict exact-pin crossover

1. Require exact `siteOverride.version` and independent exact external
   `themeVersion` values in the sole active ops schema.
2. Remove loader and image-builder version inference.
3. Enumerate the three hosted sites in an external reviewed pin manifest;
   staging rejects missing, extra, identity-mismatched, or conflicting pins.
4. Preserve comments while materializing those pins in the isolated crossover
   copy.
5. Prove the resulting site/theme pairs drive deterministic image tags and
   converge with zero second-pass drift.

Exit gate: every hosted site has explicit exact refs, no active ops path infers
or resolves package versions, and the reviewed config/image pairs are ready for
the frozen canonical crossover.

### Former Phases 2–4 — Removed

Do not implement an npm resolver, generated site-package lock, absent/`latest`
policy, floating Smoke config, or `site:update` command. With three known sites,
explicit reviewed updates are smaller, safer, and auditable. Revisit automated
package discovery only if fleet scale creates a demonstrated operational need.

### Phase 5 — Release pipeline independence and the public-path reference site

Starts immediately; does not depend on Phases 1–4.

1. Split site/theme publishing out of the core Release workflow into its own
   workflow: own trigger, own changeset scope, own publish step, with the
   metadata verifier gating that publish.
2. Prove the separation with tests: core release plans never include
   site/theme packages; site/theme release plans never include `@rizom/brain`
   or fixed-group runtime packages.
3. Filter CI so a site-only change runs site-scoped checks; a broken unrelated
   package cannot block a site release, and vice versa.
4. Extract `@rizom/site-smoke-canary` to a standalone repository releasing via
   plain `npm publish` with hand-authored `peerDependencies` — the reference
   third-party site. Smoke consumes each reviewed release through an explicit
   exact desired-state pin.
5. Document the external authoring contract: required manifest fields, the
   brain peer range rule, and the publish flow — written against the
   extracted reference repo, not the monorepo.

Exit gate: a site fix reaches npm through a pipeline that cannot publish
`@rizom/brain`, and at least one deployed site package is produced entirely
outside the monorepo toolchain.

## Exact-pin error requirements

Validation failures identify the user, package, and missing or conflicting
exact version. Offline staging also rejects pin-manifest entries whose package
or theme identity differs from source desired state. Errors never include npm
authentication headers, tokens, or secret values.

## Validation strategy

- Strict schema tests for required site and external-theme exact pins.
- Comment-preserving offline staging tests for missing, extra, mismatched, and
  conflicting reviewed pins.
- Changesets fixture/release-plan tests for independent bump behavior.
- Publish-manifest unit tests plus packed-consumer smoke tests.
- Post-publish checks against actual npm registry metadata.
- Image derivation tests proving site/theme/brain versions are independent
  inputs to the image tag.
- An explicitly authorized live Smoke rollout before wider promotion.

## Non-goals

- Mass-migrating first-party site packages to separate repositories during
  this plan. The single reference-site extraction in Phase 5 is in scope —
  it is the proof that the contract is repository-independent; the remaining
  first-party sites move only after it, as mechanical follow-ups.
- Inferring or floating brain, site, or theme versions.
- Runtime/reconcile-time npm compatibility resolution or generated package
  locks.
- Resolving source branches, git URLs, local paths, npm dist-tags, or `latest`
  policies as package versions.
