# Product Brain — Marketing Site for the Brains Platform

## Context

The Brains platform needs a marketing site at `brains.rizom.ai` to showcase the product. A `shared/product-site-content/` package already exists with purpose-built marketing templates (hero, features, products, CTA) but no brain app wires it up. This plan creates a minimal product brain app + a new theme with its own visual identity.

## What Already Exists (reuse, don't rebuild)

| Package                        | What it provides                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `shared/product-site-content/` | Templates (hero, features, products, CTA, footer, metadata), routes, DefaultLayout — **will be redesigned** |
| `plugins/site-builder/`        | Site generation — accepts `templates`, `routes`, `layouts`, `themeCSS` in config                            |
| `shared/theme-default/`        | Reference theme to fork for `theme-product`                                                                 |

## Files to Create

### 1. Theme: `shared/theme-product/`

Fork of `theme-default` with a teal/orange palette (instead of blue/orange). Same fonts (Plus Jakarta Sans + Space Grotesk) for brand consistency.

| File                                  | Based on                                               |
| ------------------------------------- | ------------------------------------------------------ |
| `shared/theme-product/package.json`   | `shared/theme-default/package.json`                    |
| `shared/theme-product/tsconfig.json`  | `shared/theme-default/tsconfig.json`                   |
| `shared/theme-product/src/index.ts`   | `shared/theme-default/src/index.ts`                    |
| `shared/theme-product/src/types.d.ts` | `shared/theme-default/src/types.d.ts`                  |
| `shared/theme-product/src/theme.css`  | `shared/theme-default/src/theme.css` with palette swap |

**Palette changes** (structural CSS stays identical):

| Token         | Default            | Product                 |
| ------------- | ------------------ | ----------------------- |
| Brand primary | `#3921D7` (blue)   | `#0d9488` (teal)        |
| Brand dark    | `#2E007D`          | `#134e4a`               |
| Brand darkest | `#0E0027`          | `#042f2e`               |
| Pattern dot   | `#6366f1`          | `#2dd4bf`               |
| Accent        | `#E7640A` (orange) | `#f97316` (warm orange) |
| Accent dark   | `#c2410c`          | `#ea580c`               |
| Light tint    | `#A8C4FF`          | `#99f6e4`               |
| Warm bg       | `#FFEFDA`          | `#f0fdfa`               |

### 2. Redesign: `shared/product-site-content/` templates

The existing templates are generic and outdated. Each layout component will be redesigned using the **frontend-design skill** for a distinctive, polished marketing aesthetic. Schemas, formatters, and template wiring stay as-is — only the visual layouts change.

**Files to redesign** (using frontend-design skill for each):

| File                             | Current state                                          | Redesign focus                                             |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `src/hero/layout.tsx`            | Generic gradient + animated blobs                      | Bold, modern hero with strong visual hierarchy             |
| `src/features/layout.tsx`        | Standard 3-column card grid                            | Distinctive feature showcase, avoid generic SaaS look      |
| `src/products/layout.tsx`        | Basic card grid with status badges                     | Product cards with personality and clear differentiation   |
| `src/cta/layout.tsx`             | Dark gradient background CTA                           | Compelling, high-converting CTA section                    |
| `src/footer/layout.tsx`          | Minimal nav links + hardcoded "Rizom Brains" copyright | Clean footer, remove hardcoded company name (use siteInfo) |
| `src/layouts/default-layout.tsx` | Flex column wrapper                                    | Review for proper section flow/spacing                     |

**What stays unchanged**:

- All `schema.ts` files (data structures are fine)
- All `formatter.ts` files (content formatting is fine)
- All `index.ts` template definitions
- `routes.ts` (single landing page route)
- All `prompt.txt` files (AI prompts)

**Constraints for redesign**:

- Must use **theme tokens** (`bg-theme`, `text-brand`, etc.) — no hardcoded colors
- Must use **Preact JSX** (not React)
- Must use **Tailwind CSS v4** utility classes
- Must accept the same props (schema-driven data)
- Icons from **lucide-preact** library
- Buttons from **@brains/ui-library** (`LinkButton`, `Card`, `StatusBadge`)

### 3. App: `apps/product-brain/`

| File                                 | Purpose                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `apps/product-brain/package.json`    | Dependencies: app, system, mcp, webserver, directory-sync, site-builder, product-site-content, theme-product |
| `apps/product-brain/tsconfig.json`   | Standard brain tsconfig                                                                                      |
| `apps/product-brain/brain.config.ts` | Brain config (see below)                                                                                     |
| `apps/product-brain/.env`            | ANTHROPIC_API_KEY, DOMAIN, PREVIEW_DOMAIN                                                                    |

**brain.config.ts** — 5 plugins only:

```typescript
plugins: [
  new SystemPlugin({}),
  new MCPInterface({}),
  directorySync({ seedContent: true, initialSync: true }),
  new WebserverInterface({ ... }),
  siteBuilderPlugin({
    templates,        // from @brains/product-site-content
    routes,           // from @brains/product-site-content
    layouts: { default: DefaultLayout },
    themeCSS: productTheme,  // from @brains/theme-product
  }),
]
```

**Deployment**: `brains.rizom.ai` / `preview.brains.rizom.ai`, Bunny CDN.

### 4. Seed Content: `apps/product-brain/seed-content/`

Three markdown entities for AI content generation:

| File                     | Content                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `identity/identity.md`   | Name: Brains, Role: Product platform, Purpose: AI-powered knowledge management |
| `profile/profile.md`     | Description of Brains platform, links to GitHub/LinkedIn/email                 |
| `site-info/site-info.md` | Title, description, CTA heading/button for the landing page                    |

The site-builder's AI generates hero/features/products/CTA content from these seed entities at build time.

## Implementation Order

1. Create `shared/theme-product/` (5 files — fork of theme-default with palette swap)
2. Redesign `shared/product-site-content/` templates (6 layout files — using frontend-design skill)
3. Create `apps/product-brain/` (4 files — brain.config, package.json, tsconfig, .env)
4. Create `apps/product-brain/seed-content/` (3 markdown files)
5. `bun install` to register new workspace packages
6. `bun run typecheck` to verify

## Verification

```bash
bun install                           # register new packages
bun run typecheck                     # all 62+ packages pass
bun run lint                          # no new errors
cd apps/product-brain && bun run dev  # start the brain
# Trigger site build via MCP or CLI, preview at localhost:4321
```
