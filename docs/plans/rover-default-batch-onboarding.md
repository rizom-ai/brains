# Rover default batch onboarding

## Status

Fact-checked against `@rizom/ops` and the live pilot 2026-07-22. The original
Phase 1/2 machinery is shipped and proven in production; this plan now covers
only what actually remains before a second batch: cohort-level version
defaulting, the package authoring contract docs, and the batch rollout itself.

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

### Not built

- `siteOverride.version` is a required exact version — every release bumps the
  cohort `brainVersionOverride` **and** each site user's `siteOverride.version`
  (three files per train today).
- No operator/user-facing doc of the site/theme package contract.
- `previewDomainOverride` (zero references in the codebase).
- `brains-ops preflight`.

## Goal

Prepare the hosted Rover pilot flow for a second batch of users running the
default preset, with safe per-user customization, predictable builds, and clear
operator rollback.

Batch constraints (unchanged): custom site/theme packages must be public npm
packages; private registries, user edits to generated `brain.yaml`, and
cohort-level site/theme inheritance stay out of scope.

## Phase 1 — Cohort version defaulting

Make `siteOverride.version` optional. When omitted, the registry resolves it to
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
- Tests first: registry resolution (omitted → cohort version, omitted →
  pilot default, explicit pin wins), unchanged rendering/image derivation on
  resolved output.
- Follow-up in rover-pilot: drop the redundant `version` lines from
  `users/rizom-ai.yaml` and `users/docs.yaml` so a release train bumps one
  file.

## Phase 2 — Package authoring contract docs

Document the contract before asking a batch to supply packages:

- theme package exports a CSS string as default export;
- site package exports a valid `SitePackage`;
- packages must be compatible with the pinned `@rizom/brain` public API and
  published publicly at the lockstep version;
- pointer to `docs/site-mockup-migration.md` for building the package, plus
  the fleet-specific pieces it does not cover (exact refs in
  `users/<handle>.yaml`, per-instance images, canary/rollback flow).

Starter templates (`rover-site-*` / `rover-theme-*`) only if the first
external author actually gets stuck without them.

## Phase 3 — The batch

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

## Suggested implementation order

1. Cohort version defaulting (Phase 1) + rover-pilot YAML cleanup
2. Authoring contract docs (Phase 2)
3. Canary with one external package, then the batch (Phase 3)
4. Phase 4 items only on demonstrated need
