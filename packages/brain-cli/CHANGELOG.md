# @rizom/brain

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
