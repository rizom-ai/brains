# Architecture Improvements Plan

## Overview

This document outlines a comprehensive plan to improve the Brain's architecture through registry consolidation and completion of the site-builder implementation. The goal is to create a cleaner, more maintainable system with better separation of concerns and support for multiple output formats.

## Current State

### Registry Architecture

We currently have 7 separate registries:

1. **Registry** - General component/service dependency injection
2. **EntityRegistry** - Maps entity types to schemas and adapters
3. **SchemaRegistry** - Central repository of Zod schemas
4. **ContentTypeRegistry** - AI content generation templates
5. **FormatterRegistry** - Schema formatters for parsing/formatting
6. **PageRegistry** - URL to page definition mapping
7. **LayoutRegistry** - Layout name to component mapping

### Site Builder Status

- ✅ Site-builder implemented as plugin (not core package)
- ✅ Dashboard functionality removed
- ✅ Webserver package created and working
- ❌ React components defined but NOT integrated with Astro
- ❌ Webserver-plugin still exists (deprecated)
- ❌ No multi-format output support

## Part 1: Registry Consolidation

### Target Architecture

Consolidate from 7 registries to 4 with clearer separation:

#### 1. DataRegistry

**Combines:** EntityRegistry + SchemaRegistry

```typescript
interface DataRegistry {
  // Entity operations
  registerEntity(type: string, schema: ZodType, adapter: EntityAdapter): void;
  getEntitySchema(type: string): ZodType;
  getEntityAdapter(type: string): EntityAdapter;

  // Schema operations (for non-entity schemas)
  registerSchema(name: string, schema: ZodType): void;
  getSchema(name: string): ZodType;

  // Validation
  validate(type: string, data: unknown): boolean;
}
```

#### 2. ContentRegistry

**Combines:** ContentTypeRegistry + FormatterRegistry

```typescript
interface ContentRegistry {
  // Template + formatter as a unit
  registerContent(
    name: string,
    config: {
      template: ContentTemplate;
      formatter: SchemaFormatter;
      schema: ZodType;
    },
  ): void;

  // Access methods
  getTemplate(name: string): ContentTemplate;
  getFormatter(name: string): SchemaFormatter;
  generateContent(templateName: string, context: any): Promise<any>;
  parseContent(templateName: string, content: string): any;
}
```

#### 3. ViewRegistry

**Combines:** PageRegistry + LayoutRegistry + future output formats

```typescript
interface ViewRegistry {
  // Web views
  registerPage(definition: PageDefinition): void;
  registerLayout(definition: LayoutDefinition): void;
  getPage(path: string): PageDefinition;
  getLayout(name: string): LayoutDefinition;

  // Future: other formats
  registerPdfTemplate(name: string, template: PdfTemplate): void;
  registerEmailTemplate(name: string, template: EmailTemplate): void;

  // Unified rendering
  render(
    format: "web" | "pdf" | "email",
    view: string,
    data: any,
  ): Promise<any>;
}
```

#### 4. Registry (unchanged)

Keep for general service/component dependency injection.

### Migration Strategy

#### Phase 1: Create Facade Registries (Non-breaking)

```typescript
// Example: ViewRegistry as facade
export class ViewRegistry {
  private pageRegistry = PageRegistry.getInstance();
  private layoutRegistry = LayoutRegistry.getInstance();

  // Delegate to existing registries
  registerPage(definition: PageDefinition): void {
    this.pageRegistry.register(definition);
  }

  registerLayout(definition: LayoutDefinition): void {
    this.layoutRegistry.register(definition);
  }

  // New unified methods
  registerView(type: "page" | "layout", definition: any): void {
    if (type === "page") this.registerPage(definition);
    else this.registerLayout(definition);
  }
}
```

#### Phase 2: Update Plugin Context

```typescript
interface PluginContext {
  // Old (deprecated but working)
  schemas: SchemaRegistry;
  entities: EntityRegistry;

  // New
  data: DataRegistry;
  content: ContentRegistry;
  views: ViewRegistry;
}
```

#### Phase 3: Migrate Plugins Incrementally

- Start with site-builder plugin (uses most registries)
- Update one plugin at a time
- Run tests after each migration

#### Phase 4: Remove Old Registries

- Once all plugins migrated
- Remove facade implementations
- Clean up old registry files

## Part 2: Site Builder Improvements

### Remove Webserver-Plugin

1. Delete `/packages/webserver-plugin` directory
2. Remove from workspace configuration
3. Update any remaining imports to use `@brains/webserver`

### Implement React/Preact Integration

#### 1. Add Astro React Integration

```bash
# In site-builder plugin
npm install @astrojs/react react react-dom
```

#### 2. Update Astro Config

```javascript
// packages/site-builder-plugin/src/templates/astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

#### 3. Update Layout Registration

```typescript
// Use direct component imports instead of paths
import { HeroLayout } from "@brains/default-site-plugin";

context.views.registerLayout({
  name: "hero",
  component: HeroLayout, // Direct component reference
  schema: heroSchema,
});
```

#### 4. Update Astro Templates

```astro
---
// In generated Astro pages
import { HeroLayout } from '@brains/default-site-plugin';
const { sections } = Astro.props;
---

{sections.map(section => {
  const Layout = layouts[section.layout];
  return <Layout {...section.data} client:load={false} />;
})}
```

### Simplify Route and Template Registration

**Current Anti-pattern**: Plugins directly register routes and templates with ViewRegistry during initialization.

**Better Pattern**: Static configuration pushed to site-builder at construction time.

```typescript
// In default-site-plugin - Export static configuration
export const DEFAULT_SITE_ROUTES: RouteDefinition[] = [
  { path: '/', title: 'Home', sections: [...] },
  { path: '/about', title: 'About', sections: [...] }
];

export const DEFAULT_SITE_TEMPLATES: ViewTemplate[] = [
  { name: 'hero', component: HeroLayout, schema: heroSchema },
  { name: 'features', component: FeaturesLayout, schema: featuresSchema }
];

// In app configuration - Push configuration to site-builder
const siteBuilder = new SiteBuilderPlugin({
  outputDir: './website',
  routes: DEFAULT_SITE_ROUTES,
  viewTemplates: DEFAULT_SITE_TEMPLATES
});
```

**Benefits**:

- No registration logic needed in plugins
- Clean separation of concerns
- Site-builder doesn't need to discover or pull from plugins
- Configuration is explicit and testable
- Follows "push, don't pull" principle

## Part 3: Implementation Schedule

### Week 1: Foundation

- [ ] Create facade registries
- [ ] Update plugin context with new registries
- [ ] Create migration guide for plugins

### Week 2: Site Builder Migration

- [ ] Migrate site-builder to use ViewRegistry
- [ ] Implement React integration
- [ ] Remove webserver-plugin

### Week 3: Content & Data Migration

- [ ] Migrate to DataRegistry
- [ ] Migrate to ContentRegistry
- [ ] Update all formatters

### Week 4: Plugin Migration

- [ ] Migrate default-site-plugin
- [ ] Migrate other plugins
- [ ] Update documentation

### Week 5: Cleanup

- [ ] Remove old registries
- [ ] Update all tests
- [ ] Performance optimization

## Part 4: Benefits

### Immediate Benefits

1. **Clearer Architecture**: 4 registries with distinct responsibilities
2. **Better Relationships**: Related concepts grouped together
3. **Easier Plugin Development**: Simpler mental model

### Future Benefits

1. **Multi-format Output**: ViewRegistry enables PDF, email, etc.
2. **Better Type Safety**: Unified interfaces with better types
3. **Performance**: Fewer lookups across registries
4. **Extensibility**: Easier to add new output formats

## Part 5: Risk Mitigation

### Risks

1. **Breaking Changes**: Plugins might break during migration
2. **Hidden Dependencies**: Unknown coupling between registries
3. **Performance**: Facade pattern might add overhead

### Mitigation Strategies

1. **Comprehensive Tests**: Test each phase thoroughly
2. **Gradual Migration**: One component at a time
3. **Rollback Plan**: Keep old registries until fully migrated
4. **Performance Monitoring**: Benchmark before/after

## Success Criteria

1. All plugins working with new registries
2. React components actually rendering in Astro
3. Old registries completely removed
4. No performance degradation
5. Cleaner, more maintainable codebase

## Next Steps

1. Review and approve this plan
2. Create facade implementations
3. Begin migration with site-builder plugin
4. Track progress in project board

## Appendix: Registry Mapping

| Old Registry        | New Registry    | Notes                     |
| ------------------- | --------------- | ------------------------- |
| EntityRegistry      | DataRegistry    | Combined with schemas     |
| SchemaRegistry      | DataRegistry    | Unified validation        |
| ContentTypeRegistry | ContentRegistry | Paired with formatters    |
| FormatterRegistry   | ContentRegistry | Co-located with templates |
| PageRegistry        | ViewRegistry    | Web views                 |
| LayoutRegistry      | ViewRegistry    | Component management      |
| Registry            | Registry        | No change                 |
