# Plan: Layout Package Override via brain.yaml

## Context

Mylittlephoney uses the rover brain model but needs a different site layout (personal instead of professional). Currently, rover hardcodes `ProfessionalLayout`, `professionalSitePlugin`, and professional routes. The theme is already overridable via brain.yaml package resolution (`site-builder.themeCSS: "@brains/theme-mylittlephoney"`), but layouts are not.

The goal: swap the entire layout system with one brain.yaml line:

```yaml
plugins:
  site-builder:
    layoutPackage: "@brains/layout-personal"
```

No changes to the rover brain definition needed. New layouts can be created as independent packages.

## Design

### Layout package contract

Each layout package exports a `layoutConfig` object:

```typescript
export const layoutConfig = {
  layout: PersonalLayout, // LayoutComponent — the page shell
  routes: personalRoutes, // RouteDefinitionInput[] — pages to build
  onRegister: async (context: ServicePluginContext) => {
    // Register datasources, templates, schema extensions
    // (same code currently in PersonalSitePlugin.onRegister)
  },
};
```

This replaces the need for a separate site plugin class. The layout package is fully self-contained.

### Package resolution flow

1. brain.yaml: `site-builder.layoutPackage: "@brains/layout-personal"`
2. Package resolution: string `"@brains/layout-personal"` → resolved to the package's **default export**
3. Site-builder receives the resolved `layoutConfig` object in `this.config.layoutPackage`
4. During `onRegister()`, site-builder:
   - Calls `layoutPackage.onRegister(context)` — layout registers its own datasources/templates
   - Uses `layoutPackage.routes` instead of `this.config.routes`
   - Uses `layoutPackage.layout` as the `default` layout

### What changes for rover

Nothing. Rover keeps its current `professionalSitePlugin` and `ProfessionalLayout` as defaults. When brain.yaml provides `layoutPackage`, the site-builder overrides the defaults with the package's values. When no `layoutPackage` is specified (yeehaa.io), everything works as before.

The only rover change: the `professionalSitePlugin` capability entry becomes optional — brain.yaml can disable it via the `disable` list when using a different layout package.

### Route layout key

Both layout packages standardize on `layout: "default"` in their routes. Personal routes updated from `"personal"` to `"default"`.

## Changes

### 1. Define layout package contract type

Add a `LayoutPackageConfig` type to site-builder's config:

```typescript
interface LayoutPackageConfig {
  layout: LayoutComponent;
  routes: RouteDefinitionInput[];
  onRegister: (context: ServicePluginContext) => Promise<void>;
}
```

**File:** `plugins/site-builder/src/config.ts`

### 2. Add `layoutPackage` to site-builder config schema

```typescript
layoutPackage: z.any().optional();
```

**File:** `plugins/site-builder/src/config.ts`

### 3. Site-builder reads layoutPackage in onRegister

In `onRegister()`, before existing route/template registration:

```typescript
if (this.config.layoutPackage) {
  const pkg = this.config.layoutPackage as LayoutPackageConfig;
  // Let the layout register its own datasources, templates, schema extensions
  await pkg.onRegister(context);
  // Override routes and default layout
  this.config.routes = pkg.routes;
  this.layouts = { ...this.layouts, default: pkg.layout };
}
```

**File:** `plugins/site-builder/src/plugin.ts`

### 4. Update layout-personal to export layoutConfig

Move `PersonalSitePlugin.onRegister()` logic into a standalone function. Export `layoutConfig` as the **default export** (replacing routes-only default).

```typescript
export const layoutConfig = {
  layout: PersonalLayout,
  routes,
  onRegister: async (context: ServicePluginContext) => {
    // existing PersonalSitePlugin.onRegister() body
  },
};
export default layoutConfig;
```

**File:** `layouts/personal/src/index.ts`

### 5. Update layout-professional to export layoutConfig (same pattern)

For consistency and so professional layout can also be used as a package ref.

**File:** `layouts/professional/src/index.ts`

### 6. Update personal routes to use `layout: "default"`

Change `layout: "personal"` to `layout: "default"` in route definitions.

**File:** `layouts/personal/src/routes.ts`

### 7. Update mylittlephoney brain.yaml

```yaml
disable:
  - professional-site # don't need the professional datasources/templates

plugins:
  site-builder:
    themeCSS: "@brains/theme-mylittlephoney"
    layoutPackage: "@brains/layout-personal"
```

**File:** `apps/mylittlephoney/brain.yaml`

### 8. Add @brains/layout-personal to mylittlephoney deps

So the package resolution can import it.

**File:** `apps/mylittlephoney/package.json`

## Files

| File                                 | Action                                                 |
| ------------------------------------ | ------------------------------------------------------ |
| `plugins/site-builder/src/config.ts` | Add `LayoutPackageConfig` type + `layoutPackage` field |
| `plugins/site-builder/src/plugin.ts` | Read `layoutPackage` in onRegister, call hook          |
| `layouts/personal/src/index.ts`      | Export `layoutConfig` as default                       |
| `layouts/professional/src/index.ts`  | Export `layoutConfig` as default (consistency)         |
| `layouts/personal/src/routes.ts`     | Change `layout: "personal"` → `layout: "default"`      |
| `apps/mylittlephoney/brain.yaml`     | Add `layoutPackage` + disable `professional-site`      |
| `apps/mylittlephoney/package.json`   | Add `@brains/layout-personal` dep                      |

## Verification

1. `bun run typecheck` — no errors
2. `bun run lint` — clean
3. Professional-brain: `bun start` — renders professional layout (no regression)
4. Mylittlephoney: `bun start` — renders personal layout with correct theme
5. Both sites build with correct routes, templates, and datasources
