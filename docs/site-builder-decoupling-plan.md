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
Location: `packages/site-builder` (standalone package)

Core components:

1. **PageRegistry** - Plugins register pages here
2. **LayoutRegistry** - Maps layout names to Astro components
3. **SiteBuilder** - Orchestrates site generation and content management
4. **Types** - Page, Section, Layout definitions

Key interfaces:

```typescript
interface PageDefinition {
  path: string; // e.g., "/", "/products", "/blog"
  title: string;
  description?: string;
  sections: SectionDefinition[];
  pluginId?: string; // Track which plugin registered the page
}

interface SectionDefinition {
  id: string;
  layout: string; // e.g., "hero", "features", "grid", "text"
  content?: unknown; // Static layout-specific content
  contentEntity?: {
    // Dynamic content from entities
    entityType: string; // e.g., "site-content"
    template?: string; // Content template for generation
    query?: Record<string, unknown>; // Query to find entity
  };
  order?: number;
}

interface LayoutDefinition {
  name: string;
  schema: ZodType; // Schema for content validation
  component: React.ComponentType<any> | string; // React component or path to Astro component
  description?: string;
}
```

### Content Generation Flow

The site builder orchestrates content generation:

1. **During site build**:

   - For each section, check if it needs content from an entity
   - Query for existing content entity using the section's query
   - If not found and template specified, generate content via ContentGenerationService
   - Store generated content as entity for future editing
   - Pass content (from entity or static) to layout component

2. **Content persistence**:
   - All AI-generated content is stored as entities
   - Users can edit content through entity updates
   - Content persists across builds
   - Regeneration only happens when explicitly requested or entity is missing

## Phase 2: Create Default Site Plugin

**New Plugin: `@brains/default-site-plugin`**

This plugin provides the default website structure currently hardcoded in webserver:

1. **Registers default pages**:
   - Landing page (/)
   - Dashboard (/dashboard)
2. **Registers content templates**:

   - All landing page section templates (hero, features, products, cta)
   - Dashboard template
   - General organizational context template

3. **Provides Layouts** (plugin-provided layouts):

   - `hero` - Hero section with headline/CTA
   - `features` - Feature grid
   - `products` - Product cards
   - `cta` - Call to action
   - `dashboard` - Stats and recent items

   Note: Site-builder only provides a generic `object` layout as fallback

4. **Landing Page** registration example:

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
  layouts: {
    register(layout: LayoutDefinition): void;
    list(): LayoutDefinition[];
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
          content: { headline: "Our Blog", subheadline: "Latest thoughts" },
        },
        {
          id: "posts",
          layout: "grid",
          content: await this.getRecentPosts(),
        },
      ],
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
2. **Step 2**: Add minimal fallback layout to site-builder (generic object renderer)
3. **Step 3**: Create default-site-plugin with current webserver content/templates and layouts
4. **Step 4**: Update shell to initialize site-builder
5. **Step 5**: Update plugin context to expose page registry and layout registry
6. **Step 6**: Migrate webserver plugin to use site-builder for generation
   - **Step 6a**: Configure Astro to use React/Preact integration
   - **Step 6b**: Convert layout components from .astro to .tsx
   - **Step 6c**: Update layout registration to use component references
7. **Step 7**: Extract webserver as interface package
8. **Step 8**: Update app to include default-site-plugin

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
packages/site-builder/
├── src/
│   ├── index.ts
│   ├── page-registry.ts
│   ├── layout-registry.ts
│   ├── site-builder.ts
│   └── types.ts
├── layouts/
│   └── object.astro  # Generic fallback layout
└── package.json

packages/default-site-plugin/
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   └── content/
│       ├── landing/
│       │   ├── hero/
│       │   │   ├── index.ts
│       │   │   ├── layout.tsx
│       │   │   ├── schema.ts
│       │   │   └── template.ts
│       │   ├── features/
│       │   │   ├── index.ts
│       │   │   ├── layout.tsx
│       │   │   ├── schema.ts
│       │   │   └── template.ts
│       │   ├── products/
│       │   │   ├── index.ts
│       │   │   ├── layout.tsx
│       │   │   ├── schema.ts
│       │   │   └── template.ts
│       │   └── cta/
│       │       ├── index.ts
│       │       ├── layout.tsx
│       │       ├── schema.ts
│       │       └── template.ts
│       ├── dashboard/
│       │   ├── index.ts
│       │   ├── layout.tsx
│       │   ├── schema.ts
│       │   └── template.ts
│       └── general/
│           ├── schema.ts
│           └── template.ts
└── package.json

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

1. **Separation of Concerns**:
   - Site building becomes standalone package
   - Default site structure moves to plugin
   - Webserver focuses only on serving
2. **Plugin Extensibility**: Any plugin can register pages
3. **Layout System**: Flexible sections with reusable layouts
4. **Progressive Enhancement**: Start simple, add features over time
5. **Content Generation**: Site-builder orchestrates, plugins define templates
6. **Co-located Sections**: Each section bundles its layout, schema, and template together

### Layout Architecture

The layout system follows a plugin-first approach:

1. **Site-builder provides minimal fallback**:

   - Only a generic `object` layout that can render any data structure
   - Acts as a safety net for unregistered layouts

2. **Plugins provide specialized layouts**:

   - Each plugin registers its own layouts with the LayoutRegistry
   - Layouts are co-located with their schemas and templates in section directories
   - This enables domain-specific UI components

3. **Benefits of plugin-provided layouts**:
   - Plugins control their complete UI experience
   - Easy to add new layouts without modifying core
   - Natural bundling of related concerns (layout + schema + template)
   - Future path to fully custom components per plugin

### React Component Architecture

To solve cross-package component resolution issues, layouts will be implemented as React/Preact components:

1. **Technology Stack**:

   - Astro remains the static site generator
   - React/Preact components for all layouts
   - TypeScript for full type safety
   - Tailwind CSS for styling

2. **Component Structure**:

   ```typescript
   // default-site-plugin/src/content/landing/hero/layout.tsx
   export interface HeroLayoutProps {
     headline: string;
     subheadline: string;
     ctaText?: string;
     ctaLink?: string;
   }

   export const HeroLayout = ({ headline, subheadline, ctaText, ctaLink }: HeroLayoutProps) => {
     return (
       <section className="hero-section py-20 md:py-32 text-center">
         <h1 className="text-4xl md:text-6xl font-bold">{headline}</h1>
         <p className="text-xl md:text-2xl">{subheadline}</p>
         {ctaText && ctaLink && (
           <a href={ctaLink} className="btn-primary">{ctaText}</a>
         )}
       </section>
     );
   };
   ```

3. **Registration Pattern**:

   ```typescript
   // default-site-plugin/src/content/landing/hero/index.ts
   import { HeroLayout } from "./layout";
   import { HeroSchema } from "./schema";
   import { heroTemplate } from "./template";

   export const heroSection = {
     layout: {
       name: "hero",
       component: HeroLayout, // Direct component reference
       schema: HeroSchema,
       description: "Hero section with headline and CTA",
     },
     template: heroTemplate,
   };
   ```

4. **Benefits**:
   - Direct component imports across packages
   - No build-time path resolution needed
   - Full TypeScript support for props
   - Easier testing with React testing tools
   - Familiar ecosystem for developers
   - Components are rendered at build time (no client-side hydration unless needed)

### Registry Architecture

The system will use focused registries with clear separation:

1. **EntityRegistry** (existing) - Data layer for storage/retrieval

   - Maps entity types to schemas and adapters
   - Handles persistence of all entities including generated content

2. **SchemaRegistry** (existing) - Validation layer

   - Central repository of Zod schemas
   - Used across the system for validation

3. **TemplateRegistry** (renamed from ContentTypeRegistry) - Generation layer

   - Stores AI content generation templates
   - Includes formatters for each template
   - Clearer naming to avoid confusion with page content

4. **PageRegistry** (new) - Presentation layer
   - Maps URL paths to page definitions
   - Tracks which plugin registered each page
   - Used by site-builder to generate site structure

**Registry Flow Example:**

```
1. Plugin registers AI template → TemplateRegistry
2. Plugin registers page with sections → PageRegistry
3. Section references template for content generation
4. Generated content stored as entity → EntityRegistry
5. Site builder queries entity and renders with layout
```

This architecture provides:

- Clear separation of concerns
- Single responsibility per registry
- Clean dependency flow: Data → Generation → Presentation
- Easy extension points for future features

### Technical Implementation Details

**Astro + React Integration**:

1. **Astro Configuration**:

   ```javascript
   // astro.config.mjs
   import { defineConfig } from "astro/config";
   import react from "@astrojs/react";

   export default defineConfig({
     integrations: [react()],
   });
   ```

2. **Component Rendering in Astro**:

   ```astro
   ---
   // In Astro page/layout
   import { HeroLayout } from '@brains/default-site-plugin';
   const heroData = { headline: "Welcome", subheadline: "To our site" };
   ---

   <HeroLayout {...heroData} client:load={false} />
   ```

3. **Build Process**:
   - React components are compiled at build time
   - No client-side JavaScript unless explicitly needed
   - Full static HTML output maintained
   - TypeScript compilation handles cross-package imports

### Compatibility Considerations

- Existing webserver plugin API should continue working during migration
- Current content generation can be wrapped in the new page registry
- Gradual migration path for existing deployments
- React components are opt-in, Astro components still supported

This approach provides a clean path from the current implementation to a fully extensible system while maintaining working functionality throughout the migration.
