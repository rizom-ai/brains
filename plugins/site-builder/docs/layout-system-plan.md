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

## Implementation Findings

### Template vs ViewTemplate Architecture

During implementation, discovered important architectural distinction:

1. **Template Interface** (from @brains/templates):
   - Uses `layout.component` for component definition
   - Created via `createTemplate` helper
   - Stored in central TemplateRegistry

2. **ViewTemplate Interface** (from render-service):
   - Uses `renderers.web` for component definition
   - Used by PreactBuilder and BuildContext
   - RenderService transforms Template → ViewTemplate

3. **Transformation Flow**:
   - Templates registered with `layout.component`
   - RenderService converts: `template.layout.component` → `viewTemplate.renderers.web`
   - PreactBuilder consumes ViewTemplate with `renderers.web`

### Key Implementation Considerations

1. **Layout as Template**: Layout successfully implemented as regular template
2. **Navigation DataSource**: Layout can fetch navigation data via DataSource
3. **Schema Design**: Layout schema includes both page data (sections, title, description) and footer data
4. **Test Compatibility**: Tests use ViewTemplate interface directly, must provide `renderers.web`

### Current Status

- Layout system design validated
- Template architecture understood
- Need to resolve layout data flow (how footer data gets to layout)
- Consider whether layout should be special-cased or follow standard template pattern

## Revised Assessment

### Critical Issues with Template-Based Approach

1. **Data Flow Complexity**
   - Layouts need BOTH rendered sections AND footer data
   - Current DataSource pattern expects single data type
   - Mixing pre-rendered HTML with data fetching creates architectural mismatch

2. **Template Pattern Mismatch**
   - Templates are designed to receive data and render it
   - Layouts need to receive already-rendered HTML sections
   - This breaks the standard template → component flow

3. **DataSource Integration Challenge**
   - NavigationDataSource returns `{ navigation: [...] }`
   - Footer needs `{ navigation: [...], copyright: string }`
   - Layout needs `{ sections: string[], title, description, footer: {...} }`
   - No clean way to compose this data without special-casing

### Recommended Approach: Composition in PreactBuilder

Instead of treating layouts as templates, handle them as a composition layer:

1. **Keep it Simple**
   - Don't make layouts templates
   - Handle layout composition directly in PreactBuilder
   - Layouts are just Preact components that compose sections

2. **Clean Data Flow**
   - PreactBuilder renders content sections → HTML strings
   - PreactBuilder fetches footer data via NavigationDataSource
   - PreactBuilder passes both to layout component
   - Layout component renders complete page

3. **Benefits**
   - Cleaner separation of concerns
   - No architectural violations
   - Simpler implementation
   - Easier to test
   - More flexible for future layouts

## Success Criteria

- All pages have footer without manual addition
- Routes are cleaner and more focused
- Layout changes apply globally
- System is extensible for future layouts
- No breaking changes to existing functionality

## Final Architecture Analysis

### Dependency Issues

The core challenge is avoiding circular dependencies:

- site-builder cannot depend on default-site-content
- default-site-content is passed TO site-builder as configuration
- Layouts need to be decoupled from both

### Options Considered

1. **Layouts as Templates**
   - ❌ Breaks template pattern (templates receive data, not HTML)
   - ❌ Complex data flow mixing HTML and data
   - ❌ DataSource integration is convoluted

2. **Layouts in BuildContext**
   - ❌ Couples layout implementation to build process
   - ❌ Not extensible or configurable

3. **Layouts as Configuration**
   - ✅ Similar to how templates are passed
   - ✅ Clean separation of concerns
   - ❌ Still requires site-builder to understand layout concept
   - ❌ Creates coupling in app configuration

4. **No Layout System (Status Quo)**
   - ✅ Simple and explicit
   - ✅ No architectural changes needed
   - ✅ Footer duplication is minor (one line per route)
   - ❌ Some duplication remains

### How Configuration-Based Layouts Would Work

```typescript
// In brain.config.ts
import { DefaultLayout } from "@brains/default-site-content/layouts";

siteBuilderPlugin({
  templates,
  routes,
  layouts: {
    default: DefaultLayout,
    minimal: MinimalLayout, // Could have different layouts
  },
});
```

**Flow:**

1. DefaultLayout lives in default-site-content as a Preact component
2. Brain app imports and passes it to siteBuilderPlugin
3. PreactBuilder receives layouts through configuration
4. When building: fetch footer data, pass sections + data to layout

**Problems:**

- Brain app must import from default-site-content (coupling)
- PreactBuilder needs to understand footer data structure
- Type safety is challenging across package boundaries

### Recommendation: Keep Current Architecture

After analysis, the cleanest approach is to **not implement a layout system**:

1. **Current system works well** - Footer as a section is explicit and clear
2. **Duplication is minimal** - One line per route is acceptable
3. **Explicit > Implicit** - Developers can see exactly what's on each page
4. **Avoid over-engineering** - Complex abstractions for minor benefit
5. **No coupling issues** - Current architecture maintains clean boundaries

The layout system creates more problems than it solves. The minor duplication of footer sections is a reasonable trade-off for architectural simplicity.

## Update: Layout System Implementation Complete

After further discussion, we successfully implemented a configuration-based layout system:

### Implemented Solution

1. **Layouts as Configuration**: Layouts are passed to the plugin as Preact components, similar to templates
2. **Required Layout Field**: Routes now have a required `layout` field (defaults to "default")
3. **Footer in Layout**: Footer is hardcoded in the DefaultLayout for now
4. **Clean Separation**: Layouts live in default-site-content, passed via configuration

### Current Implementation Status

✅ Layout system working with JSX sections
✅ Footer included in DefaultLayout
✅ All tests passing
✅ Footer removed from route definitions

### Next Evolution: SiteInfoDataSource

To make the footer (and future header) dynamic, we should evolve from NavigationDataSource to a more comprehensive SiteInfoDataSource:

#### Problems with Current Approach

1. **NavigationDataSource is Limited**: Only provides navigation items
2. **Site Config Scattered**: Title, description in BuildContext; navigation in DataSource
3. **Footer Data Hardcoded**: Navigation items hardcoded in DefaultLayout
4. **No Central Source of Truth**: Site-wide information spread across multiple places

#### Proposed SiteInfoDataSource

Create a unified DataSource that provides all site-wide information:

```typescript
// Site info structure
interface SiteInfo {
  // Core metadata
  title: string;
  description: string;
  url?: string;
  
  // Navigation for different slots
  navigation: {
    primary: NavigationItem[];
    footer: NavigationItem[];
  };
  
  // Site-wide content
  copyright?: string;
  
  // Future expansions
  social?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
}
```

#### Implementation Strategy

1. **Create SiteInfoDataSource**
   - Consolidates RouteRegistry navigation data
   - Includes site configuration from plugin config
   - Single source of truth for site-wide data

2. **Update BuildContext**
   - Add `getSiteInfo()` method to fetch site information
   - Cache result for performance

3. **Update Layout Props**
   - Pass `siteInfo` to layouts alongside sections
   - Layouts can access any site-wide data they need

4. **Update PreactBuilder**
   - Fetch site info once per build
   - Pass to all layouts consistently

5. **Update DefaultLayout**
   - Use `siteInfo.navigation.footer` instead of hardcoded values
   - Use `siteInfo.copyright` if available

#### Benefits

- **Single Source of Truth**: All site-wide data in one place
- **Extensible**: Easy to add new site-wide features
- **Consistent**: Same data available to all layouts
- **Dynamic**: Footer/header navigation from route registry
- **Maintainable**: Clear separation of concerns

#### Migration Path

1. Create SiteInfoDataSource alongside NavigationDataSource
2. Update layouts to accept and use siteInfo
3. Gradually migrate features to use SiteInfoDataSource
4. Remove NavigationDataSource once fully migrated

### Future Considerations

- **Header Component**: Add to layout with primary navigation
- **SEO Management**: Use Helmet or similar for meta tags
- **Multiple Layouts**: Support different layouts for different page types
- **Theme Support**: Pass theme configuration through siteInfo
