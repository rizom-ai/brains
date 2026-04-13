# @rizom/brain

## 0.2.0-alpha.5

### Patch Changes

- [`c968a9d`](https://github.com/rizom-ai/brains/commit/c968a9d64b5f3f858135872f6c4c1052e394c7b0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep the Origin CA helper on a node-only `@brains/utils/origin-ca` subpath so `@rizom/brain` browser-targeted builds can publish successfully.

## 0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- [`9871933`](https://github.com/rizom-ai/brains/commit/9871933e813940ffa9628a55ee5892e538d17f1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the shared local env helper so browser-targeted `@rizom/brain` builds do not depend on `node:util.parseEnv`.

## 0.2.0-alpha.2

## 0.2.0-alpha.1

## 1.0.1-alpha.17

## 0.1.1-alpha.16

### Patch Changes

- [`2461872`](https://github.com/rizom-ai/brains/commit/24618720d35f9081a6aa3279b2007396961a08e5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix `brain init --deploy` to scaffold a checked-in `scripts/extract-brain-config.rb` helper and use it from the deploy workflow instead of shell-grepping `brain.yaml`. This also avoids broken newline escaping in the generated workflow's inline Node snippets.

## 0.1.1-alpha.15

### Patch Changes

- [`5cd6ca2`](https://github.com/rizom-ai/brains/commit/5cd6ca2cd2188f8cd71d83f2b8829fdfa197468b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: hide `/admin/` and `/dashboard` from public navigation.

  Both routes were registered with `navigation.show: true` in the
  secondary slot, which meant every layout that surfaces secondary nav in
  the footer — including `PersonalLayout` — leaked operator tooling into
  public navigation on every Brain site.

  Admin and Dashboard are operator interfaces, not public pages. They
  still render their routes and remain reachable by direct URL; they just
  no longer appear in auto-generated navigation menus.

## 0.1.1-alpha.14

### Patch Changes

- [`fc3ce02`](https://github.com/rizom-ai/brains/commit/fc3ce02e8d5df45b759335bbf4e0745c936fde4b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: mobile layout correctness for the Personal site templates and
  shared Header.

  The Personal homepage and about templates shipped rigid desktop-first
  sizing that overflowed on narrow viewports, and several decorative
  classes defined in `theme-default` (`hero-bg-pattern`, `cta-bg-pattern`,
  `card-cover-gradient`) were never actually applied by the layouts.
  The shared `Header`'s mobile hamburger had no visible default state on
  dark backgrounds.
  - `sites/personal/src/templates/homepage.tsx`
    - Hero h1: `text-4xl md:text-[56px]` → `text-2xl sm:text-4xl md:text-[56px]`,
      add `text-balance` so the tagline wraps on word boundaries instead of
      clipping at ~390px.
    - Hero inner container: add `w-full` so it fills the flex-col parent
      instead of shrink-wrapping to content width under `items-center`.
    - Hero CTA row: `flex justify-center gap-3` → `flex flex-wrap justify-center gap-3`
      so the two pill buttons stack on narrow viewports.
    - Hero `<header>`: apply `hero-bg-pattern relative overflow-hidden` so
      the theme-default dot pattern and vignette actually render.
    - Recent Posts grid: `grid-cols-1 md:grid-cols-3` →
      `grid-cols-[repeat(auto-fit,minmax(min(100%,280px),360px))] justify-center`
      so a lone post centers instead of stranding in two empty columns.
    - Post card `<img>`: add `card-cover-gradient text-transparent` so a
      failing image falls through to the brand gradient instead of showing
      raw alt text.
    - CTA section: apply `cta-bg-pattern relative overflow-hidden`.
  - `sites/personal/src/templates/about.tsx`
    - Same hero h1, inner container, and `hero-bg-pattern` treatment as
      the homepage.
  - `sites/personal/src/layouts/PersonalLayout.tsx`
    - Root wrapper: add `overflow-x-clip` as a global horizontal-overflow
      safety net.
    - Footer nav: `flex gap-6` → `flex flex-wrap justify-center gap-x-6 gap-y-2`
      so the nav wraps instead of clipping "Admin" off the right edge.
  - `shared/ui-library/src/Header.tsx`
    - Mobile hamburger button: ship a visible default state
      (`text-brand border border-brand/40 bg-brand/10`) so it reads against
      dark headers without relying on each consumer's theme override.

## 0.1.1-alpha.13

### Patch Changes

- [`dbdbee7`](https://github.com/rizom-ai/brains/commit/dbdbee7816a474c1317cc92ac331fc59d434dc7f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an explicit `brain init --deploy --regen` path for standalone deploy scaffolds.
  - regenerate derived deploy artifacts like `.github/workflows/deploy.yml`, `.github/workflows/publish-image.yml`, `.kamal/hooks/pre-deploy`, `deploy/Dockerfile`, and `deploy/Caddyfile`
  - keep canonical instance files such as `brain.yaml`, `.env`, `.env.schema`, and `config/deploy.yml` untouched during regen
  - re-derive the deploy workflow secret bridge from the current `.env.schema`, fixing drift after post-init schema changes

## 0.1.1-alpha.12

### Patch Changes

- [`37a2f97`](https://github.com/rizom-ai/brains/commit/37a2f976816e451dc2f81c28862cfa2b3dd71aaf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden standalone deploy workflows for fresh servers.
  - write an explicit SSH client config for Actions deploy runs so Kamal and plain `ssh` use the intended key noninteractively
  - wait for SSH access after provisioning before starting Kamal on a newly created Hetzner server

## 0.1.1-alpha.11

### Patch Changes

- [`dc252f2`](https://github.com/rizom-ai/brains/commit/dc252f204f980154b8cfc23cea17b8e50ea0ae82) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve deploy secret bootstrap ergonomics for standalone repos.
  - add `brain ssh-key:bootstrap` to create or reuse a local deploy key, register the matching public key in Hetzner, and optionally push `KAMAL_SSH_PRIVATE_KEY` to GitHub
  - make `brain secrets:push` read file-backed secrets from `.env.local` and `.env`, including `~/...` home-directory paths
  - document the preferred reproducible contract for `KAMAL_SSH_PRIVATE_KEY_FILE`

## 0.1.1-alpha.10

### Patch Changes

- [`177360d`](https://github.com/rizom-ai/brains/commit/177360dd90198c3b69143ab9a5c058d00c8379da) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve standalone deploy scaffolding for real repo usage.
  - scaffold a repo-local `publish-image.yml` workflow for standalone repos
  - make standalone deploy workflows trigger from `Publish Image` and deploy immutable SHA tags instead of relying on `latest`
  - switch standalone `config/deploy.yml` image identity from hardcoded `rizom-ai/<model>` values to repo-derived placeholders
  - scaffold repo-local deploy image assets (`deploy/Dockerfile`, `deploy/Caddyfile`)
  - bundle built-in model env schemas into the published package so `brain init --deploy` works outside the monorepo
  - reconcile known stale generated deploy files in existing standalone repos without overwriting custom edits

## 0.1.1-alpha.9

### Patch Changes

- [`f3d6b81`](https://github.com/rizom-ai/brains/commit/f3d6b81d0a693137ce4b32a4b76e5c1fca8c1907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Pre-register the built-in site and theme package refs used by bundled brain instances so published-path apps can resolve refs like `@brains/site-rizom`, `@brains/theme-rizom`, `@brains/site-default`, and `@brains/theme-default` from the runtime package registry instead of trying to dynamically import external workspace packages at boot.

## 0.1.1-alpha.8

### Patch Changes

- [`c1ffe49`](https://github.com/rizom-ai/brains/commit/c1ffe49f27bcb59935b06b64003eba266d520197) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bundle the `ranger` and `relay` brain models into the published `@rizom/brain` runtime so app instances that declare those models in `brain.yaml` can boot on the published path instead of requiring monorepo source resolution.

## 0.1.1-alpha.7

### Patch Changes

- [`99c536e`](https://github.com/rizom-ai/brains/commit/99c536e2f66f6fc025677b549adce0a2d433b8bf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve standalone site authoring for published `@rizom/brain` consumers.
  - auto-discover local `src/site.ts` and `src/theme.css` when `brain.yaml`
    omits `site.package` / `site.theme`
  - widen `@rizom/brain/site` to expose both personal and professional site
    authoring symbols under one public subpath
  - make `brain init` scaffold `src/site.ts` and `src/theme.css` while keeping
    `brain.yaml` pinned to the model's built-in site/theme until the operator
    opts into the local convention

## 0.1.1-alpha.6

### Patch Changes

- [`edafd2e`](https://github.com/rizom-ai/brains/commit/edafd2ea52d3631a6ffd08736ec7b86e68f2a2e3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `@rizom/brain/themes` subpath export with `composeTheme`.

  Standalone site repos need `composeTheme(myThemeCSS)` to prepend
  the shared base utilities (palette tokens, `@theme inline`
  declarations that expose `--color-brand` / `--color-bg` / etc. to
  tailwind, layer ordering, gradient / status utilities) to their
  own brand overrides. Without composing, tailwind can't resolve
  utilities like `bg-brand`, `text-brand`, or
  `focus-visible:ring-brand` that the layouts depend on, and the
  site build crashes with:

      Cannot apply unknown utility class `focus-visible:ring-brand`

  Consumers use it like:

      import { composeTheme } from "@rizom/brain/themes";
      import type { SitePackage } from "@rizom/brain/site";
      import themeCSS from "./theme.css" with { type: "text" };

      const site: SitePackage = {
        theme: composeTheme(themeCSS),
        // ...
      };

  Part of the public library-export surface now tracked in `docs/plans/external-plugin-api.md`, shipping early
  because `apps/mylittlephoney` hit the missing-utility crash during
  Phase 1 of the standalone extraction. The rest of Tier 2
  (`@rizom/brain/plugins`) is still deferred.

  The new entry follows the same pattern as `@rizom/brain/site`:
  runtime re-export in `src/entries/themes.ts`, hand-written type
  contract in `src/types/themes.d.ts`, bundled by `scripts/build.ts`
  into `dist/themes.js` (11KB — it's essentially a re-exported CSS
  string plus a pass-through function), and declared in the
  `exports` map of `packages/brain-cli/package.json`.

  Includes a source-level regression test at
  `packages/brain-cli/test/themes-export.test.ts` that asserts all
  four wiring points stay intact (entry file, type contract,
  package.json exports map, and `libraryEntries` in build.ts).

## 0.1.1-alpha.5

### Patch Changes

- [`310de17`](https://github.com/rizom-ai/brains/commit/310de174a1a1cb2e7947f8a93ae602256467506f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: declare `preact` and `preact-render-to-string` as runtime
  dependencies of `@rizom/brain`.

  Alpha.4 externalized `preact`, `preact/hooks`, `preact/jsx-runtime`,
  `preact/compat`, and `preact-render-to-string` in the bundle to
  avoid the dual-instance hook crash, but forgot to add them as
  regular `dependencies` in `package.json`. Consumers installing
  `@rizom/brain` from npm got the bundle without the runtime modules,
  and the CLI crashed at import time with:

      Cannot find package 'preact-render-to-string' from
      '/.../node_modules/@rizom/brain/dist/brain.js'

  Adds both packages as regular `dependencies`. `preact@^10.27.2` and
  `preact-render-to-string@^6.3.1`, matching the versions used by
  `@brains/site-builder-plugin` in the monorepo so runtime and
  workspace stay aligned.

  Consumers scaffolded via `brain init` also declare `preact` in
  their own `package.json`, which is fine — bun hoists the shared
  version to the top-level `node_modules/preact` and the externalized
  imports all resolve to the same instance.

## 0.1.1-alpha.4

### Patch Changes

- [`42dc036`](https://github.com/rizom-ai/brains/commit/42dc0367073fd747005f67979bbe9fea74be6c54) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: externalize `preact` (and `preact/hooks`, `preact/jsx-runtime`,
  `preact/compat`, `preact-render-to-string`) in the `@rizom/brain`
  bundle so the CLI, library exports, and consumer site code all share
  a single preact instance at runtime.

  Before this fix, `brain.js` and `dist/site.js` each bundled their
  own copy of preact. When a standalone site repo installed its own
  `preact` dep and rendered its custom layout through the bundled
  site-builder, three different preact instances were in play:
  1. Preact inside `brain.js` (used by the site-builder's renderer)
  2. Preact inside `dist/site.js` (used by `@rizom/brain/site` imports)
  3. Preact in the consumer's `node_modules/preact` (used by the
     consumer's own JSX)

  Preact hooks rely on a module-level `options` global to bridge
  component rendering and hook state. Different instances have
  different globals, so `useContext` and friends crashed with:

      TypeError: undefined is not an object (evaluating 'D.context')
        at useContext (preact/hooks/dist/hooks.mjs:...)

  Discovered booting `apps/mylittlephoney` as the first standalone
  extraction. After fixing the `@-prefixed` package ref resolution in
  alpha.3, the site plugin loaded correctly but the first site build
  crashed deep in the renderer the moment any hook (starting with
  `Head.tsx`'s `useContext`) ran.

  Every consumer (brain init scaffold, standalone site repos) already
  has `preact` as a real dependency, so externalizing it always
  resolves at runtime. The `dist/brain.js` and `dist/site.js` sizes
  dropped by ~30KB combined as a nice side effect.

  Adds a source-level regression test in
  `packages/brain-cli/test/build-externals.test.ts` that asserts
  `preact`, `preact/hooks`, `preact/jsx-runtime`, `preact/compat`, and
  `preact-render-to-string` remain in the `sharedExternals` array of
  `scripts/build.ts`. Runtime dual-preact detection is too expensive
  for a unit test; the source check catches the exact regression
  shape (someone removes preact from externals thinking "it's small,
  bundle it").

## 0.1.1-alpha.3

### Patch Changes

- [`238269b`](https://github.com/rizom-ai/brains/commit/238269bbcf5362e9116d4644fe8953e6034de874) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: `@rizom/brain` CLI now resolves `@-prefixed` package references
  from `brain.yaml` before resolving the brain config.

  The published CLI entrypoint (`packages/brain-cli/scripts/entrypoint.ts`)
  called `resolve(definition, env, overrides)` directly, skipping the
  dynamic-import step that populates the package registry with refs from
  `site.package` and plugin config values. Brains that override
  `site.package` in `brain.yaml` would silently fall back to the brain
  definition's default site because `resolveSitePackage()` couldn't find
  their site in an empty registry.

  The dev runner (`shell/app/src/runner.ts`) already had this wiring;
  only the published path was missing it.

  Discovered booting `apps/mylittlephoney` as the first standalone
  extraction. The
  brain booted cleanly and rendered the site successfully, but the site
  was rover's default professional layout with the blue/orange palette,
  not mylittlephoney's `personalSitePlugin` with the pink theme. The
  compiled `main.css` had `--palette-brand-blue: #3921D7` instead of
  the mylittlephoney pinks.

  Extracts the import-and-register logic into
  `packages/brain-cli/src/lib/register-override-packages.ts` with a
  dependency-injected `PackageImportFn` so it's unit-testable without
  hitting the real module resolver. Wires the helper into
  `setBootFn()` in the published entrypoint. The dev runner still uses
  its own inline copy; a follow-up could dedupe.

  Exports `getPackage`, `hasPackage`, and `collectOverridePackageRefs`
  from `@brains/app` (previously only `registerPackage` was exported).

  Added 5 regression tests in
  `packages/brain-cli/test/register-override-packages.test.ts` covering:
  - site.package registration
  - plugin config ref registration
  - combined site + plugin refs in one pass
  - no-op on overrides without refs
  - swallowing import errors and continuing with remaining refs

## 0.1.1-alpha.2

### Patch Changes

- [`c00b24f`](https://github.com/rizom-ai/brains/commit/c00b24f30d8d02e2a30321f21dce08e0feec0af4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: declare tailwind runtime dependencies so the site builder's CSS
  pipeline can resolve `@import "tailwindcss"` and `@plugin
"@tailwindcss/typography"` at build time.

  The bundled `@tailwindcss/postcss` runs PostCSS against
  `plugins/site-builder/src/styles/base.css` which begins with
  `@import "tailwindcss"`. PostCSS resolves that import against the
  consumer's `node_modules/`, not against the `@rizom/brain` bundle. If
  `tailwindcss` isn't in the consumer's `node_modules`, the CSS build
  throws `Can't resolve 'tailwindcss'` during the first site build.

  Adds as regular `dependencies`:
  - `tailwindcss` (^4.1.11)
  - `@tailwindcss/postcss` (^4.1.13)
  - `@tailwindcss/typography` (^0.5.19)
  - `postcss` (^8.5.6)

  `@tailwindcss/oxide` stays in `optionalDependencies` — it's the
  native part of tailwind v4 and may fail to install on unsupported
  platforms. The pure-JS packages above always install cleanly.

## 0.1.1-alpha.1

### Patch Changes

- [`8540e31`](https://github.com/rizom-ai/brains/commit/8540e313ee27875f494388f2cf6f9ffdc79b2fe6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix: brain boot no longer eagerly loads the `sharp` native module.

  `plugins/site-builder/src/lib/image-optimizer.ts` had a top-level
  `import sharp from "sharp"` that triggered native module resolution
  when the bundle loaded. On NixOS, Alpine, distroless containers, and
  other minimal Linux environments, `sharp`'s prebuilt binaries cannot
  find `libstdc++` at standard paths and the `dlopen` fails — crashing
  the entire brain boot even on instances that removed the image
  plugin via `remove: - image` in `brain.yaml`.

  `sharp` is now loaded lazily via `import("sharp")` on first use.
  Brain instances that never process images never touch `sharp` at all.
  The image plugin still works the same way when enabled; the only
  change is the load timing.

  Adds a source-level regression test in `plugins/site-builder/test/`
  that asserts `image-optimizer.ts` never reintroduces a top-level
  runtime import of `sharp`.

## 0.1.1-alpha.0

### Patch Changes

- [`d43dbda`](https://github.com/rizom-ai/brains/commit/d43dbda701faeab85ed96320ad2691402bc0558c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - First public alpha of `@rizom/brain` — the umbrella package shipping
  the brain CLI, runtime, and all built-in brain models (rover, ranger,
  relay) as a single npm artifact.

  Highlights since project start:
  - **CLI**: `init`, `start`, `chat`, `eval`, `pin`, `tool`, plus
    `--remote` mode for talking to a running brain over MCP.
  - **`init` scaffolds the unified app shape**: `brain.yaml` +
    `package.json` (pinning `@rizom/brain` and `preact`) +
    `tsconfig.json` + `README.md` + `.gitignore` +
    optional `.env` (when `--ai-api-key` is provided). Interactive
    prompts via `@clack/prompts` with non-interactive escape hatch.
  - **Library export `@rizom/brain/site`** (Tier 1): re-exports
    `personalSitePlugin`, `PersonalLayout`, `routes`, plus the `Plugin`
    and `SitePackage` types — enough to compose a custom site package
    in a standalone brain repo. Hand-written `.d.ts` for now; see
    `docs/plans/external-plugin-api.md` for the replacement plan.
  - **Built-in brain models**: rover (general personal brain), ranger
    (collaborative — public source, no published artifact), relay
    (Rizom internal — public source, no published artifact).
  - **Runtime**: shell + entity service + job queue + ai service +
    embedding service + identity service + content pipeline +
    templates + plugin manager. SQLite-backed, separate embedding DB,
    FTS5 + vector hybrid search.
  - **Plugin types**: entity plugins, service plugins, interface
    plugins, core plugins, composite plugins (factories returning
    multiple plugins under one capability id).
  - **Interfaces**: CLI, chat REPL, MCP (stdio + HTTP), webserver,
    Discord, Matrix, A2A.
  - **Deploy**: Kamal-driven Hetzner deploys, multi-arch Docker images
    for rover via `publish-images.yml`, GitHub Actions release pipeline.

  This is an **alpha**. Expect breaking changes between alpha versions.
  Pin to a specific version, do not depend on `^0.1.0-alpha.0` resolving
  to a stable contract.

  See `docs/plans/public-release-cleanup.md` for the road from alpha
  to v0.1.0.
