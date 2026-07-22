# Rover default batch onboarding

## Status

Complete. The fleet machinery was already live; this pass added effective-version
defaulting for site overrides, regression coverage through image derivation, and
the hosted package authoring/canary/rollback contract to the published
`@rizom/ops` scaffold. The remaining steps are operational: release `@rizom/ops`,
remove the now-redundant pins in rover-pilot, and run the external-package canary
before admitting the next cohort.

### Shipped (verified)

- **Per-user site/theme overrides** — `users/<handle>.yaml` `siteOverride:
{package, version, theme}` (`packages/brains-ops/src/schema.ts`), rendered
  into the generated `users/<handle>/brain.yaml` by `default-user-runner.ts`.
  Refs are exact public npm packages; prerelease-exact allowed.
- **Per-instance image identity** — `siteImageTag()` / `sitePackagesFor()` /
  `requiredImages()` (`packages/brains-ops/src/images.ts`): default instances
  share `brain-{version}`; a site override opts that one instance into
  `brain-{version}-sites-{hash}`. Build and deploy resolve the tag through the
  same helper, the Build workflow derives the required image set from declared
  fleet state and builds only missing tags, and the Dockerfile installs
  `$SITE_PACKAGES` alongside `@rizom/brain@$BRAIN_VERSION`. A ref change
  rebuilds and redeploys exactly the affected instances.
- **Custom-package canary flow** — exercised repeatedly in production:
  `rizom-ai` (`@rizom/site-rizom-ai` + `@rizom/theme-rizom-ai`, custom domain)
  and `docs` (`@rizom/site-docs`) run per-instance images through
  choose-refs → reconcile → build → deploy → verify. Rollback is the documented
  inverse (revert the YAML, reconcile, redeploy). Only operator-authored
  packages so far — an external user's package has not yet been through it.
- **`domainOverride`** — shipped and proven by the `rizom.ai` custom-domain
  TLS cutover.

### Completed by this plan

- `siteOverride.version` is optional input and resolves to the user's effective
  brain version in `load-registry.ts`; explicit exact versions remain pins.
- Registry tests cover the cohort default, pilot default, and explicit pin, and
  the missing-image test exercises omitted-version resolution through exact npm
  refs and per-instance image derivation.
- The scaffolded operator playbook documents the public package contracts,
  lockstep versions, desired-state config, image isolation, canary, verification,
  and rollback flow.
- `previewDomainOverride` and `brains-ops preflight` remain intentionally
  demand-gated rather than unfinished scope.

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running the
default preset, with safe per-user customization, predictable builds, and clear
operator rollback.

Batch constraints (unchanged): custom site/theme packages must be public npm
packages; private registries, user edits to generated `brain.yaml`, and
cohort-level site/theme inheritance stay out of scope.

## Phase 1 — Cohort version defaulting (complete)

`siteOverride.version` is optional. When omitted, the registry resolves it to
the user's effective brain version (cohort `brainVersionOverride`, else the
pilot default) at load time; an explicit version remains a deliberate pin.

- Site and theme packages are published in lockstep with `@rizom/brain`, so
  the effective brain version is the correct default; `sitePackagesFor()`
  already rides the theme at the site version and needs no change.
- Resolution happens in `load-registry.ts` so everything downstream
  (`default-user-runner`, `images.ts`, deploy resolve) keeps receiving a
  concrete `ResolvedSiteOverride` — image tags stay a pure function of
  resolved refs, and a cohort version bump automatically rebuilds the site
  images.
- Registry resolution covers omitted → cohort version, omitted → pilot default,
  and explicit pin wins; image derivation consumes the resolved exact version.
- After the supporting `@rizom/ops` version is published and pinned in
  rover-pilot, drop the redundant `version` lines from `users/rizom-ai.yaml` and
  `users/docs.yaml` so a release train bumps one file.

## Phase 2 — Package authoring contract docs (complete)

The scaffolded operator playbook now documents the contract before a batch is
asked to supply packages:

- theme package exports a CSS string as default export;
- site package exports a valid `SitePackage`;
- packages must be compatible with the pinned `@rizom/brain` public API and
  published publicly at the lockstep version;
- pointer to `docs/site-mockup-migration.md` for building the package, plus
  the fleet-specific pieces it does not cover (exact refs in
  `users/<handle>.yaml`, per-instance images, canary/rollback flow).

Starter templates (`rover-site-*` / `rover-theme-*`) only if the first
external author actually gets stuck without them.

## Phase 3 — Operational batch rollout

1. One canary user with an externally authored package through the proven
   flow: choose refs → apply to the canary's YAML → reconcile → build/deploy →
   verify web/CMS/site/theme/sync/auth.
2. Roll the remaining batch users on the default image; site overrides stay
   the exception.
3. Capture whatever friction the batch surfaces as follow-up work rather than
   pre-building for it.

## Phase 4 — Only if the batch demands it

- `previewDomainOverride` — no current user needs a custom preview domain;
  build it when one does.
- `brains-ops preflight` — the reconcile/build path already fails loudly on
  bad refs and missing secrets; add a preflight command only if batch
  onboarding shows operators need the dry-run.

## Later: runtime package resolution

The install-time contract (image bakes the package set) is deliberate for this
batch. The eventual shape stays as previously sketched: same `brain.yaml`
contract, package installation moves into the app runtime with a persistent
cache and integrity checks, and the shared image stops rebuilding for site/theme
changes. Migrate by swapping the resolver implementation, not user config.

## Completion sequence

1. Publish and pin the supporting `@rizom/ops` release, then remove the two
   redundant rover-pilot YAML pins.
2. Canary with one external package, then admit the batch.
3. Add Phase 4 items only on demonstrated need.
