# Rizom sites on hosted Rover

## Status

Phase 0 started in worktree `work/sites-controlled-deploy`.

Implementation started with `@rizom/site-rizom-work` in `sites/rizom-work`: package scaffold, site-package CSS contract (`themeOverride`), and package-level tests are in place. The shared `@rizom/site-rizom` runtime boundary now avoids runtime `@brains/plugins` imports. `brains-ops` can parse per-user `siteOverride` metadata and render generated `brain.yaml` with npm package refs while keeping package versions out of runtime YAML. Packed-install smoke coverage now verifies `@rizom/site-rizom-work` can remain thin/source-published, the installed-package dynamic import path boots, and a hosted-style preview rebuild renders from installed packages. Remaining gates are the `@rizom/site` authoring SDK (see "Authoring SDK decision" — the public contract ships as its own package before anything publishes), then release/publish and hosted deploy wiring.

> **Supersedes prior direction.** The earlier "one shared site + per-app skins in app `src/`, no new published packages" direction is intentionally reversed for this work (confirmed 2026-06-30). Hosted-rover needs npm-resolvable site refs in generated `brain.yaml`, which app-local `src/site.ts` cannot provide, so the Rizom site family now ships as three published per-site packages. The divergence-discipline rule still applies _within_ each package.
>
> **Why published packages, not build-time workspace inclusion (2026-07-06).** The resolver alone does not force publishing — `site.package` resolves by name, and the monorepo build could include a pinned workspace package in the image. The real justification is the product thesis: hosted-rover treats a site as an installable product selected by package ref, and the monorepo is the _first_ site author, not the only possible one. Build-time inclusion can never serve a site the platform repo does not contain, so published packages are the target boundary, and the packaging work (public base API, bundled artifact, self-contained source publish) is load-bearing for that future rather than transport overhead.

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

- `sites/rizom` is `@rizom/site-rizom`: shared Rizom site core, not a full per-domain site.
- `brains/ranger` imports `@rizom/site-rizom` and `@brains/theme-rizom` directly.
- `brains/relay/src/site.tsx` defines `relaySite` via `createRizomSite({ packageName: "@brains/relay/site", themeProfile: "studio", ... })` with custom routes/templates/data source. This is not the same as `rizom.foundation`'s app-local site.
- Correction (2026-07-06): `shell/app/scripts/build-model.ts` no longer exists. The current image path (`shell/app/scripts/build.ts` + `shell/app/src/generate-entrypoint.ts`) generates a static entrypoint from `brain.yaml` that imports and registers exactly the `@`-prefixed package refs found in the overrides (including `site.package`).

## Target architecture

1. Move site source from the three external app repos into monorepo site packages, for example:
   - `sites/rizom-ai` → published package for `rizom.ai`
   - `sites/rizom-foundation` → published package for `rizom.foundation`
   - `sites/rizom-work` → published package for `rizom.work`
2. Publish one shared Rizom site base package and three thin per-site packages:
   - `@rizom/site-rizom` is the public base/core package for Rizom sites: runtime plugin, shared layout primitives, theme-profile behavior, canvas/static assets, and the `createRizomSite` helper.
   - `@rizom/site-rizom-ai`, `@rizom/site-rizom-foundation`, and `@rizom/site-rizom-work` extend that base and carry only their site-specific routes, layouts, templates, `themeProfile`, and package-local CSS/theme override.
   - **Note: this is new coupling, not a lift-and-shift.** The external sites do not import `@rizom/site-rizom` today — `rizom-work/src/site.ts` is a bare default-export object depending only on `@rizom/brain` / `@rizom/ui`. Introducing the shared-core dependency is net-new work per site, not a file move; scope the migration accordingly.
3. `rover-pilot` / `hosted-rover` registry config chooses the per-site package and version for each deployed site.
4. Generated `brain.yaml` should reference npm-resolvable package refs, not app-local `src/site.ts` paths.
5. Hosted deploy installs or otherwise resolves those package refs before boot/build, so Rover can render the requested site without bundling every possible site into the base runtime.
6. Once hosted deploy is live, retire the old standalone site deploy workflows/images in `rizom-ai`, `rizom-foundation`, and `rizom-work`.

Implemented config slice (2026-07-02): `brains-ops` user registry entries may now set `domainOverride`, `contentRepoOverride`, and `siteOverride`. Generated `brain.yaml` emits `site.package` and `site.theme`; `siteOverride.version` is retained as operator metadata for build/install pinning and is intentionally omitted from runtime YAML.

## Packaging path

Skip the temporary bundled-runtime bridge unless direct package resolution proves blocked.

Initial publishability spike result (2026-07-02): `npm pack --dry-run` for `@rizom/site-rizom-work` succeeds, but installing the packed tarball into a clean project fails with `EUNSUPPORTEDPROTOCOL workspace:*`. The package currently depends on workspace-only/private runtime deps (`@rizom/site-rizom`, `@brains/site-content`, `@brains/site-composition`, etc.). Therefore the next gate is dependency-chain publishability or package bundling; hosted-rover cannot yet consume the package as an installed npm dependency.

Follow-up base-package spike result (2026-07-02): naively bundling `@rizom/site-rizom` into a `dist/index.js` artifact installs cleanly with only `preact`, but importing it under Bun fails because the root `@brains/plugins` import pulls broad shell/runtime internals, including `libsql` native bindings. So the base package cannot just bundle the current internal graph unchanged. It needs a narrower public dependency boundary: either `@rizom/site-rizom` imports only a lightweight public plugin/site API, or the shared site base is refactored to avoid dragging shell persistence/runtime internals into the published site package.

Resolution boundary spike result (2026-07-02): refactoring the Rizom runtime plugin away from runtime `@brains/plugins` imports and using only type-only shell/plugin contracts lets a bundled `@rizom/site-rizom` artifact import cleanly in a fresh Bun project with only `preact` installed. This confirms the right direction: published site packages should avoid runtime `@brains/plugins` dependencies; any remaining framework references should be type-only or hidden behind the base package boundary.

Site-content authoring boundary update (2026-07-02): site content definition types and template-construction helpers belong with the shared site-composition contract, not the `@brains/site-content` runtime plugin. The runtime plugin now re-exports/uses that shared contract, and `@rizom/site-rizom-work` no longer depends on the site-content plugin package just to define sections. `@rizom/site-rizom` re-exports the Rizom site authoring helpers/types, so the per-site package consumes them through the base package boundary rather than importing lower-level composition packages directly.

AT Protocol contract boundary update (2026-07-04): AT Protocol lexicon definitions remain owned by the internal `@brains/atproto-contracts` package; `@rizom/site-rizom` serves those canonical definitions but does not define or vendor them. This does not require publishing `@brains/atproto-contracts` for hosted Rizom sites: the published `@rizom/site-rizom` artifact bundles/hides that internal contract source behind the base package boundary.

Base-package artifact update (2026-07-04): `@rizom/site-rizom` is the public base package and now follows the existing built-package convention used by published packages such as `@rizom/ops`: `prepublishOnly` builds `dist/index.js`, package exports point runtime imports at `dist`, and private/internal workspace packages (`@brains/site-composition`, `@brains/atproto-contracts`, and shared Rizom UI source) are build-time/dev dependencies bundled into that artifact. Runtime dependencies are limited to public npm packages (`preact`, `clsx`, `tailwind-merge`).

Packaging correction (2026-07-04): do not generalize from the base-package bundling requirement to all per-site packages. Source-publishing TS/TSX is allowed when the package is self-contained for consumers. The clean-install failure for `@rizom/site-rizom-work` (`react/jsx-dev-runtime`) indicated a missing JSX runtime signal or consumer-facing source-publish contract, not proof that every per-site package must emit `dist`. Treat bundling as required only where there is a demonstrated private runtime dependency boundary, currently `@rizom/site-rizom`. For per-site packages, first test the smallest self-contained source-publish fix before choosing a build artifact.

Source-published TSX update (2026-07-06): `@rizom/site-rizom-work` now uses file-level `@jsxImportSource preact` pragmas on package-owned TSX files and has a package-boundary smoke test that packs `@rizom/site-rizom` + `@rizom/site-rizom-work`, installs them into a clean temp project, and imports the site package successfully. This keeps `@rizom/site-rizom-work` thin/source-published for now.

Current packaging matrix:

| Package                     | Runtime dependency boundary                                                                                                                                      | TSX/source-publish boundary                                                                                                 | Type boundary                                                                                                          | Current direction                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@rizom/site-rizom`         | Has private/internal workspace deps (`@brains/site-composition`, `@brains/atproto-contracts`, shared Rizom UI source) that should not be published transitively. | May contain TSX, but runtime bundling is already justified by private deps.                                                 | Public declarations must not leak private packages; fix at source/API boundary, not by hand-written declaration blobs. | Bundle runtime; expose an intentional public API and generated declarations. |
| `@rizom/site-rizom-work`    | Depends only on public `@rizom/site-rizom` plus `preact`.                                                                                                        | Source-published TSX imports cleanly with file-level `@jsxImportSource preact` pragmas and package-boundary smoke coverage. | Clean through the base public declaration boundary.                                                                    | Keep thin/source-published unless a new private runtime boundary appears.    |
| `@brains/atproto-contracts` | Internal canonical lexicon source.                                                                                                                               | N/A                                                                                                                         | N/A                                                                                                                    | Do not publish for hosted Rizom sites; bundle through base.                  |
| `@brains/site-composition`  | Internal site framework contract used by app/runtime.                                                                                                            | N/A                                                                                                                         | Would leak if exported directly.                                                                                       | Keep internal; hide behind base.                                             |

Packaging decision:

- **Yes:** publish one shared base package, `@rizom/site-rizom`, and have the three per-site packages depend on/extend it.
- **No:** do not publish the entire low-level `@brains/*` framework dependency chain just to make these sites installable.
- The base package is the public/stable Rizom-site API boundary. Its own internal framework dependencies should be bundled/hidden behind the base package's published artifact unless there is an explicit reason to expose them as public packages.
- Per-site packages should stay thin and depend only on `@rizom/site-rizom` and `preact`; shared Rizom UI and site authoring helpers should be exposed through the base package boundary.
- Thin per-site packages may still publish source if their TS/TSX is self-contained for npm consumers. Do not add per-site build artifacts merely because the base package needs one.

Publish-scope correction (2026-07-06): we do not own the `@brains` scope on npm — the org publishes under `@rizom` (the runtime already ships as `@rizom/*`), and nothing is published under `@brains/*` today. Because `site.package` resolves by the literal package name, the published name and the `package.json` name must match, so the publishable packages got a mechanical scope swap before first publish: `@brains/site-rizom` → `@rizom/site-rizom`, `@brains/site-rizom-work` → `@rizom/site-rizom-work` (no semantic renames). The rename ripples into workspace `package.json` names and internal deps, generated `brain.yaml` refs, `brains-ops` `siteOverride` rendering, and the package-boundary test.

Runtime-compatibility decision (2026-07-06): the published base package bundles a _copy_ of the `@brains/site-composition` contracts, and nothing at install time links that copy to the runtime version hosted-rover pins — first-party CI would catch drift, but an externally authored site package would only fail at runtime. Decision: the base package declares a `peerDependencies` range on the published runtime package (`@rizom/brain`) covering the versions its bundled contracts are compatible with; per-site packages inherit the constraint through the base. Hosted-rover installs the site package alongside the pinned runtime, so the package manager enforces compatibility at install time. Bump the peer range whenever the bundled contract copy changes incompatibly.

Authoring SDK decision (2026-07-07): the public contract moves out of the base package into one published authoring SDK, `@rizom/site`. The branch review exposed that every mechanism protecting the current type boundary — the hand-maintained contract mirror in `sites/rizom/src/contracts.ts`, declaration-leak checks, drift guards, dts-inlining plans — is compensation for exposing the internal site-builder integration interface (plugin factories, `register(shell)`, capability shapes) as a public API it was never designed to be. Decision:

- `@rizom/site` is the authoring contract, designed as a product: the declarative site shape (layouts, routes, content DSL definitions, theme override, entity display, static assets) plus layout/site-info prop types. No plugin factories, no shell surface, no data-source registries in v1; escape hatches (e.g. relay-style custom data sources) are added deliberately and versioned. Authors depend on `@rizom/site` + `preact` only; the DSL keeps authoring zod-free while the platform validates.
- The framework conforms to the contract, not the reverse: `@brains/site-composition` and the site-builder depend on `@rizom/site`, internal zod schemas are pinned to the SDK's declared types, and a platform-side adapter turns a declarative site into the internal plugin machinery. `register(shell)` stays inside the platform.
- `@rizom/site-rizom` becomes the rizom family layer (shared UI, theme profiles, `createRizomSite` sugar) built on the SDK like any other consumer; per-site packages depend on the SDK plus the family base.
- The SDK version is the contract/compatibility token: site packages depend on `@rizom/site@^X` and the runtime declares the SDK versions it supports, so npm enforces compatibility directly. The `publishPeerDependencies` range on `@rizom/brain` is an interim measure until the SDK lands, then dropped.
- This supersedes "the base package is the public/stable Rizom-site API boundary" above and step 2 of the preferred path below. The contracts mirror in the base package is deleted when the SDK lands. (A first single-sourcing attempt via re-exports and drift guards on 2026-07-07 was reverted in favor of this decision.)

SDK phasing (walking skeleton first):

1. `@rizom/site` package containing exactly the contract the three real sites need; platform adapter in site-builder/site-composition; internal schemas pinned to SDK types.
2. Port `@rizom/site-rizom` and `@rizom/site-rizom-work` onto the SDK; delete the contracts mirror and its leak-check machinery for contract types.
3. Publish SDK + family base + per-site packages through the normal release flow; hosted deploy wiring continues unchanged (`site.package` refs are unaffected).

Preferred path:

1. Move shared Rizom site core into a publishable `@rizom/site-rizom` base package with a clean public dependency and type story.
2. Define the `@rizom/site-rizom` public API at the source layer: runtime site/plugin contracts, authoring helpers, route/content definition types, and actual UI prop types. Generated declarations should verify this API; they should not be patched by hand-written declaration blobs. _(Superseded 2026-07-07: the public API moves to the `@rizom/site` authoring SDK — see the Authoring SDK decision above.)_
3. Move each site into a thin monorepo package that extends the base package.
4. For each per-site package, prove whether source publishing is self-contained before choosing a build artifact. Start with the smallest JSX-runtime/package-metadata fix for TSX source packages.
5. Make the base package and each per-site package publishable.
6. Publish them with the normal monorepo release flow.
7. Teach hosted-rover to install the exact per-site package version alongside the pinned Rover/runtime version. Package managers will bring the compatible base package version through normal dependency resolution.
8. Keep generated `brain.yaml` shaped as package refs from day one.

The bridge — bundling Rizom site packages into the current published runtime/image — is only a fallback if the package install path blocks Phase 1. If used, it must be documented as temporary and removed in a follow-up phase.

## Rizom Work target skeleton

Operator registry entry should pin both site package and site package version/ref:

```yaml
handle: rizom-work
domainOverride: rizom.work
contentRepoOverride: rizom-ai/rizom-work-content
siteOverride:
  package: "@rizom/site-rizom-work"
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
  package: "@rizom/site-rizom-work"
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

1. A Rover `brain.yaml` with only `site.package: @rizom/site-rizom` will not reproduce any of the three sites. It would miss each site's package-specific layout, route list, sections/templates, and local CSS.
2. First package to migrate should be `rizom.work` because it is a concrete Ranger-based site and has clear `themeProfile: studio` plus local `theme.css`.
3. `themeProfile` should remain site plugin config owned by the site package, not a new top-level `site.themeProfile` deploy field.
4. Site-specific CSS should live in the site package and be layered by the package/runtime, not copied into operator config. This needs an explicit site-package CSS contract before implementation, preferably `SitePackage.themeOverride` layered after the selected base theme and before any instance override.
5. Hosted deploy needs **per-domain** custom-domain support — each rizom site is its own apex domain in its own Cloudflare zone, with its own Origin CA cert covering apex + `www` + `preview`. The current pilot is single-zone: `brain cert:bootstrap` (`packages/brains-ops/src/cert-bootstrap.ts`) resolves one domain from `registry.pilot.domainSuffix`, uses one `CF_ZONE_ID`, issues one shared `*.domain` cert, and pushes one `CERTIFICATE_PEM`/`PRIVATE_KEY_PEM` pair. That must become per-domain — see "TLS / certificates" below.
6. Bundle cleanup is already done (verified 2026-07-06): entrypoint generation imports only the packages referenced by the target `brain.yaml`, and no build path bundles all `sites/*` into an image. "No all-sites bundling" stays in the acceptance bar as a check, not as remaining work.
7. `rizom.ai` currently carries extra behavior (`add: [atproto-registry]` and `plugins.atproto-registry: {}`). Its migration phase must explicitly decide whether to preserve that via Rover `add:` or accept Rover-default behavior.

### Phase 1 acceptance bar (rizom.work)

Done when:

- `@rizom/site-rizom-work` exists in the monorepo, composes `@rizom/site-rizom`, and owns rizom.work's layout/routes/templates/`themeProfile: studio`/local CSS.
- The shared `@rizom/site-rizom` base package has a clean public dependency story: any low-level private/internal dependencies are either hidden/bundled behind it or intentionally made public/stable.
- `@rizom/site-rizom-work` depends on the base package rather than the full internal framework chain.
- The base package and `@rizom/site-rizom-work` are published via the normal release flow at resolvable versions.
- A generated `brain.yaml` referencing `site.package: @rizom/site-rizom-work` boots and renders rizom.work — apex + `www` + `preview` — without bundling all `sites/*` into the image.
- The old `rizom-work` standalone deploy workflow/image is retired (or explicitly gated behind the temporary bridge if used).

Tests (written before impl, per TDD):

- Package-level test: rizom.work site composes and exposes its routes/layouts/templates against the shared core, including package-owned CSS/theme override behavior.
- Deploy/config test: generated `brain.yaml` resolves the package ref and the rendered site matches the current standalone output for the rizom.work routes.

## Site package resolution model

Repo facts to keep separate from decisions:

- `shell/app/src/package-registry.ts` is a name-keyed registry: `registerPackage(name, value)` / `getPackage(name)`. `brain.yaml`'s `site.package` ultimately resolves by package name from that registry.
- Correction (2026-07-06): `shell/app/scripts/build-model.ts` no longer exists, and no build path bundles all `sites/*`. The current image path (`shell/app/scripts/build.ts` + `shell/app/src/generate-entrypoint.ts`) generates a static entrypoint from `brain.yaml` that imports and registers exactly the `@`-prefixed package refs found in the overrides (including `site.package`) — selection is already explicit. The open question is not selection but _source_: the generated entrypoint resolves refs from the monorepo workspace at build time, whereas a hosted build must resolve the pinned site package as an installed npm dependency.
- The published `@rizom/brain` CLI path also has an override-package hook (`registerOverridePackages`) that attempts to import `@` package refs from the installed environment before resolving config. This may allow hosted-rover to install the exact site package version into the image and let existing dynamic import registration handle `site.package`.

Phase 1 should not assume either path without a smoke test. The resolution spike comes before custom bundling work:

1. Publish or locally pack a minimal `@rizom/site-rizom-work` package and its runtime dependency chain.
2. Build a hosted-rover/fleet-style image with pinned runtime + pinned site package installed.
3. Boot a Rover `brain.yaml` containing `site.package: "@rizom/site-rizom-work"`.
4. If dynamic import registration works, use that as the first implementation because it keeps package refs as package refs and avoids custom entrypoint generation.
5. If it does not work, use selective build-time bundling as the fallback: hosted-rover reads `siteOverride.package` + version, installs that package during build, and generates an entrypoint that statically imports only that selected package.

Resolution smoke update (2026-07-06): a clean temp project with packed `@rizom/brain`, packed `@rizom/site-rizom-work`, and packed `@rizom/site-rizom` booted `brain start --startup-check` with `site.package: "@rizom/site-rizom-work"` and `site.theme: "@brains/theme-rizom"`. That verifies the installed-package dynamic import/registration path is viable for boot.

Rendered-site smoke update (2026-07-06): a hosted-style clean temp project with packed `@rizom/brain`, packed `@rizom/site-rizom-work`, and packed `@rizom/site-rizom` started Rover, then triggered `site-builder_build-site` through the remote command surface (`brain build-site preview --remote ...`). The run generated `dist/site-preview` with the Rizom Work layout (`Take the quiz`, `Workshop`) and package-owned theme override CSS (`rizom-diagnostic-panel`). This also exposed and fixed a built-in CLI path bug: `operateBuiltin` must use the shell returned by the booted app instead of calling `Shell.getInstance()` and creating a fresh unconfigured singleton shell.

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

- Package scope/name: **revised 2026-07-06 — `@rizom/site-rizom-*`.** The earlier `@brains/site-rizom-*` decision was wrong: the `@brains` scope is not ours on npm, and the mixed-scope note it carried ("hosted-rover must resolve a `@brains/*` site dep alongside the `@rizom/*` runtime") was the symptom. See the publish-scope correction under "Packaging decision"; after the rename, site packages and runtime resolve from the same `@rizom` scope.
- Version resolution: **installed-package path verified 2026-07-06** — packed runtime + packed site packages boot via the `registerOverridePackages` dynamic-import hook and render preview output after a remote build-site request (see "Resolution smoke update" and "Rendered-site smoke update"). Preferred path is installed package + dynamic import registration. Fallback unchanged if hosted image constraints later require it: selective build-time bundling of exactly the pinned package. The bundled-_runtime_ bridge (cram all sites into the published runtime) is not needed either way.
- `www` alias and `preview.<domain>`: **decided — preserve both.** Hosted-rover must support apex + `www.<domain>` + `preview.<domain>` per site; dropping them regresses current standalone-deploy behavior.
