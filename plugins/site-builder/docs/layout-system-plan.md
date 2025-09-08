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

### 2. Layout as Template Pattern

Create layouts using the existing template system:
```typescript
// Layout is a template that receives:
interface LayoutData {
  sections: RenderedSection[]; // Pre-rendered content sections
  title: string;
  description: string;
}

// Benefits:
// - Layouts work like any other template
// - Consistent with existing architecture
// - Can use DataSources if needed
// - Testable like other templates
```

### 3. PreactBuilder Modifications

Simplified approach using template pattern:
- Render content sections (footer removed from routes)
- Pass sections to layout template
- Layout template composes final page structure
- No special layout logic in builder

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

### Phase 2: Create Layout Template
1. Create layout as a template:
   - Schema defines sections array and metadata
   - Component composes sections and adds footer
   - Register as template like any other
2. Layout template internally:
   - Renders content sections
   - Adds footer with navigation data from DataSource
   - Handles page structure

### Phase 3: Builder Integration
1. Update PreactBuilder to:
   - Render content sections (no footer in routes)
   - Pass sections to layout template
   - Layout template handles final composition
2. Simple and clean - layout is just another template

### Phase 4: Migration
1. Remove footer from all route definitions
2. Routes only define their actual content
3. Footer automatically included via layout
4. Test all routes with new layout system

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