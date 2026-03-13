# Layouts Workspace — Extracting Site Compositions from Plugins

**Date**: 2026-03-13
**Status**: Proposed
**Related**: #2 Cross-Plugin Dependencies from comprehensive refactor plan

---

## Problem

`professional-site` lives in `plugins/` but isn't a plugin in the same sense as `blog`, `decks`, or `notes`. Those are **capabilities** — they provide entity types, tools, generation handlers, and content management. `professional-site` is a **layout** — it arranges and composes entities from other plugins into pages for web presentation.

This mismatch causes:

- **Architectural violations**: The `no-plugin-to-plugin-imports` dependency-cruiser rule flags `professional-site → blog/decks` imports as errors. But these imports are _intentional_ — a layout _should_ know about the content types it arranges.
- **Conceptual confusion**: `professional-site` sits alongside `blog` and `decks` in `plugins/`, implying they're the same kind of thing. They aren't.
- **Artificial constraints**: Efforts to eliminate the cross-plugin imports lead to duplicated schemas or over-abstracted generic types — solving a problem that only exists because of the wrong categorization.

## Insight

The dependency isn't wrong. The categorization is. A layout is a legitimate consumer of plugin content types — it makes editorial decisions about what content goes where and how it's presented. It just shouldn't _be_ a plugin.

## Why "layouts"?

The package defines the **editorial layout** of a brain's web presence — not just visual arrangement, but the compositional decisions about what pages exist, what content appears on each, and how it's all structured. Like a newspaper layout: it's the intentional arrangement of content, not just the grid.

What the package uniquely provides:

- **Page definitions** (templates) — what pages exist (homepage, about, subscribe)
- **Data composition** (datasources) — which entities appear on which page
- **Page chrome** (layout components) — header, footer, navigation structure
- **Brain-specific components** — CTASection, CompactHeader

What it does NOT provide (lives elsewhere):

- Build engine → site-builder
- Styling/tokens → theme packages
- UI components → ui-library
- Entity types, tools, generation → plugins

Other workspace names considered and rejected:

- `sites/` — overclaims; the site is composed across many packages (builder, themes, UI)
- `pages/` — describes the output (pages) rather than the intent (arranging content)
- `views/` — conflicts with template terminology
- `themes/` — already used for CSS packages
- `frontends/` — implies a separate SPA

## Solution

Introduce a `layouts/` workspace category for brain-specific content composition packages.

### New directory structure

```
layouts/
  professional/                ← @brains/layout-professional (moved from plugins/)
    package.json
    src/
      plugin.ts                ← Still extends ServicePlugin (for template/datasource registration)
      config.ts
      templates/
        homepage-list.tsx
        about.tsx
        subscribe-result.tsx
      datasources/
        homepage-datasource.ts
        about-datasource.ts
      components/
        CTASection.tsx
        CompactHeader.tsx
      layouts/
        ProfessionalLayout.tsx
      schemas/
        professional-profile.ts
        index.ts
      index.ts
    test/
    tsconfig.json
```

### What changes

| What                    | Before                          | After                                   |
| ----------------------- | ------------------------------- | --------------------------------------- |
| Location                | `plugins/professional-site/`    | `layouts/professional/`                 |
| Package name            | `@brains/professional-site`     | `@brains/layout-professional`           |
| Workspace               | `plugins/*`                     | `layouts/*`                             |
| Imports `@brains/blog`  | ❌ Dependency-cruiser violation | ✅ Legitimate (layouts compose plugins) |
| Imports `@brains/decks` | ❌ Dependency-cruiser violation | ✅ Legitimate                           |

### What stays the same

- **Internal code**: All source files stay identical. No refactoring needed.
- **Plugin mechanism**: Still extends `ServicePlugin`, still registers templates/datasources via context. The plugin system is the _mechanism_, not the _identity_.
- **Brain import**: `brains/rover` still imports and uses it the same way, just from a different package name.
- **Test infrastructure**: Same test setup, same mocks.

## Execution Steps

### 1. Add `layouts/*` workspace

```json
// package.json
{
  "workspaces": [
    "shell/*",
    "shared/*",
    "plugins/*",
    "interfaces/*",
    "brains/*",
    "layouts/*",
    "apps/*"
  ]
}
```

### 2. Move the directory

```bash
mkdir -p layouts
mv plugins/professional-site layouts/professional
```

### 3. Update package name

In `layouts/professional/package.json`:

- `"name": "@brains/professional-site"` → `"name": "@brains/layout-professional"`
- Update description

### 4. Update consumer imports

In `brains/rover/package.json`:

- `"@brains/professional-site": "workspace:*"` → `"@brains/layout-professional": "workspace:*"`

In `brains/rover/src/index.ts`:

- `from "@brains/professional-site"` → `from "@brains/layout-professional"`

### 5. Update dependency-cruiser config

Add a rule allowing `layouts/` to import from `plugins/`:

```javascript
{
  name: "layouts-can-import-plugins",
  severity: "info",
  comment: "Layouts are composition layers that legitimately depend on plugin content types",
  from: { path: "^layouts/" },
  to: { path: "^plugins/" },
}
```

Add a rule preventing `plugins/` from importing `layouts/`:

```javascript
{
  name: "no-plugin-to-layout-imports",
  severity: "error",
  comment: "Plugins must not depend on layout compositions",
  from: { path: "^plugins/" },
  to: { path: "^layouts/" },
}
```

### 6. Update Turborepo config (if needed)

Check `turbo.json` for any layout-specific pipeline config that needs to include `layouts/*`.

### 7. Install dependencies

```bash
bun install
```

### 8. Verify

- `bun run typecheck` — all 60+ tasks pass
- `bun run test` — all 3045+ tests pass
- `bun run lint` — all 56 tasks pass, 0 warnings
- Dependency-cruiser no longer flags cross-plugin imports

## Future: Other Layouts

When more brain-specific compositions are created, they follow the same pattern:

```
layouts/
  professional/     ← @brains/layout-professional (for rover/professional brain)
  collective/       ← @brains/layout-collective (for collective brain)
  team/             ← @brains/layout-team (for relay/team brain)
```

Each layout:

- Lives in `layouts/`
- Imports freely from the plugins it composes
- Registers templates/datasources via the plugin system
- Can be used by any brain that wants that editorial arrangement

## What This Does NOT Change

- No new abstractions or base classes
- No changes to the plugin system
- No changes to the site-builder or template registration
- No changes to how brains define capabilities
- No runtime behavior changes whatsoever

## Estimated Effort

**Trivial** — directory move, package rename, 3 import updates, workspace config. ~15 minutes.
