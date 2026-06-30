# Rizom sites controlled deploy inventory

## Status

Phase 0 started in worktree `work/sites-controlled-deploy`.

Implementation started with `@brains/site-rizom-work` in `sites/rizom-work`: package scaffold, site-package CSS contract (`themeOverride`), and package-level tests are in place. Publishability of the full runtime dependency chain remains the next gate before hosted-rover can consume it as an installed package.

> **Supersedes prior direction.** The earlier "one shared site + per-app skins in app `src/`, no new published packages" direction is intentionally reversed for this work (confirmed 2026-06-30). Hosted-rover needs npm-resolvable site refs in generated `brain.yaml`, which app-local `src/site.ts` cannot provide, so the Rizom site family now ships as three published per-site packages. The divergence-discipline rule still applies _within_ each package.

Clarified target architecture:

- Rizom site code moves back into the main monorepo as first-party site packages.
- Those site packages are published as npm packages.
- `rover-pilot` / `hosted-rover` owns deploy control and generated `brain.yaml`; it should select/resolve the published site packages.
- It is acceptable to have an intermediary step where the site code ships inside the current published runtime package, but that must be marked temporary and either removed later or skipped if direct package resolution is feasible now.

External app repos found under `/home/yeehaa/Documents` as source inputs to migrate:

- `/home/yeehaa/Documents/rizom-ai` → `git@github.com:rizom-ai/rizom-ai.git`
- `/home/yeehaa/Documents/rizom-foundation` → `git@github.com:rizom-ai/rizom-foundation.git`
- `/home/yeehaa/Documents/rizom-work` → `git@github.com:rizom-ai/rizom-work.git`

## Current deployments

| Site               | Current `brain` | Preset    | Domain             | Content repo                        | Local site profile                       | Extra config                                                                                                                       |
| ------------------ | --------------- | --------- | ------------------ | ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `rizom.ai`         | `ranger`        | `default` | `rizom.ai`         | `rizom-ai/rizom-ai-content`         | `src/site.ts`, `themeProfile: product`   | `add: [atproto-registry]`; `plugins.atproto-registry: {}`; `plugins.mcp.authToken`; no anchors/trusted/permissions in `brain.yaml` |
| `rizom.foundation` | `relay`         | `default` | `rizom.foundation` | `rizom-ai/rizom-foundation-content` | `src/site.ts`, `themeProfile: editorial` | `plugins.mcp.authToken`; no anchors/trusted/permissions in `brain.yaml`                                                            |
| `rizom.work`       | `ranger`        | `default` | `rizom.work`       | `rizom-ai/rizom-work-content`       | `src/site.ts`, `themeProfile: studio`    | `plugins.mcp.authToken`; no anchors/trusted/permissions in `brain.yaml`                                                            |

## Local site shape to migrate

All three sites currently use app-local conventional site modules (`src/site.ts`) rather than published package refs.

- `rizom-ai/src/site.ts`
  - layouts: `AiLayout`
  - routes: `aiRoutes`
  - plugin config: `{ themeProfile: "product" }`
  - sections: hero, problem, answer, products, ownership, quickstart, mission, ecosystem
- `rizom-foundation/src/site.ts`
  - layouts: `FoundationLayout`
  - routes: `foundationRoutes`
  - plugin config: `{ themeProfile: "editorial" }`
  - sections: hero, pull-quote, research, events, support, ownership, mission, ecosystem
  - local `src/theme.css`
- `rizom-work/src/site.ts`
  - layouts: `WorkLayout`
  - routes: `workRoutes`
  - templates: `workSiteContent`
  - plugin config: `{ themeProfile: "studio" }`
  - sections: hero, problem, workshop, credibility, personas, proof, ownership, closer, ecosystem
  - local `src/theme.css`

## Deploy shape today

Each app repo builds and pushes its own standalone image from `deploy/Dockerfile` target `standalone`:

- install app `package.json` dependencies
- copy the whole app repo into `/app`
- run `./node_modules/.bin/brain start`

That means the current deployment image includes app-local `src/site.ts`, layouts, routes, section code, local theme files, and content wiring. The hosted Rover/fleet image does **not** currently resolve these sites as published package refs.

Current deploy scripts derive:

- apex preview domain as `preview.<domain>` for two-label domains
- `www.<domain>` for two-label domains
- per-site Cloudflare zone/config through each repo's `.env.schema`

## Tracked monorepo findings

- `sites/rizom` is `@brains/site-rizom`: shared Rizom site core, not a full per-domain site.
- `brains/ranger` imports `@brains/site-rizom` and `@brains/theme-rizom` directly.
- `brains/relay/src/site.tsx` defines `relaySite` via `createRizomSite({ packageName: "@brains/relay/site", themeProfile: "studio", ... })` with custom routes/templates/data source. This is not the same as `rizom.foundation`'s app-local site.
- `shell/app/scripts/build-model.ts` currently bundles every package under monorepo `sites/` into every model image. That is useful as an intermediary but not the final package-resolution model.

## Target architecture

1. Move site source from the three external app repos into monorepo site packages, for example:
   - `sites/rizom-ai` → published package for `rizom.ai`
   - `sites/rizom-foundation` → published package for `rizom.foundation`
   - `sites/rizom-work` → published package for `rizom.work`
2. Each package exports a real site package that composes the shared `@brains/site-rizom` core and carries its own routes, layouts, templates, `themeProfile`, and package-local CSS/theme override.
   - **Note: this is new coupling, not a lift-and-shift.** The external sites do not import `@brains/site-rizom` today — `rizom-work/src/site.ts` is a bare default-export object depending only on `@rizom/brain` / `@rizom/ui`. Introducing the shared-core dependency is net-new work per site, not a file move; scope the migration accordingly.
3. `rover-pilot` / `hosted-rover` registry config chooses the site package and version for each deployed site.
4. Generated `brain.yaml` should reference npm-resolvable package refs, not app-local `src/site.ts` paths.
5. Hosted deploy installs or otherwise resolves those package refs before boot/build, so Rover can render the requested site without bundling every possible site into the base runtime.
6. Once hosted deploy is live, retire the old standalone site deploy workflows/images in `rizom-ai`, `rizom-foundation`, and `rizom-work`.

## Packaging path

Skip the temporary bundled-runtime bridge unless direct package resolution proves blocked.

Preferred path:

1. Move each site into a monorepo package.
2. Make the package publishable.
3. Make the package's **runtime dependency chain** publishable/resolvable too. If `@brains/site-rizom-work` depends on `@brains/site-rizom`, `@brains/site-content`, `@brains/site-composition`, `@rizom/ui`, etc., hosted-rover must be able to install all runtime deps from the registry, or the site package must bundle the private/internal pieces into its published artifact.
4. Publish it with the normal monorepo release flow.
5. Teach hosted-rover to install the exact site package version alongside the pinned Rover/runtime version.
6. Keep generated `brain.yaml` shaped as package refs from day one.

The bridge — bundling Rizom site packages into the current published runtime/image — is only a fallback if the package install path blocks Phase 1. If used, it must be documented as temporary and removed in a follow-up phase.

## Rizom Work target skeleton

Operator registry entry should pin both site package and site package version/ref:

```yaml
handle: rizom-work
domainOverride: rizom.work
contentRepoOverride: rizom-ai/rizom-work-content
siteOverride:
  package: "@brains/site-rizom-work"
  version: "<exact-version-or-dist-tag>"
  theme: "@brains/theme-rizom"
```

Generated runtime config should look like:

```yaml
brain: rover
preset: default
logLevel: info
domain: rizom.work

site:
  package: "@brains/site-rizom-work"
  theme: "@brains/theme-rizom"

plugins:
  directory-sync:
    git:
      repo: rizom-ai/rizom-work-content
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

The site package itself owns `themeProfile: "studio"`, routes, layouts, templates, and local CSS. The operator repo should not need to know those internals. `siteOverride.version` is operator/build metadata only: hosted-rover uses it to install/pin the package version, but generated `brain.yaml` emits only `site.package` and `site.theme` because runtime resolution is by package name.

## Phase 1 implications

1. A Rover `brain.yaml` with only `site.package: @brains/site-rizom` will not reproduce any of the three sites. It would miss each site's package-specific layout, route list, sections/templates, and local CSS.
2. First package to migrate should be `rizom.work` because it is a concrete Ranger-based site and has clear `themeProfile: studio` plus local `theme.css`.
3. `themeProfile` should remain site plugin config owned by the site package, not a new top-level `site.themeProfile` deploy field.
4. Site-specific CSS should live in the site package and be layered by the package/runtime, not copied into operator config. This needs an explicit site-package CSS contract before implementation, preferably `SitePackage.themeOverride` layered after the selected base theme and before any instance override.
5. Hosted deploy needs **per-domain** custom-domain support — each rizom site is its own apex domain in its own Cloudflare zone, with its own Origin CA cert covering apex + `www` + `preview`. The current pilot is single-zone: `brain cert:bootstrap` (`packages/brains-ops/src/cert-bootstrap.ts`) resolves one domain from `registry.pilot.domainSuffix`, uses one `CF_ZONE_ID`, issues one shared `*.domain` cert, and pushes one `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` pair. That must become per-domain — see "TLS / certificates" below.
6. Bundle cleanup remains required: the final Rover/base runtime should not permanently bundle all monorepo `sites/*` packages into every image/package.
7. `rizom.ai` currently carries extra behavior (`add: [atproto-registry]` and `plugins.atproto-registry: {}`). Its migration phase must explicitly decide whether to preserve that via Rover `add:` or accept Rover-default behavior.

### Phase 1 acceptance bar (rizom.work)

Done when:

- `@brains/site-rizom-work` exists in the monorepo, composes `@brains/site-rizom`, and owns rizom.work's layout/routes/templates/`themeProfile: studio`/local CSS.
- The package and all runtime dependencies are publishable/resolvable from the hosted-rover build environment, or the package bundles the private/internal pieces needed at runtime.
- The package is published via the normal release flow at a resolvable version.
- A generated `brain.yaml` referencing `site.package: @brains/site-rizom-work` boots and renders rizom.work — apex + `www` + `preview` — without bundling all `sites/*` into the image.
- The old `rizom-work` standalone deploy workflow/image is retired (or explicitly gated behind the temporary bridge if used).

Tests (written before impl, per TDD):

- Package-level test: rizom.work site composes and exposes its routes/layouts/templates against the shared core, including package-owned CSS/theme override behavior.
- Deploy/config test: generated `brain.yaml` resolves the package ref and the rendered site matches the current standalone output for the rizom.work routes.

## Site package resolution model

Repo facts to keep separate from decisions:

- `shell/app/src/package-registry.ts` is a name-keyed registry: `registerPackage(name, value)` / `getPackage(name)`. `brain.yaml`'s `site.package` ultimately resolves by package name from that registry.
- The monorepo model-image path (`shell/app/scripts/build-model.ts` + `shell/app/src/generate-entrypoint.ts`) populates the registry with static imports baked into the bundle. Today it imports every monorepo `sites/*` package; this is exactly the behavior we want to replace with explicit package selection.
- The published `@rizom/brain` CLI path also has an override-package hook (`registerOverridePackages`) that attempts to import `@` package refs from the installed environment before resolving config. This may allow hosted-rover to install the exact site package version into the image and let existing dynamic import registration handle `site.package`.

Phase 1 should not assume either path without a smoke test. The resolution spike comes before custom bundling work:

1. Publish or locally pack a minimal `@brains/site-rizom-work` package and its runtime dependency chain.
2. Build a hosted-rover/fleet-style image with pinned runtime + pinned site package installed.
3. Boot a Rover `brain.yaml` containing `site.package: "@brains/site-rizom-work"`.
4. If dynamic import registration works, use that as the first implementation because it keeps package refs as package refs and avoids custom entrypoint generation.
5. If it does not work, use selective build-time bundling as the fallback: hosted-rover reads `siteOverride.package` + version, installs that package during build, and generates an entrypoint that statically imports only that selected package.

Decision after spike, not before:

- **Preferred if verified:** installed package + existing dynamic import registration.
- **Fallback if needed:** selective static bundling of exactly the pinned site package.
- **Not acceptable as final state:** bundling all monorepo `sites/*` into every Rover/runtime image.

## TLS / certificates

**Orthogonal to the packaging migration.** Moving site code into npm packages does not touch TLS, DNS, or the proxy. This section exists only because hosted-rover must take over the cert lifecycle that currently lives in each external repo.

Current mechanism (verified, not the retired Caddy/Let's-Encrypt path):

- TLS terminates at **kamal-proxy**, configured per site in `config/deploy.yml` under `proxy.ssl` with `certificate_pem: CERTIFICATE_PEM` / `private_key_pem: PRIVATE_KEY_PEM` and a `hosts` list of apex + `www` + `preview`. (The in-container Caddy and hetzner Terraform cert path are being retired — see commit `b07b6710f fix(deploy): drop internal caddy from model images`.)
- Those PEMs are produced by `brain cert:bootstrap` (`packages/brains-ops/src/cert-bootstrap.ts`): it generates a keypair + CSR, calls the **Cloudflare Origin CA** API to issue a cert for `domain` **and `*.domain`** (so apex/`www`/`preview` are all covered by one wildcard), sets the zone SSL mode to **Full (strict)**, and pushes `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` to the secret backend (Bitwarden) for kamal-proxy to inject.
- Origin CA certs are long-lived (up to 15 years), so there is **no short-cycle renewal treadmill**.

Why this needs work for the three sites — `cert-bootstrap` is hardwired single-zone:

- It resolves exactly **one** domain from `registry.pilot.domainSuffix`, uses **one** `CF_ZONE_ID`, issues **one shared** `*.domain` cert, and pushes **one** `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` pair (the log says "Issued shared Origin CA cert").
- The three rizom sites are three distinct apex domains in three distinct Cloudflare zones, so per deployed site hosted-rover must:
  1. **Issue per-domain** — run cert bootstrap parameterized by the registry entry's `domainOverride` and that domain's own `CF_ZONE_ID` (issue `rizom.work` + `*.rizom.work`, set that zone to Full-strict). Today only the single shared pilot zone is supported.
  2. **Store per-domain secret pairs** — distinct `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` per site, keyed so each site's Kamal proxy gets its own pair (currently one shared pair).
  3. **Set per-site proxy `hosts`** — apex + `www` + `preview` (matches the preserve-both decision).
  4. **Manage per-zone DNS** via the Cloudflare API (the `deploy/scripts/update-dns.ts` equivalent), pointing apex/`www`/`preview` at the origin per zone.

## Onboarding a custom-domain brain

Existing pilot users (`${handle}.${domainSuffix}` on the shared pilot zone) are unaffected — they stay on the shared `*.${domainSuffix}` wildcard cert and need none of this. This flow applies only to brains that bring their **own apex domain** (the rizom sites).

**One human step, then fully automated.**

Prerequisite (human, one-time): the domain must become a Cloudflare zone we control. The customer points their registrar's nameservers at our Cloudflare account (NS delegation). This is the only non-automatable step — same as any managed-hosting onboarding ("set your nameservers to these two"). We deliberately **own the zone** rather than asking the customer for a scoped token into a zone they keep: it reuses the model the shared pilot zone already uses, our existing token works, and it keeps cert + DNS fully automatable. Once nameservers propagate we have the zone's `CF_ZONE_ID`.

Then hosted-rover provisions from a single registry entry:

1. **Register** the pilot entry: `domainOverride`, `siteOverride` (package + version), content repo override, and the new zone's `CF_ZONE_ID`.
2. **Issue the cert** — `cert:bootstrap` parameterized by `domainOverride` + `CF_ZONE_ID`: Origin CA wildcard for `domain` + `*.domain`, set zone to Full (strict), push a per-brain `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` pair to the secret backend.
3. **DNS** — upsert apex + `www` + `preview` records to the origin (the `update-dns.ts` equivalent), per zone.
4. **Deploy** — generated `brain.yaml` (with `site.package`) + Kamal proxy `hosts` = apex/`www`/`preview`, injecting that brain's cert pair.

Net: custom onboarding = subdomain onboarding **plus** an upfront NS-delegation step. Steps 2–4 are the per-zone parameterization of machinery that already exists; nothing else is new. The cert is long-lived (15 yr), so there is no recurring renewal task per brain.

## Remaining open questions

- Package scope/name: **decided — `@brains/site-rizom-*`** (matches the `@brains/site-rizom` core the packages depend on). Note the published runtime ships as `@rizom/*`, so hosted-rover must resolve a `@brains/*` site dep alongside the `@rizom/*` runtime.
- Version resolution: **pending a spike, decision after — not before.** Preferred if verified: install the pinned site package into the image and let the existing `registerOverridePackages` dynamic-import hook resolve `site.package`. Fallback: selective build-time bundling of exactly the pinned package. The bundled-_runtime_ bridge (cram all sites into the published runtime) is not needed either way, and bundling all `sites/*` into every image is not acceptable as the final state. See "Site package resolution model" above.
- `www` alias and `preview.<domain>`: **decided — preserve both.** Hosted-rover must support apex + `www.<domain>` + `preview.<domain>` per site; dropping them regresses current standalone-deploy behavior.
