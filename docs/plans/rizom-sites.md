# Rizom Sites — One Site Package, Three Brain Variants

## Overview

The Rizom ecosystem has three sites that share a single brand spine: **rizom.foundation** (parent / ideology), **rizom.work** (workspace / commercial), and **rizom.ai** (agent / product). All three are built from one shared site package and one shared theme package, configured per-deployment via `brain.yaml`.

| Site                 | Variant      | Brain  | Canvas        | Accent (dark mode)    | Status     |
| -------------------- | ------------ | ------ | ------------- | --------------------- | ---------- |
| **rizom.foundation** | `foundation` | Relay  | roots         | Amber Dark `#C45A08`  | MVP target |
| **rizom.work**       | `work`       | Ranger | constellation | Amber `#E87722`       | Follow-up  |
| **rizom.ai**         | `ai`         | Ranger | tree          | Amber Light `#FFA366` | Follow-up  |

## Architecture

Spine + flavors. Everything visual, structural, and editorial that the three sites have in common lives in one place. The differences (canvas variant, accent shade, density rhythm, voice register, secondary purple) are configured per brain.

```
shared/theme-rizom/           # ONE theme — palette, type, motion vocabulary, variant CSS
sites/rizom/                  # ONE site — layouts, sections, routes, canvases
apps/rizom-foundation/        # Brain instance — declares site + variant in brain.yaml
apps/rizom-work/              # (follow-up)
apps/rizom-ai/                # (follow-up)
```

The same `@brains/site-rizom` package is loaded by all three brains. Each brain's `brain.yaml` selects its variant via a `site:` object:

```yaml
brain: relay
domain: rizom.foundation
site:
  package: "@brains/site-rizom"
  variant: foundation
```

The site plugin reads `variant` and:

- Sets `data-rizom-variant="foundation"` on the document body via a head script
- Loads the corresponding canvas (`/canvases/roots.js`)
- Registers variant-specific template defaults (hero copy, CTA verbs, mood)

The theme CSS uses `[data-rizom-variant]` attribute selectors to switch the accent shade and secondary purple. Light mode collapses all three variants to the same Amber Dark accent (per brand guide A2).

## Architectural prerequisite

The current site-builder cannot pass per-brain config to a site package's plugin factory. The fix is small and lands in a single atomic commit together with the migration of the two existing consumers.

### Current state

`shell/app/src/instance-overrides.ts`:

```ts
site: z.string().optional(); // package name only
```

`shell/app/src/brain-resolver.ts` (lines 147–149):

```ts
const sitePlugin = site.plugin({
  entityRouteConfig: site.entityRouteConfig,
});
```

The plugin factory receives only `entityRouteConfig`. Anything else from `brain.yaml` is dropped on the floor.

### Required change

Make `site:` always an object. No union, no backwards-compatibility shim — the only two in-repo consumers (`mylittlephoney`, `professional-brain`) migrate in the same commit, and there is no published `@rizom/brain` yet so no brain.yaml files exist in the wild.

**`shell/app/src/instance-overrides.ts`** — object-only schema:

```ts
site: z.object({
  package: z.string().optional(),
  variant: z.string().optional(),
  theme: z.string().optional(),
}).optional();
```

**`shell/app/src/brain-resolver.ts`** — spread the flavor fields into the plugin config:

```ts
const { package: _pkg, ...siteFlavor } = overrides?.site ?? {};

const sitePlugin = site.plugin({
  entityRouteConfig: site.entityRouteConfig,
  ...siteFlavor,
});
```

`package` is stripped before passing to the plugin (it was used at resolution time to find the package — the plugin doesn't need it). Everything else (`variant`, `theme`, future fields) flows through to the plugin's Zod-validated config schema.

### Rationale

We briefly considered a `z.union([z.string(), z.object({...})])` form for backwards compatibility, then discarded it:

- Only two in-repo apps use the string form; migration is atomic.
- No published `@rizom/brain` — zero external brain.yaml files exist.
- A union form would carry a `typeof === "string"` branch + deprecation comment forever; "later" never comes.
- Single way to express a site — future readers never wonder "is this old-style or new-style?"

## Phase 0: Brain-resolver enabler

**Files modified:** ~6, one commit

- `shell/app/src/instance-overrides.ts` — object-only `site` schema
- `shell/app/src/brain-resolver.ts` — spread the flavor fields
- `shell/app/src/override-package-refs.ts` — read `site.package` instead of `site` as a string when collecting `@-prefixed` refs to register
- `apps/mylittlephoney/brain.yaml` — `site: "@brains/site-mylittlephoney"` → `site: { package: "@brains/site-mylittlephoney" }`
- `apps/professional-brain/brain.yaml` — `site: "@brains/site-yeehaa"` → `site: { package: "@brains/site-yeehaa" }`
- `shell/app/test/instance-overrides.test.ts` + `shell/app/test/override-package-refs.test.ts` — update any test fixtures that pass `site:` as a string

**Verification:** `bun run typecheck && bun run lint && bun test` passes. `professional-brain` and `mylittlephoney` build and render identically (their active capabilities + resolved site plugin config match the pre-change snapshot byte-for-byte).

## Phase 1: Theme package

The existing `shared/theme-rizom/` is misnamed — it's actually the Ranger theme, only consumed by `sites/ranger`. Rename it to free up the `theme-rizom` name for the new brand.

### Step 1.1 — Rename existing

- `shared/theme-rizom/` → `shared/theme-ranger/`
- `package.json` name: `@brains/theme-rizom` → `@brains/theme-ranger`
- `sites/ranger/package.json` dependency rename
- `sites/ranger/src/index.ts` import path update
- `bun install` to refresh workspace links

### Step 1.2 — Create new `shared/theme-rizom/`

Modeled on `shared/theme-default/` (standalone theme using `composeTheme()` from `@brains/theme-base`).

**Token hierarchy** (per CLAUDE.md theming rules):

Palette tokens (`@layer theme`, never used directly):

- Backgrounds: `--palette-bg-deep #0D0A1A`, `--palette-bg-card #1A0A3E`
- Amber spectrum: `--palette-amber-dark #C45A08`, `--palette-amber #E87722`, `--palette-amber-light #FFA366`, `--palette-amber-glow #FFD4A8`
- Purple spectrum: `--palette-purple #6B2FA0`, `--palette-purple-light #8C82C8`, `--palette-purple-muted #818CF8`
- Light mode: `--palette-bg-light #F2EEE8`, `--palette-text-light #1A1625`

Semantic tokens (`@layer theme`):

```css
:root {
  --color-bg: var(--palette-bg-deep);
  --color-bg-card: var(--palette-bg-card);
  --color-text: #ffffff;
  --color-text-muted: rgba(255, 255, 255, 0.6);
  --color-accent: var(--palette-amber); /* default = work */
  --color-secondary: var(--palette-purple-light);
  --font-display: "Chakra Petch", system-ui, sans-serif;
  --font-body: "Barlow", system-ui, sans-serif;
  --font-label: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-nav: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "Fira Code", monospace;
}

[data-theme="light"] {
  --color-bg: var(--palette-bg-light);
  --color-text: var(--palette-text-light);
  --color-text-muted: rgba(26, 22, 37, 0.55);
  --color-accent: var(--palette-amber-dark);
  --color-secondary: var(--palette-purple);
}

[data-rizom-variant="foundation"] {
  --color-accent: var(--palette-amber-dark);
  --color-secondary: var(--palette-purple);
}
[data-rizom-variant="work"] {
  --color-accent: var(--palette-amber);
  --color-secondary: var(--palette-purple-light);
}
[data-rizom-variant="ai"] {
  --color-accent: var(--palette-amber-light);
  --color-secondary: var(--palette-purple-muted);
}
```

Component utilities (`@layer theme-override`): `.btn-primary`, `.btn-secondary`, `.badge-amber`, `.badge-purple`, `.terminal-block`, `.scroll-cue`. All reference `--color-accent` so they automatically pick up the variant.

Type stack: Chakra Petch (display), Barlow (body), Plus Jakarta Sans (labels), Space Grotesk (nav), Fira Code (mono). Loaded via Google Fonts `@import`.

## Phase 2: Site package `sites/rizom/`

Single package serving all three rizom variants. Modeled on `sites/ranger/`.

```
sites/rizom/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  # SitePackage export
    ├── plugin.ts                 # RizomSitePlugin (Zod-validated config)
    ├── routes.ts                 # Routes (same for all 3 variants)
    ├── templates.ts              # Template registry
    ├── layouts/
    │   └── default.tsx           # Layout with bg canvas wrapper
    ├── sections/
    │   ├── hero/                 # Variant-aware hero copy
    │   ├── problem/              # 3-up problem grid
    │   ├── answer/               # The "answer" section
    │   ├── products/             # Rover/Relay/Ranger cards
    │   ├── ownership/            # Ownership feature list
    │   ├── quickstart/           # Terminal block + steps
    │   ├── mission/              # Mission statement
    │   └── ecosystem/            # Ecosystem links
    └── canvases/
        ├── tree.js               # Copied from docs/design/canvases/
        ├── constellation.js
        └── roots.js
```

**`src/plugin.ts`** — `RizomSitePlugin` extends `ServicePlugin` with a Zod-validated config:

```ts
const rizomSiteConfigSchema = z.object({
  variant: z.enum(["foundation", "work", "ai"]).default("ai"),
  theme: z.string().optional(),
});

export class RizomSitePlugin extends ServicePlugin<
  typeof rizomSiteConfigSchema
> {
  async onRegister(context: ServicePluginContext) {
    const variant = this.config.variant;
    context.templates.register(this.buildTemplates(variant));
    context.headScripts?.add(
      `document.body.setAttribute('data-rizom-variant','${variant}');`,
    );
    const canvasMap = {
      foundation: "roots",
      work: "constellation",
      ai: "tree",
    };
    context.headScripts?.add(
      `<script src="/canvases/${canvasMap[variant]}.js" defer></script>`,
    );
  }
}
```

**`src/layouts/default.tsx`** — Preact layout matching `docs/design/rizom-ai.html`:

- Nav with wordmark (variant suffix from `siteInfo`)
- Side nav indicator (vertical dots)
- Sections rendered from props
- Footer
- Background canvas wrapper (`<div id="bgCanvasWrap"><canvas id="heroCanvas"/></div>`)

**`src/canvases/`** — straight copy of `docs/design/canvases/{tree,constellation,roots}.js`. Site-builder serves them as static assets at `/canvases/`.

**`src/routes.ts`** — same routes for all three variants. Routes are static; what differs is the rendered template content (variant-specific defaults from the plugin's `buildTemplates`).

## Phase 3: Wire up `apps/rizom-foundation/`

`apps/rizom-foundation/brain.yaml` already exists. Add the new `site:` object:

```yaml
brain: relay
preset: default
logLevel: info
domain: rizom.foundation
site:
  package: "@brains/site-rizom"
  variant: foundation
plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Optionally add `apps/rizom-foundation/brain-data/home.md` with foundation-specific hero copy.

## Verification

After Phase 0:

- `bun run typecheck && bun run lint && bun test` from root passes
- Build an existing app (`professional-brain`) and confirm output is unchanged

After Phase 1:

- `bun run typecheck --filter=@brains/site-ranger` passes
- Built ranger CSS output is identical to before the rename
- New `theme-rizom` compiles cleanly

After Phase 2:

- `bun run typecheck --filter=@brains/site-rizom` passes

After Phase 3 (end-to-end):

- Build `apps/rizom-foundation/` and confirm:
  - HTML body has `data-rizom-variant="foundation"`
  - `/canvases/roots.js` is loaded
  - CTA buttons render in `#C45A08`
  - Hero copy matches the foundation variant from brand guide A8
- Toggle light mode and confirm the surface flips to `#F2EEE8` and the accent collapses to `#C45A08`

## Follow-up (out of scope)

Once the MVP is shipping:

1. Create `apps/rizom-work/brain.yaml` and `apps/rizom-ai/brain.yaml` mirroring foundation with different `variant` values
2. Per-app content overrides in each app's `brain-data/`
3. Deploy rizom.foundation via Kamal
4. Deploy rizom.ai on existing Hetzner infra
5. Deploy rizom.work (Kamal)

## Risk notes

- **Theme rename**: Only `sites/ranger` consumes the existing `theme-rizom`. Rename should land in a single commit so workspace install order stays consistent.
- **brain-resolver change**: Touches `shell/app/`. Not backwards-compatible on purpose — the two in-repo `site:`-as-string consumers are migrated in the same commit, and there are no external brain.yaml files yet. Should be tested against existing apps in the same commit before relying on it.
- **Canvas script loading**: The prototype loads canvases via dynamic `<script>` injection. The site package needs site-builder to expose `src/canvases/` as static assets at `/canvases/`. Confirm site-builder's static asset handling supports this path before Phase 2 — alternative is to inline the canvas JS into the page.
- **Per-variant content**: Hero copy, taglines, and CTAs vary per variant. The plan stores variant-specific defaults in the site plugin's `buildTemplates()` method. Each app can override via `brain-data/` content files.
