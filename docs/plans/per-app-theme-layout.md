# Per-App Theme & Layout Resolution

## Problem

Currently `@brains/rover` hardcodes `theme-brutalist` and `layout-professional` as direct dependencies. Every app instance inherits them regardless of whether they're used. mylittlephoney needs `theme-mylittlephoney`, yeehaa needs `theme-yeehaa`, and future apps may need entirely different layouts.

## Current State

- Theme/layout packages live in `shared/`
- Rover's `package.json` depends on `@brains/theme-brutalist` and `@brains/layout-professional` directly
- `brain.yaml` can override `site-builder.themeCSS` to point to a different package, but the unused theme is still bundled
- No mechanism for app-level layout selection

## Proposed Solution

### 1. Move theme/layout deps from brain → app

Remove `@brains/theme-*` and `@brains/layout-*` from `brains/rover/package.json`. Instead, each app declares its own:

```json
// apps/mylittlephoney/package.json
{
  "dependencies": {
    "@brains/app": "workspace:*",
    "@brains/rover": "workspace:*",
    "@brains/theme-mylittlephoney": "workspace:*",
    "@brains/layout-professional": "workspace:*"
  }
}
```

```json
// apps/professional-brain/package.json
{
  "dependencies": {
    "@brains/app": "workspace:*",
    "@brains/rover": "workspace:*",
    "@brains/theme-brutalist": "workspace:*",
    "@brains/layout-professional": "workspace:*"
  }
}
```

### 2. Resolve via brain.yaml

`brain.yaml` already supports `site-builder.themeCSS`. Extend to also support layout:

```yaml
plugins:
  site-builder:
    themeCSS: "@brains/theme-mylittlephoney"
    layout: "@brains/layout-professional"
```

### 3. Site-builder plugin reads from config

The site-builder plugin resolves theme and layout at runtime from its plugin config rather than importing hardcoded packages.

## Work Packages

- [ ] Remove `@brains/theme-brutalist` and `@brains/layout-professional` from `brains/rover/package.json`
- [ ] Add theme + layout deps to each app's `package.json`
- [ ] Add `layout` config option to site-builder plugin
- [ ] Update site-builder to dynamically resolve theme and layout from config
- [ ] Update all existing apps' `brain.yaml` to explicitly declare theme + layout
- [ ] Verify all apps build and serve correctly
- [ ] Update docs

## mylittlephoney: Custom Layout

mylittlephoney currently uses `layout-professional` which has a hard dependency on `decks`. Long term, mylittlephoney needs its own layout (`layout-personal` or `layout-blog`) that drops the decks/portfolio routes and adds wishlist-focused pages instead.

- [ ] Create `layouts/personal/` (or `layouts/blog/`)
- [ ] Routes: home, blog, wishlist, about (no decks, no portfolio)
- [ ] Make decks an optional dependency in layout-professional (or remove entirely from new layout)
- [ ] Update mylittlephoney brain.yaml to use new layout

## Migration

1. Do all apps in one PR to avoid broken intermediate state
2. Apps that don't specify theme/layout fall back to a sensible default (current behavior)
