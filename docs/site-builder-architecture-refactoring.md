# Site Builder Architecture Refactoring Plan

## Overview

This plan outlines a simplified architecture that allows plugins to be self-contained with their own components while avoiding circular dependencies.

## Updated Architecture

### Core Principles

1. **Self-contained plugins** - Each plugin can include its own Preact components
2. **String-based component paths** - Components are registered by their import path
3. **Component discovery** - Builder discovers components from ViewRegistry at build time
4. **One component per file** - Each Preact component is a default export in its own file

### Component Registration

```typescript
// Updated ViewTemplate interface
export interface ViewTemplate<T = unknown> {
  name: string;
  schema: z.ZodType<T>;
  description?: string;
  renderers: {
    web?: string;  // Always a module path, e.g., "@brains/notes-plugin/components/NoteCard"
  };
}
```

### Plugin Structure Example

```
@brains/notes-plugin/
├── src/
│   ├── components/               # One component per file
│   │   ├── NoteCard.tsx         # export default function NoteCard() {...}
│   │   ├── NotesListing.tsx     # export default function NotesListing() {...}
│   │   └── NoteDetail.tsx       # export default function NoteDetail() {...}
│   ├── plugin.ts                # Plugin registration
│   └── index.ts
└── package.json

@brains/astro-builder-plugin/     # Renamed from site-builder-plugin
├── src/
│   ├── build/                    # Astro-specific build logic
│   │   ├── component-discovery.ts # Discovers components from registry
│   │   └── builder.ts           # Build orchestration
│   ├── tools/                    # Plugin tools
│   │   ├── promote-content.ts
│   │   ├── rollback-content.ts
│   │   └── regenerate-content.ts
│   ├── plugin.ts                # Regular plugin extending BasePlugin
│   └── index.ts
└── package.json                 # Dependencies: astro, @astrojs/preact, @brains/utils
```

### Key Architecture Changes

1. **WebRenderer is always a string** - No more function references
2. **Direct import paths** - Components are referenced by their module path
3. **No separate content packages needed** - Plugins are self-contained
4. **Simple component discovery** - Builder generates imports from registry

## Implementation Plan

### Phase 1: Update Type Definitions

1. Update `@brains/types` ViewTemplate interface:
   ```typescript
   export type WebRenderer = string;  // Always a module path
   
   export interface ViewTemplate<T = unknown> {
     name: string;
     schema: z.ZodType<T>;
     description?: string;
     renderers: {
       web?: string;  // Module path to component
     };
   }
   ```

### Phase 2: Update Existing Plugin

1. Refactor `default-site-plugin` components:
   - Move each component to its own file
   - Ensure default exports
   - Update registrations to use module paths:
   
   ```typescript
   context.viewRegistry.registerViewTemplate({
     name: "hero",
     schema: heroSchema,
     renderers: {
       web: "@brains/default-site-plugin/components/HeroLayout"
     }
   });
   ```

### Phase 3: Transform Site Builder

1. Rename to `@brains/astro-builder-plugin`
2. Implement component discovery:

   ```typescript
   async generateComponentRegistry() {
     const templates = this.context.viewRegistry.listViewTemplates();
     const imports: string[] = [];
     const exports: string[] = [];
     
     for (const template of templates) {
       if (template.renderers.web) {
         imports.push(`import ${template.name} from '${template.renderers.web}';`);
         exports.push(`'${template.name}': ${template.name}`);
       }
     }
     
     return `
       // Auto-generated component registry
       ${imports.join('\n')}
       export const components = { ${exports.join(', ')} };
     `;
   }
   ```

### Phase 4: Handle Package Dependencies

1. **For Development (Workspace builds)**:
   ```json
   // Generated Astro project package.json
   {
     "dependencies": {
       "@brains/*": "workspace:*",
       "astro": "^5.8.1",
       "@astrojs/preact": "^3.0.0",
       "preact": "^10.0.0"
     }
   }
   ```

2. **For Production (External builds)**:
   - Astro builder discovers all plugin dependencies
   - Generates package.json with explicit versions
   - Or use bundling approach for self-contained output

### Phase 5: Update Astro Templates

1. Create dynamic component loader:
   ```astro
   ---
   // DynamicSection.astro
   import { components } from '../generated/components';
   
   const { template, content } = Astro.props;
   const Component = components[template];
   ---
   {Component && <Component {...content} />}
   ```

2. Update page templates to use dynamic components

### Phase 6: Content Management Tools

Implement as plugin tools:

- `promote-content.ts` - Update entity environment tags
- `rollback-content.ts` - Revert to previous version
- `regenerate-content.ts` - Force content regeneration

### Phase 7: Migration and Cleanup

1. Update existing plugins to new component path format
2. Remove old abstractions and base classes
3. Update tests for new architecture
4. Update documentation

## Benefits

1. **Self-contained plugins**
   - Each plugin manages its own components
   - No separate content packages needed
   - True plugin independence

2. **Simple component discovery**
   - Components referenced by import path
   - No complex registration logic
   - Builder generates imports automatically

3. **No circular dependencies**
   - Shell doesn't depend on plugins
   - Generated code imports from plugins
   - Clean dependency graph

4. **Flexibility**
   - Plugins can contribute components and routes
   - Any plugin can extend the site
   - Easy to add new functionality

## Example Usage

### Plugin Registration
```typescript
// In notes-plugin
context.viewRegistry.registerViewTemplate({
  name: "note-card",
  schema: noteCardSchema,
  renderers: {
    web: "@brains/notes-plugin/components/NoteCard"
  }
});

context.viewRegistry.registerRoute({
  path: "/notes",
  title: "Notes",
  sections: [{
    id: "notes-list",
    template: "notes-listing",
    contentEntity: { entityType: "note" }
  }]
});
```

### Generated Component Registry
```typescript
// Auto-generated by astro-builder
import hero from '@brains/default-site-plugin/components/HeroLayout';
import features from '@brains/default-site-plugin/components/FeaturesLayout';
import noteCard from '@brains/notes-plugin/components/NoteCard';
import notesListing from '@brains/notes-plugin/components/NotesListing';

export const components = { hero, features, noteCard, notesListing };
```

## File Operations

### Update

1. `packages/types/src/views.ts` - Change WebRenderer to string type
2. `packages/default-site-plugin/` - Refactor components and update registrations
3. `packages/site-builder-plugin/` → `packages/astro-builder-plugin/`
4. `packages/webserver-template/` - Update to use dynamic component loading

### Archive

1. `docs/preact-astro-integration-plan.md` → `docs/archive/`
2. `docs/site-builder-decoupling-plan.md` → `docs/archive/`
3. `docs/webserver-plugin-plan.md` → `docs/archive/`
4. `docs/webserver-plugin-extension-plan.md` → `docs/archive/`

### No Longer Needed

1. Separate content packages - plugins are now self-contained
2. Complex component registration - just use import paths

## Success Criteria

- [ ] WebRenderer type updated to string-only
- [ ] Plugins can register components with import paths
- [ ] Astro builder discovers and imports components dynamically
- [ ] Generated site includes components from multiple plugins
- [ ] No circular dependencies in build
- [ ] All tests pass
- [ ] Documentation is updated

## Current Status

- [x] Plan created and approved
- [x] Architecture simplified based on discussion
- [ ] Phase 1: Update Type Definitions
- [ ] Phase 2: Update Existing Plugin
- [ ] Phase 3: Transform Site Builder
- [ ] Phase 4: Handle Package Dependencies
- [ ] Phase 5: Update Astro Templates
- [ ] Phase 6: Content Management Tools
- [ ] Phase 7: Migration and Cleanup

## Key Insights from Discussion

1. **Circular dependency concern was unfounded** - Shell doesn't depend on plugins
2. **String-based paths are simpler** - No need for complex component discovery
3. **Workspace resolution solves deps** - Use `workspace:*` for development
4. **One component per file** - Makes imports predictable and clean

This architecture enables true plugin independence while keeping the implementation simple.
