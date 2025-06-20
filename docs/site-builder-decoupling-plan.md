# Site Builder Decoupling Plan

## Overview
Transform the current tightly-coupled webserver plugin into a flexible system where:
- Site building becomes a core capability in the shell
- Webserver becomes an interface that serves built sites
- Plugins can register pages as collections of sections
- Each section has a layout that maps to a component
- Start with simple built-in layouts, evolve to custom components

## Phase 1: Create Site Builder Core Package

**New Package: `@brains/site-builder`**
Location: `packages/shell/src/site` (follows pattern of formatters, content, etc.)

Core components:
1. **PageRegistry** - Plugins register pages here
2. **LayoutRegistry** - Maps layout names to Astro components
3. **SiteBuilder** - Orchestrates site generation
4. **Types** - Page, Section, Layout definitions

Key interfaces:
```typescript
interface PageDefinition {
  path: string;           // e.g., "/", "/products", "/blog"
  title: string;
  description?: string;
  sections: SectionDefinition[];
}

interface SectionDefinition {
  id: string;
  layout: string;         // e.g., "hero", "features", "grid", "text"
  content: unknown;       // Layout-specific content
  order?: number;
}

interface LayoutDefinition {
  name: string;
  schema: ZodType;        // Schema for content validation
  component: string;      // Path to Astro component
}
```

## Phase 2: Refactor Current Content

Transform existing hardcoded pages into the new system:

1. **Built-in Layouts** (in site-builder):
   - `hero` - Hero section with headline/CTA
   - `features` - Feature grid
   - `products` - Product cards
   - `cta` - Call to action
   - `text` - Simple text content
   - `dashboard` - Stats and recent items

2. **Landing Page** becomes:
```typescript
{
  path: "/",
  title: "Home",
  sections: [
    { id: "hero", layout: "hero", content: {...} },
    { id: "features", layout: "features", content: {...} },
    { id: "products", layout: "products", content: {...} },
    { id: "cta", layout: "cta", content: {...} }
  ]
}
```

## Phase 3: Plugin Integration

Update plugin context to include:
```typescript
interface PluginContext {
  // ... existing
  pages: {
    register(page: PageDefinition): void;
    list(): PageDefinition[];
  };
}
```

Example plugin usage:
```typescript
class BlogPlugin extends BasePlugin {
  async onRegister(context: PluginContext) {
    // Register blog index page
    context.pages.register({
      path: "/blog",
      title: "Blog",
      sections: [
        {
          id: "header",
          layout: "hero",
          content: { headline: "Our Blog", subheadline: "Latest thoughts" }
        },
        {
          id: "posts",
          layout: "grid",
          content: await this.getRecentPosts()
        }
      ]
    });
  }
}
```

## Phase 4: Webserver as Interface

Transform webserver-plugin into webserver interface:
1. Move to `packages/webserver`
2. Remove content generation logic
3. Focus on serving built sites
4. Keep build triggers and server management

## Phase 5: Migration Path

1. **Step 1**: Create site-builder package with registries
2. **Step 2**: Add built-in layouts
3. **Step 3**: Update shell to initialize site-builder
4. **Step 4**: Migrate webserver content to use page registry
5. **Step 5**: Update plugin context
6. **Step 6**: Extract webserver as interface
7. **Step 7**: Update existing plugins to register pages

## Future Enhancements (Post-MVP)

1. **Custom Components**: Plugins provide Astro/React components
2. **Dynamic Pages**: Support for API-driven content
3. **Layout Variants**: Different styles for same layout type
4. **Nested Sections**: Sections within sections
5. **Global Components**: Header, footer, navigation

## Benefits

1. **Decoupled**: Content separate from serving
2. **Extensible**: Any plugin can add pages
3. **Flexible**: Mix and match layouts
4. **Maintainable**: Clear separation of concerns
5. **Evolvable**: Easy path to custom components

## Example File Structure

```
packages/shell/src/site/
├── index.ts
├── page-registry.ts
├── layout-registry.ts
├── site-builder.ts
├── types.ts
└── layouts/
    ├── hero.astro
    ├── features.astro
    ├── grid.astro
    ├── text.astro
    └── dashboard.astro

packages/webserver/
├── src/
│   ├── index.ts
│   ├── server-manager.ts
│   └── webserver-interface.ts
└── package.json
```

## Implementation Notes

### Current State
- Webserver plugin tightly couples content generation with serving
- Pages are hardcoded (landing, dashboard)
- Only the webserver plugin can define pages
- Content is generated via AI into specific structures

### Key Changes
1. **Separation of Concerns**: Site building moves to shell core
2. **Plugin Extensibility**: Any plugin can register pages
3. **Layout System**: Flexible sections with reusable layouts
4. **Progressive Enhancement**: Start simple, add features over time

### Compatibility Considerations
- Existing webserver plugin API should continue working during migration
- Current content generation can be wrapped in the new page registry
- Gradual migration path for existing deployments

This approach provides a clean path from the current implementation to a fully extensible system while maintaining working functionality throughout the migration.