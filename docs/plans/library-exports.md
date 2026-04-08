# Plan: Library Exports for `@rizom/brain`

## Context

Today `@rizom/brain` only exports `./cli` (the binary). The bundled
`dist/brain.js` contains the entire framework runtime, but none of it
is exposed for external code to import. Anyone who wants to write code
that uses the brain framework — a custom site package, an external
plugin, a brain definition for a standalone instance — has no way to
import the types, base classes, or runtime helpers they need.

This blocks two concrete use cases:

1. **Standalone brain instances** (e.g. extracting `apps/mylittlephoney`
   to its own repo). The site code needs to import layouts, plugin
   types, and `SitePackage` from somewhere. Today those live in
   workspace packages (`@brains/layout-personal`, `@brains/plugins`,
   `@brains/app`) that aren't published independently and aren't
   reachable from outside the monorepo.

2. **External plugins** (the `external-plugin-api` plan). Plugin
   authors need access to `EntityPlugin`, `ServicePlugin`,
   `InterfacePlugin` base classes, plus the context types and Zod
   helpers. Same blocker.

This plan adds library exports to `@rizom/brain` in three tiers,
shipping the smallest tier first to unblock immediate use cases and
expanding only when real consumers need it.

## Non-goals

- **Publishing each `@brains/*` package separately to npm.** That
  multiplies the maintenance surface and forces every internal change
  to consider external API stability. The `@rizom/brain` umbrella
  package is the one published artifact and the one stable API.
- **Changing `@brains/*` packages from `private: true` to public.**
  They stay private workspace members. The umbrella package re-exports
  what's needed.
- **Tree-shaking**. Each subpath gets its own bundle. If a consumer
  imports from `@rizom/brain/site`, they get the whole site bundle.
  This is fine because consumers will use one or two subpaths total,
  and bundle sizes for site/plugin/util surfaces are small.

## Three tiers

The export surface is built up incrementally. Each tier is shippable
on its own. We commit to a tier only when a real consumer needs it.

### Tier 1 — Minimum (unblocks `apps/mylittlephoney` extraction)

One subpath:

| Subpath             | Exports                                                                                 | Consumer                       |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| `@rizom/brain/site` | `personalSitePlugin`, `PersonalLayout`, `routes`, `Plugin`, `SitePackage`, layout types | mylittlephoney standalone site |

Note: standalone site authoring later widened this same subpath with the professional symbols too, instead of creating a separate subpath. The public surface stays concentrated under `@rizom/brain/site`.

Approximately 6 named exports. One additional bundle entry. Enough to
make the mylittlephoney site code build outside the monorepo.

**Effort:** ~1.5 hours (bundle entry + exports map + .d.ts + smoke test).

### Tier 2 — Medium (covers all site / theme authoring)

Two more subpaths:

| Subpath                | Exports                                                             | Consumer                                 |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| `@rizom/brain/site`    | Tier 1 base plus named personal/professional site authoring symbols | Any standalone site repo                 |
| `@rizom/brain/themes`  | `composeTheme`, `theme-base` utilities, theme primitive types       | Custom theme authoring                   |
| `@rizom/brain/plugins` | Base `Plugin` interface, `PluginCapabilities`, content/render types | Site code that interacts with plugin API |

**Effort:** ~half day on top of Tier 1.

**Trigger:** Second standalone site repo, or first user asking for
site/theme authoring docs.

### Tier 3 — Full (covers external plugin authoring)

Adds the surface needed by the external-plugin-api plan:

| Subpath                   | Exports                                                                                          | Consumer                 |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| `@rizom/brain/entities`   | `EntityPlugin` base class, `EntityPluginContext`, `IEntityService`, `BaseEntity`, schema helpers | Entity plugin authors    |
| `@rizom/brain/services`   | `ServicePlugin` base class, `ServicePluginContext`, `IJobsNamespace`, job handler base           | Service plugin authors   |
| `@rizom/brain/interfaces` | `InterfacePlugin` base class, `InterfacePluginContext`, message handling helpers                 | Interface plugin authors |
| `@rizom/brain/utils`      | `Logger`, `z` (re-exported zod), `slugify`, frontmatter helpers, error helpers                   | All authors              |
| `@rizom/brain/templates`  | `Template` interface, `RenderContext`, datasource helpers                                        | Site / template authors  |

**Effort:** ~1-2 days on top of Tier 2.

**Trigger:** External plugin loading lands (per `external-plugin-api.md`),
or first community plugin in development.

## Implementation approach

For each tier, the work has the same shape:

1. **Add a new entrypoint file** in `packages/brain-cli/src/entries/`
   (e.g. `site.ts`, `themes.ts`, `plugins.ts`). Each entry just
   re-exports from the relevant `@brains/*` workspace packages.

2. **Update `packages/brain-cli/scripts/build.ts`** to bundle each
   entry as a separate `dist/<name>.js`. Use `Bun.build` with the same
   externals as the CLI bundle. Each subpath bundle includes its full
   dep tree (no shared chunks; chunks are nice in theory but add
   complexity).

3. **Generate `.d.ts` files** for each entry.

   **Current approach (TEMPORARY):** hand-write a `.d.ts` next to
   the entry file (in `src/types/<name>.d.ts`, separate dir from the
   runtime entry in `src/entries/<name>.ts` so TypeScript doesn't
   shadow one with the other) and copy it to `dist/` verbatim from
   the build script. This is curated as a deliberate public API
   contract — inline types, no internal name leakage.

   **Why hand-written:** both auto-bundlers we tried failed.
   `dts-bundle-generator` chokes on loosely-typed code in
   `@brains/job-queue` (`Cannot find symbol for node`). `rollup-plugin-dts`
   with `external: () => false` tries to inline 700+ source files and
   produces `MISSING_EXPORT` errors deep in the workspace graph.
   Forcing it to respect externals just produces a thin wrapper that
   re-exports `@brains/*`, which doesn't help consumers because those
   packages aren't published.

   **Replacement plan:** when the type graph stabilizes (post-v0.1.0)
   and a robust .d.ts bundling story exists — likely Microsoft
   `api-extractor` with curated entry points, or first-party tooling
   from bun — the hand-written files are deleted and the build script
   generates them automatically. Until then the sync rule (update the
   .d.ts in the same commit as a public API change) is documented at
   the top of every hand-written .d.ts file.

4. **Update `package.json` exports map** with the new subpath:

   ```jsonc
   "exports": {
     "./cli": "./dist/brain.js",
     "./site": {
       "import": "./dist/site.js",
       "types": "./dist/site.d.ts"
     }
   }
   ```

5. **Add `dist/<name>.js` and `dist/<name>.d.ts` to the `files` array**
   so npm publish includes them.

6. **Smoke test** each subpath by importing from a sibling test
   directory, checking the imports resolve and types check.

## File layout after implementation

```
packages/brain-cli/
├── src/
│   ├── index.ts              # CLI source (existing)
│   ├── entries/              # Runtime re-export entries
│   │   ├── site.ts           # Tier 1 — runtime re-exports
│   │   ├── themes.ts         # Tier 2
│   │   ├── plugins.ts        # Tier 2
│   │   ├── entities.ts       # Tier 3
│   │   ├── services.ts       # Tier 3
│   │   ├── interfaces.ts     # Tier 3
│   │   ├── utils.ts          # Tier 3
│   │   └── templates.ts      # Tier 3
│   ├── types/                # Hand-written public API contracts (TEMPORARY)
│   │   ├── site.d.ts         # Tier 1
│   │   ├── themes.d.ts       # Tier 2
│   │   ├── plugins.d.ts      # Tier 2
│   │   └── ... (one per entry)
│   └── ... (existing)
├── scripts/
│   ├── build.ts              # Bundles entries + copies hand-written .d.ts
│   └── entrypoint.ts         # CLI entrypoint (existing)
└── dist/
    ├── brain.js              # CLI bundle (existing)
    ├── site.js               # Tier 1 (bundled from src/entries/site.ts)
    ├── site.d.ts             # Tier 1 (copied from src/types/site.d.ts)
    ├── themes.js             # Tier 2
    ├── themes.d.ts           # Tier 2
    └── ... (one .js + .d.ts per tier)
```

**Why entries/ and types/ are separate dirs:** if the runtime entry
(`src/entries/site.ts`) and the type contract (`src/types/site.d.ts`)
live in the same directory with the same base name, TypeScript's
project resolution shadows the .d.ts with the .ts and ESLint can't
find the .d.ts in any project. Splitting them by directory keeps
both files visible to tooling.

## Bundle size impact

Rough estimates per subpath bundle:

| Subpath              | Estimated size |
| -------------------- | -------------- |
| `dist/site.js`       | ~500-800 KB    |
| `dist/themes.js`     | ~50-100 KB     |
| `dist/plugins.js`    | ~30-50 KB      |
| `dist/entities.js`   | ~200-400 KB    |
| `dist/services.js`   | ~150-300 KB    |
| `dist/interfaces.js` | ~100-200 KB    |
| `dist/utils.js`      | ~30-60 KB      |
| `dist/templates.js`  | ~50-100 KB     |

Total dist/ growth at full tier: ~1-2 MB on top of the existing
6 MB CLI bundle. Acceptable.

## Migration consumer for Tier 1

Once Tier 1 ships, `apps/mylittlephoney` is extractable:

1. Create new repo `rizom-ai/mylittlephoney` (private)
2. Copy `apps/mylittlephoney/`, `sites/mylittlephoney/src/`,
   `shared/theme-mylittlephoney/src/` into the new repo, flattened
3. Update site code to import from `@rizom/brain/site` instead of
   `@brains/layout-personal`, `@brains/plugins`, `@brains/app`
4. New repo has one `package.json` with `@rizom/brain` as a git-ref
   dependency
5. Verify it builds and the brain CLI can boot the brain
6. Delete the three directories from the brains monorepo
7. Verify the brains monorepo still builds without them

## Open questions

- **Should `dist/site.js` include react-jsx runtime helpers?** The
  layouts use Preact JSX and the consuming site code does too. The
  consumer needs `jsxImportSource: "preact"` in their tsconfig, plus
  Preact in their deps. Document this in the README of the new export.

- **How does the consumer get Preact at runtime?** Either bundled into
  `@rizom/brain/site` (simple but locks the consumer to our Preact
  version) or as a peer dep (consumer installs preact themselves).
  Peer dep is the conventional answer.

- **Source maps for the library bundles?** Yes — generate sourcemaps
  for the .js files so consumers get reasonable stack traces. Add
  `sourcemap: "linked"` or `"external"` to the build call.

## Timeline

| Phase                                      | Effort     | When                                |
| ------------------------------------------ | ---------- | ----------------------------------- |
| Tier 1 implementation                      | ~1.5 hours | Now                                 |
| Extract `apps/mylittlephoney` using Tier 1 | ~half day  | Right after Tier 1                  |
| Tier 2 implementation                      | ~half day  | When 2nd standalone site repo lands |
| Tier 3 implementation                      | ~1-2 days  | When external plugin loading lands  |

## Status

- [x] Plan written
- [x] Tier 1 implemented (hand-written .d.ts, runtime bundle via `Bun.build`)
- [x] `@rizom/brain/themes` (Tier 2 partial) — `composeTheme`
      re-exported from `@brains/theme-base`. Needed by the
      `apps/mylittlephoney` extraction which hit a tailwind
      `Cannot apply unknown utility class` crash because the site
      build bypassed `composeTheme` and lost the shared base
      utilities layer that exposes `--color-brand` / `--color-bg`
      to the tailwind JIT.
- [ ] `apps/mylittlephoney` extracted (in progress, blocked on the
      themes export above)
- [ ] Rest of Tier 2 (`@rizom/brain/plugins` — base Plugin type
      etc.) still deferred
- [ ] Tier 3 implemented (deferred)
- [ ] Hand-written .d.ts files replaced by auto-generation (deferred)
