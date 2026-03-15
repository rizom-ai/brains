# brain.yaml Package Resolution

## Status: Planning

## Problem

brain.yaml can override plugin config values (strings, numbers, booleans), but can't reference packages. Themes, layouts, and seed content are JavaScript/CSS modules that need to be imported at runtime. Currently these are hardcoded in the brain definition code.

A mylittlephoney instance should be able to say:

```yaml
plugins:
  site-builder:
    theme: "@brains/theme-mylittlephoney"
```

And have the runner resolve that package name to a CSS string before passing it to the plugin.

## Current State

Themes are imported statically in the brain definition:

```ts
// brains/rover/src/index.ts
import yeehaaTheme from "@brains/theme-brutalist";

// Later, in plugin config:
themeCSS: yeehaaTheme,  // This is a CSS string
```

brain.yaml plugin overrides only support scalars:

```yaml
plugins:
  site-builder:
    productionPort: 9090 # number — works
    theme: ??? # package reference — doesn't work
```

## Design

### Resolution Protocol

Values in brain.yaml that start with `@` are treated as package references. The runner resolves them via dynamic import before passing config to plugins.

```
@brains/theme-mylittlephoney  →  import("@brains/theme-mylittlephoney")  →  default export (CSS string)
```

### Resolution Flow

1. Parse brain.yaml (already done — `fromYaml` + Zod + env interpolation)
2. **New step:** Walk plugin overrides, find values starting with `@`
3. For each, `await import(packageName)` and replace the value with the default export
4. Pass resolved config to plugin construction (existing flow)

### Implementation

Add a `resolvePackageRefs` function in `brain-resolver.ts`:

```ts
async function resolvePackageRefs(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resolved = { ...config };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" && value.startsWith("@")) {
      const mod = await import(value);
      resolved[key] = mod.default;
    }
  }
  return resolved;
}
```

This is applied to each plugin's merged config (base + yaml override) before construction.

### Theme Package Contract

Theme packages export a default CSS string:

```ts
// shared/theme-mylittlephoney/src/index.ts
import { composeTheme } from "@brains/theme-base";
import themeCSS from "./theme.css" with { type: "text" };
export default composeTheme(themeCSS);
```

This is already how all theme packages work (`theme-default`, `theme-yeehaa`, `theme-brutalist`, etc.). No changes needed to theme packages.

### brain.yaml Usage

```yaml
brain: "@brains/rover"
domain: mylittlephoney.com

plugins:
  site-builder:
    theme: "@brains/theme-mylittlephoney"
```

The runner sees `theme: "@brains/theme-mylittlephoney"`, imports the package, gets the CSS string, and passes it to site-builder as `themeCSS`.

### Mapping Override Keys to Plugin Config Keys

There's a naming mismatch: brain.yaml says `theme` but the plugin expects `themeCSS`. Options:

**A. Use the plugin's actual config key in yaml:**

```yaml
plugins:
  site-builder:
    themeCSS: "@brains/theme-mylittlephoney"
```

Simple, no mapping needed. But `themeCSS` is an ugly yaml key.

**B. Convention-based mapping in the plugin:**
The plugin declares which config keys accept package references and how to map them:

```ts
// In site-builder plugin
static packageFields = { theme: "themeCSS" };
```

Clean yaml, but adds complexity.

**C. The plugin accepts both `theme` and `themeCSS`:**

```ts
const themeCSS = config.theme ?? config.themeCSS;
```

Pragmatic, no infrastructure needed.

**Recommendation:** Option A for now. Use the actual config key. We can add mapping later if yaml ergonomics become a problem.

## Future Extensions

### Git Repository References (Phase 2)

```yaml
seed-content: "github:rizom-ai/mylittlephoney-content"
```

Resolution: `github:org/repo` → clone to temp dir → import. Same interface, different resolver backend.

### Layout References (Phase 2)

```yaml
plugins:
  site-builder:
    layout: "@brains/layout-minimal"
```

Same `@` prefix convention. The default export would be a layout component instead of a CSS string.

### NPM Package References (Phase 3)

```yaml
plugins:
  site-builder:
    themeCSS: "npm:some-external-theme"
```

Resolution: `npm:package` → install to node_modules → import. For third-party themes/plugins.

## Scope (Phase 1)

- [ ] Add `resolvePackageRefs` to `brain-resolver.ts`
- [ ] Make `resolve()` async (it currently isn't — dynamic imports require it)
- [ ] Update runner to `await resolve()`
- [ ] Test with a theme package reference in brain.yaml
- [ ] Update mylittlephoney plan to use `themeCSS: "@brains/theme-mylittlephoney"`

## Files Changed

- `shell/app/src/brain-resolver.ts` — add `resolvePackageRefs`, make `resolve` async
- `shell/app/src/runner.ts` — await resolve
- `shell/app/test/instance-overrides.test.ts` — test package resolution

## Estimated Effort

~1 hour. The dynamic import is the only new thing; everything else is plumbing.
