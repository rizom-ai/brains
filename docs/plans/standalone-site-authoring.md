# Plan: Decouple Themes from Sites + Standalone Site Authoring

## Context

`apps/mylittlephoney` is the first standalone brain repo built against
published `@rizom/brain`. Getting it to boot revealed that the current
site/theme coupling is the wrong shape.

**Today:** `SitePackage` has a `theme: string` field. The site owns
its theme. A site is "personal layout + pink theme" baked together
at site construction time. Swapping themes means forking the site
package or hardcoding branches.

**What we want:** a site is structure (layouts, routes, plugin,
entity display). A theme is styling (CSS tokens, colors, fonts).
They are two independent inputs to the resolver, composed at resolve
time. `brain.yaml` still colocates them under `site:` for UX (users
think "my site looks like X", not "my site is X and my theme is Y"),
but the internal data model keeps them separate.

## Core change — decouple theme from site

### SitePackage type change

Drop the `theme` field from `SitePackage`:

```ts
// shell/app/src/site-package.ts
export interface SitePackage {
  layouts: Record<string, unknown>;
  routes: RouteDefinitionInput[];
  plugin: (config?: Record<string, unknown>) => Plugin;
  entityDisplay: Record<string, EntityDisplayEntry>;
  staticAssets?: Record<string, string>;
  // theme: string  ← REMOVED
}
```

`staticAssets` stays on the site because favicon / hero images /
canvas scripts are site-owned, not theme-owned. Fonts that belong
to the theme move with the theme CSS itself.

### Theme package contract

A theme package exports the **raw** CSS string (not pre-composed):

```ts
// shared/theme-mylittlephoney/src/index.ts
import rawCSS from "./theme.css" with { type: "text" };
export default rawCSS;
```

The `composeTheme()` call (which prepends `theme-base` utilities)
moves to the **resolver**. Theme packages never call it themselves.
Benefits:

- No "did I remember to compose?" footgun
- No double-composition if a theme package is accidentally composed twice
- One place to change how composition works
- `composeTheme` becomes internal to the framework, not part of the
  public theme-authoring contract

Each existing theme in the monorepo loses its `composeTheme()` wrap
in `index.ts`.

### brain.yaml schema (unchanged UX)

`brain.yaml` keeps the same nested shape. Users still write:

```yaml
site:
  package: "@scope/site-personal" # structural
  theme: "./src/theme.css" # or "@scope/theme-pink"
```

Both `site.package` and `site.theme` are resolved independently by
the CLI before `resolve()` runs. The user's mental model ("I pick a
site, I pick a theme") is preserved at the yaml level.

### Resolver flow

`resolveSitePackage` gets a sibling `resolveTheme`. Both are called
from `brain-resolver.ts`:

```ts
const site = resolveSitePackage(definition, overrides);
const themeCSS = resolveTheme(definition, overrides); // NEW

// Inject BOTH into site-builder config
pluginOverrides["site-builder"] = deepMerge(
  {
    themeCSS: composeTheme(themeCSS), // compose here, once
    routes: site.routes,
    entityDisplay: site.entityDisplay,
    layouts: site.layouts,
    staticAssets: site.staticAssets,
  },
  pluginOverrides["site-builder"] ?? {},
);
```

`resolveTheme` checks brain.yaml's `site.theme` field → theme
package registry → fallback to brain definition's default theme.

### Brain definition changes

`BrainDefinition` gains an optional `theme: string` (the default
theme package name). Today rover's definition only has `site:`; it
also declares its default theme:

```ts
// brains/rover/src/index.ts
import defaultSite from "@brains/site-default";
import defaultTheme from "@brains/theme-default";

defineBrain({
  // ...
  site: defaultSite,
  theme: defaultTheme, // NEW
});
```

Existing site packages drop their theme import and stop setting
`theme` on the returned `SitePackage`.

## Convention discovery for standalone repos

With themes decoupled, standalone repos get a flat two-file
convention:

```
~/Documents/mylittlephoney/
├── brain.yaml        # site/theme fields optional (convention picks defaults)
├── package.json      # @rizom/brain + preact
├── tsconfig.json
├── src/
│   ├── site.ts       # default export: SitePackage (no theme field)
│   └── theme.css     # raw CSS, auto-composed at resolve time
└── deploy/
```

Both files are discovered at runtime if present:

- `src/site.ts` present → use as site package (override rover's default)
- `src/theme.css` present → use as theme (override rover's default)
- Neither present → use brain definition's defaults
- Both present → use both

`brain.yaml` can override either independently:

```yaml
# Use convention site but custom theme
site:
  theme: "@scope/theme-dark"

# Use built-in personal site but local theme
site:
  package: "@rizom/brain/site/personal"
  theme: "./src/theme.css"
```

## What mylittlephoney becomes

```
~/Documents/mylittlephoney/
├── brain.yaml        # no site/theme fields (convention)
├── package.json      # @rizom/brain + preact
├── tsconfig.json
├── src/
│   ├── site.ts       # 20 lines: imports from @rizom/brain/site, exports SitePackage
│   └── theme.css     # raw pink CSS
└── deploy/
```

No sub-package. No `@brains/*` fake scope. No `composeTheme` call in
user code. No `file:./site` dep. `package.json` has two real deps.

## Priorities

### P1 — Decouple theme from site (CORE)

The architectural change that unblocks everything else.

- Drop `theme` from `SitePackage` type
- Add `theme` to `BrainDefinition` type
- Add `resolveTheme` to brain-resolver, sibling of `resolveSitePackage`
- Move `composeTheme()` call into the resolver
- Update all existing site packages (`site-default`, `site-ranger`,
  `site-rizom`, `site-yeehaa`, `site-mylittlephoney`) to drop theme
- Update all existing theme packages to export raw CSS
- Update brain definitions (rover, ranger, relay) to declare theme
- Update `@rizom/brain/themes` exports if shape changes
- Publish as alpha

**Effort:** ~3 hours. Mostly touching existing workspace packages.

### P2 — Convention discovery for `src/site.ts` and `src/theme.css`

Once themes are decoupled, auto-discovery is trivial.

- `registerConventionalSite(cwd)` — check `<cwd>/src/site.ts`, import,
  register in package registry under synthetic key
- `registerConventionalTheme(cwd)` — check `<cwd>/src/theme.css`,
  read as text, register in package registry under synthetic key
- Wire both into `setBootFn` in the brain-cli entrypoint
- Resolver picks them up via the existing registry lookup path

**Effort:** ~1 hour.

### P3 — `brain init` scaffolds both convention files

`brain init` scaffolds `src/site.ts` + `src/theme.css`, but only after the
public site-authoring surface is broad enough to scaffold against.
That means P4 lands first.

The scaffold should emit:

- `src/site.ts` built on the stable `@rizom/brain/site` authoring API
- `src/theme.css` with an empty palette / semantic-token comment block
- no `@brains/*` imports, no sub-package hack, no manual composition step

**Effort:** ~1 hour (two template strings + tests).

### P4 — widen `@rizom/brain/site` for standalone authoring

Before scaffolding files, the public site entry needs to cover both site
shapes we actually ship.

This priority adds:

- `professionalSitePlugin`
- `ProfessionalLayout`
- any small helper/factory surface needed to make `src/site.ts`
  concise and stable for both personal and professional sites

This keeps `brain init` from generating code against an incomplete
public API.

**Effort:** ~30–60 min.

### Dropped

- ~~Site package factory with theme config parameter~~ — obsolete
  after P1. Themes are resolver-level, not site-level, so the factory
  doesn't need to know about them.
- ~~Broadening `isScopedPackageRef` to bare names~~ — moot after P2.
  The convention gives consumers a way to ship local files without
  needing a package name at all.

## Recommended ordering

1. **P1 first** (decouple). Biggest architectural change, unblocks
   everything.
2. **P2** (convention). Trivial after P1.
3. **P4** (public site-authoring surface). Needed before scaffolded
   `src/site.ts` can target a stable API.
4. **P3** (scaffold). Emit files only after the authoring surface is ready.

Total estimated effort: **~5 hours** including alpha publish cycles
and mylittlephoney retrofit.

## Validation

Each priority lands with:

- Failing tests written first (TDD)
- `@rizom/brain` alpha bump and publish
- mylittlephoney migrated to the new pattern
- Boot verified end-to-end (correct site plugin active, correct
  palette in compiled CSS)

Phase 1 of `docs/plans/harmonize-monorepo-apps.md` stays "in
progress" until P1–P3 land AND mylittlephoney has run with real
content long enough to catch edge cases not hit during the initial
extraction.

## Non-goals

- **Runtime theme switching** — themes are resolved at boot, not
  hot-swapped. A brain instance has one theme active per process.
  Users who want multi-theme can run multiple brain instances on
  different ports with different brain.yaml files.
- **Theme tokens in brain.yaml** — individual token overrides
  (`--color-brand: #ff00ff`) are not supported via yaml. Theme is
  pick-from-list OR local-file, not composed at the token level.
- **Per-route themes** — one theme per brain instance. Different
  routes cannot use different themes.

## Status

- [x] P1: Decouple theme from site
  - [x] Drop `theme` field from `SitePackage`
  - [x] Add `theme` field to `BrainDefinition`
  - [x] Add `resolveTheme` to brain-resolver
  - [x] Move `composeTheme()` into the resolver
  - [x] Update `site-default`, `site-ranger`, `site-rizom`,
        `site-yeehaa`, `site-mylittlephoney`
  - [x] Update all theme packages to export raw CSS
  - [x] Update rover / ranger / relay brain definitions
  - [x] Publish alpha
- [x] P2: Convention discovery for `src/site.ts` + `src/theme.css`
  - [x] Register local `src/site.ts` and `src/theme.css` under synthetic package refs
  - [x] Apply the convention only when `site.package` / `site.theme` are omitted
  - [x] Support both bundled CLI boot and generated static entrypoints
- [ ] P3: `brain init` scaffolds both files
- [x] P4: widen `@rizom/brain/site` for standalone authoring
  - [x] expose professional site symbols alongside the personal ones
  - [x] keep the public API concentrated under `@rizom/brain/site`
- [ ] mylittlephoney retrofit to the new shape
