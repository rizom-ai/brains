# @rizom/brain

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
  extraction (Phase 1 of `docs/plans/harmonize-monorepo-apps.md`). The
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
    `docs/plans/library-exports.md` for the replacement plan.
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
