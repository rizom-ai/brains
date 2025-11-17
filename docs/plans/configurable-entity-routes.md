# Plan: Configurable Entity Route Labels and Paths

**Status**: Planning
**Created**: 2025-01-17
**Goal**: Allow site builder to customize entity type route paths and labels instead of using auto-generated pluralized names

## Problem

Currently, the dynamic route generator auto-generates routes using entity type names:

- Entity type `post` → `/posts` with label "Posts"
- Entity type `deck` → `/decks` with label "Decks"

For professional sites, we want more descriptive names:

- `/essays` with label "Essays" (instead of `/posts`)
- `/presentations` with label "Presentations" (instead of `/decks`)

## Solution

Add `entityRouteConfig` option to site builder configuration to override auto-generated labels and paths.

### Configuration Schema

```typescript
entityRouteConfig?: {
  [entityType: string]: {
    label: string;           // Navigation label (e.g., "Essays")
    pluralName?: string;     // URL path segment (defaults to label.toLowerCase() + 's')
  }
}
```

**Default behavior**: If `pluralName` is not provided, it defaults to `label.toLowerCase() + 's'`

### Example Usage

```typescript
siteBuilderPlugin({
  routes,
  entityRouteConfig: {
    post: {
      label: "Essay", // pluralName will default to 'essays'
    },
    deck: {
      label: "Presentation", // pluralName will default to 'presentations'
    },
  },
  // ... other config
});
```

Or with explicit pluralName:

```typescript
entityRouteConfig: {
  post: {
    label: 'Essay',
    pluralName: 'writings'  // Override default
  }
}
```

## Implementation Steps

### 1. Update Site Builder Config Schema

**File**: `plugins/site-builder/src/config/site-builder-config.ts`

- Add `entityRouteConfig` to `SiteBuilderConfig` interface
- Add Zod schema validation
- Make it optional for backward compatibility

```typescript
export const siteBuilderConfigSchema = z.object({
  // ... existing fields
  entityRouteConfig: z
    .record(
      z.object({
        label: z.string(),
        pluralName: z.string().optional(),
      }),
    )
    .optional(),
});
```

### 2. Pass Config to Dynamic Route Generator

**File**: `plugins/site-builder/src/plugin.ts`

- Pass `entityRouteConfig` to `DynamicRouteGenerator` constructor
- Update constructor call in plugin initialization

### 3. Update Dynamic Route Generator

**File**: `plugins/site-builder/src/lib/dynamic-route-generator.ts`

- Add `entityRouteConfig` to constructor parameters
- Store as private property
- Update `generateRoutesForEntityType()` method:
  - Check if entity type has custom config
  - Use config values if present
  - Apply default pluralName logic: `label.toLowerCase() + 's'`
  - Fall back to current auto-generation if no config

**Changes needed**:

```typescript
private getEntityDisplayConfig(entityType: string): {
  pluralName: string;
  label: string;
} {
  const config = this.entityRouteConfig?.[entityType];

  if (config) {
    // Use custom config
    const pluralName = config.pluralName ??
      config.label.toLowerCase() + 's';
    return {
      pluralName,
      label: config.label,
    };
  }

  // Fall back to auto-generation
  return {
    pluralName: this.pluralize(entityType),
    label: this.capitalize(this.pluralize(entityType)),
  };
}
```

Then update route generation to use this helper:

- Line 73: `path: `/${pluralName}``
- Line 74: `title: ${label}`
- Line 79: `label: ${label}`
- Line 136: `path: `/${pluralName}/${urlSlug}``

### 4. Update Professional Brain Config

**File**: `apps/professional-brain/brain.config.ts`

Add entity route config to site builder plugin:

```typescript
siteBuilderPlugin({
  routes,
  entityRouteConfig: {
    post: { label: "Essay" },
    deck: { label: "Presentation" },
  },
  layouts: {
    default: DefaultLayout,
    minimal: MinimalLayout,
  },
  // ... rest of config
});
```

This will generate:

- `/essays` list page with "Essays" label
- `/essays/[slug]` detail pages
- `/presentations` list page with "Presentations" label
- `/presentations/[slug]` detail pages

### 5. Update Tests

**File**: `plugins/site-builder/test/lib/dynamic-route-generator.test.ts` (if exists)

Add tests for:

- Custom entity route config with label only (pluralName defaults)
- Custom entity route config with explicit pluralName
- Backward compatibility (no config provided)
- Mixed scenario (some entities configured, others not)

### 6. Update Documentation

Update site builder documentation to include:

- Entity route config option
- Examples of usage
- Note about default pluralName behavior

## Expected Outcomes

✅ Site builder accepts `entityRouteConfig` in configuration
✅ Entity types with custom config use specified labels and paths
✅ `pluralName` defaults to `label.toLowerCase() + 's'` when not provided
✅ Entity types without config still work with auto-generated names
✅ Backward compatible with existing configurations
✅ Professional brain uses "Essays" and "Presentations" in navigation and URLs

## Testing Plan

1. **Typecheck**: Ensure no TypeScript errors
2. **Unit tests**: Test route generation with various configs
3. **Manual testing**: Build professional brain site and verify:
   - Navigation shows "Essays" and "Presentations"
   - List pages at `/essays` and `/presentations`
   - Detail pages at `/essays/[slug]` and `/presentations/[slug]`
   - Other routes unaffected

## Risks and Considerations

- **Breaking changes**: Changing paths breaks existing links if site is live
  - Mitigation: This is a new feature, existing sites continue working with auto-generated paths
  - For Yeehaa's site: appears to still be in development, acceptable to change

- **Pluralization edge cases**: Simple `+ 's'` doesn't handle irregular plurals
  - Mitigation: Allow explicit `pluralName` override for edge cases
  - Future: Could add proper pluralization library if needed

- **Route conflicts**: Custom plural names could conflict with other routes
  - Mitigation: Route registry already handles conflicts with warnings
  - Document that custom paths should be unique

## Future Enhancements

- Support for route aliases/redirects when changing paths
- More sophisticated default pluralization (irregular forms)
- Entity-specific route templates (different layouts per entity type)
- Custom URL patterns (e.g., `/writings/2025/my-essay` vs `/essays/my-essay`)
