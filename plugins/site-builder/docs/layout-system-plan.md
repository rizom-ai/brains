# Layout System Implementation Plan

## Overview

Implement a reusable layout system for the site builder that automatically includes common elements (like footer) on all pages without requiring manual addition to each route.

## Current State

- Each route manually includes footer in its sections array
- Footer section duplicated across all route definitions
- No separation between page content and page structure
- Dynamic routes must remember to add footer

## Proposed Solution

### 1. Layout System Architecture

Add layout support to route definitions:
- Add optional `layout` field to RouteDefinitionSchema
- Default to "default" layout if not specified
- Layouts wrap page content and provide consistent structure

### 2. Default Layout Component

Create `/shared/default-site-content/src/layouts/default/`:
```typescript
interface DefaultLayoutProps {
  children: JSX.Element | JSX.Element[]; // Page content sections
  title: string;
  description: string;
}

// Layout includes:
// - Page wrapper structure
// - Automatic footer with navigation query
// - Consistent styling and structure
```

### 3. PreactBuilder Modifications

Update the builder to support layouts:
- Separate content rendering from layout application
- Render content sections
- Apply layout wrapper around content
- Layout handles footer internally with NavigationDataSource

### 4. Route Definition Updates

Simplify route definitions:
```typescript
// Before:
{
  sections: [
    { id: "hero", template: "hero" },
    { id: "features", template: "features" },
    { id: "footer", template: "footer", dataQuery: {...} }
  ]
}

// After:
{
  layout: "default", // Optional, defaults to "default"
  sections: [
    { id: "hero", template: "hero" },
    { id: "features", template: "features" }
    // Footer handled by layout
  ]
}
```

## Implementation Steps

### Phase 1: Schema and Types
1. Add `layout` field to RouteDefinitionSchema
2. Create layout type definitions
3. Update route types

### Phase 2: Layout Components
1. Create layout component structure
2. Implement DefaultLayout with footer
3. Create layout registry/resolver

### Phase 3: Builder Integration
1. Update PreactBuilder to detect layout
2. Implement layout wrapping logic
3. Ensure footer data resolution in layout

### Phase 4: Migration
1. Remove footer from existing routes
2. Update dynamic route generator
3. Test all routes with new layout system

## Benefits

- **DRY Principle**: Footer defined once in layout
- **Consistency**: All pages automatically get proper structure
- **Flexibility**: Easy to add new layouts (minimal, admin, etc.)
- **Maintainability**: Global layout changes from single location
- **Cleaner Routes**: Routes focus on content, not structure
- **Separation of Concerns**: Content vs. structure clearly separated

## Future Enhancements

- Multiple layout options (minimal, full, admin)
- Layout-specific navigation slots
- Header component in layout
- Breadcrumb support in layout
- Layout-based meta tag management

## Testing Strategy

1. Verify footer appears on all pages
2. Check navigation data flows correctly
3. Ensure dynamic routes use layout
4. Test layout switching
5. Verify no style/rendering regressions

## Migration Path

1. Implement layout system alongside current approach
2. Test with a few routes
3. Migrate all routes to use layouts
4. Remove manual footer sections
5. Clean up unused code

## Success Criteria

- All pages have footer without manual addition
- Routes are cleaner and more focused
- Layout changes apply globally
- System is extensible for future layouts
- No breaking changes to existing functionality