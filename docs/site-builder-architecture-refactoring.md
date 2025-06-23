# Site Builder Architecture Refactoring Plan

## Overview

This plan outlines a comprehensive refactoring to create a clean separation between content and build systems, eliminating unnecessary abstractions and complexity.

## New Architecture

### Package Structure

```
@brains/default-site-content/     # Content package (new)
├── src/
│   ├── routes/                   # Route definitions
│   │   └── landing.ts
│   ├── templates/                # Template configurations
│   │   ├── hero.ts
│   │   ├── features.ts
│   │   └── ...
│   ├── components/               # Preact/React components
│   │   ├── hero/
│   │   │   ├── HeroLayout.tsx
│   │   │   └── index.ts
│   │   ├── features/
│   │   │   ├── FeaturesLayout.tsx
│   │   │   └── index.ts
│   │   └── ...
│   ├── schemas/                  # Zod schemas
│   └── index.ts                  # Exports everything
└── package.json                  # Dependencies: preact, zod, @brains/types

@brains/astro-builder-plugin/     # Renamed from site-builder-plugin
├── src/
│   ├── build/                    # Astro-specific build logic
│   │   ├── astro.config.ts      # Astro configuration with Preact
│   │   └── builder.ts           # Build orchestration
│   ├── tools/                    # Plugin tools
│   │   ├── promote-content.ts
│   │   ├── rollback-content.ts
│   │   └── regenerate-content.ts
│   ├── plugin.ts                # Regular plugin extending BasePlugin
│   └── index.ts
└── package.json                 # Dependencies: astro, @astrojs/preact, @brains/utils
```

### Key Architecture Decisions

1. **No base classes** - Each builder plugin is independent
2. **Content packages are pure data** - Just routes, templates, components
3. **Builder plugins are regular plugins** - Extend BasePlugin directly
4. **Maximum flexibility** - No forced interfaces or inheritance

## Implementation Plan

### Phase 1: Create Content Package (Day 1)

1. Create `@brains/default-site-content`:
   ```typescript
   // src/index.ts
   export { routes } from './routes';
   export { templates } from './templates';
   export * from './components';
   export * from './schemas';
   ```

2. Move from default-site-plugin:
   - All route definitions
   - All Preact components
   - All schemas
   - Template configurations

### Phase 2: Transform Site Builder (Days 2-3)

1. Rename to `@brains/astro-builder-plugin`
2. Remove all abstractions, just make it a plugin that builds sites:
   ```typescript
   export class AstroBuilderPlugin extends BasePlugin {
     constructor() {
       super('astro-builder', 'Astro Site Builder', 'Builds static sites with Astro');
     }
     
     protected async getTools(): Promise<PluginTool[]> {
       return [
         this.createBuildTool(),
         this.createPromoteTool(),
         this.createRollbackTool(),
       ];
     }
   }
   ```

3. Import content directly:
   ```typescript
   import { routes, components } from '@brains/default-site-content';
   ```

### Phase 3: Implement Build Logic (Day 4)

1. Move Astro config into plugin
2. Configure Preact integration
3. Build process:
   ```typescript
   async build(options: BuildOptions) {
     // 1. Query existing content entities
     // 2. Generate missing content
     // 3. Write to Astro content directory
     // 4. Run Astro build
     // 5. Copy output to final destination
   }
   ```

### Phase 4: Content Management Tools (Day 5)

Implement as simple tool functions:
- `promote-content.ts` - Update entity environment tags
- `rollback-content.ts` - Revert to previous version
- `regenerate-content.ts` - Force content regeneration

### Phase 5: Cleanup (Day 6)

1. Delete `packages/default-site-plugin/`
2. Delete `packages/webserver-plugin/` (if exists)
3. Update all imports
4. Fix tests
5. Update documentation

## Benefits

1. **Simplicity**
   - No unnecessary abstractions
   - Clear, direct code
   - Easy to understand

2. **Flexibility**
   - Content packages work with any builder
   - Builders work with any content
   - No coupling

3. **Maintainability**
   - Each package has one clear purpose
   - No complex inheritance
   - Easy to test

## Example Usage

```typescript
// In astro-builder-plugin
import { routes, components } from '@brains/default-site-content';

// Use directly in build
const astroPages = routes.map(route => ({
  path: route.path,
  component: components[route.template],
  data: route.data,
}));
```

## File Operations

### Create
1. `docs/site-builder-architecture-refactoring.md` (this document)
2. `packages/default-site-content/` (new package)

### Update
1. `packages/site-builder-plugin/` → `packages/astro-builder-plugin/`

### Archive
1. `docs/preact-astro-integration-plan.md` → `docs/archive/`
2. `docs/site-builder-decoupling-plan.md` → `docs/archive/`
3. `docs/webserver-plugin-plan.md` → `docs/archive/`
4. `docs/webserver-plugin-extension-plan.md` → `docs/archive/`

### Delete
1. `packages/default-site-plugin/` (entire directory)
2. `packages/webserver-plugin/` (if exists)

## Success Criteria

- [ ] Content package exports work correctly
- [ ] Astro builder can import and use Preact components
- [ ] Build process generates working site
- [ ] Content promotion/rollback tools function
- [ ] All tests pass
- [ ] Documentation is updated

## Current Status

- [x] Plan created and approved
- [ ] Phase 1: Create Content Package
- [ ] Phase 2: Transform Site Builder
- [ ] Phase 3: Implement Build Logic
- [ ] Phase 4: Content Management Tools
- [ ] Phase 5: Cleanup

This final architecture is clean, simple, and highly flexible.