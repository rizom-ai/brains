# Preact/Astro Integration Plan

## Overview

This document outlines the plan for integrating Preact components into the site-builder's Astro-based static site generation. The approach prioritizes static rendering initially while maintaining a clear path to client-side interactivity.

## Current State

### What We Have

- **ViewRegistry**: Centralized registry for routes and view templates in shell
- **ViewTemplate Interface**: Supports component registration with schemas
- **Site-builder**: Generates static sites using Astro
- **React Components**: Existing layouts written as TSX components in default-site-plugin

### The Gap

- Astro needs component imports at build time
- ViewRegistry registers components at runtime
- No mechanism to bridge runtime registrations to build-time imports
- **Plugin packages are not accessible in the Astro build context**

## Proposed Solution: Component File Copying

### Core Approach

Copy component files from plugins to the Astro working directory during build, maintaining the ability to use them as real components while solving the package accessibility issue.

### Key Principles

1. **Static First**: All components render to static HTML initially
2. **Progressive Enhancement Ready**: Easy to add client-side interactivity later
3. **Type Safety**: Maintain TypeScript support throughout
4. **Self-Contained Builds**: All necessary files copied to working directory

## Implementation Phases

### Phase 1: Component Source Tracking

**Goal**: Track the file path of each registered component

1. Extend ViewTemplate to include source information:

   ```typescript
   interface ViewTemplate<T = unknown> {
     name: string;
     component: ComponentType<T>;
     schema: z.ZodType<T>;
     description?: string;
     // New field for component file path
     componentPath?: string;
   }
   ```

2. Update plugin registration to include paths:
   ```typescript
   context.viewRegistry.registerViewTemplate({
     name: "hero",
     component: HeroLayout,
     componentPath: __filename, // or resolve to the actual component file
     schema: heroSchema,
   });
   ```

### Phase 2: Dependency Analysis

**Goal**: Identify all files that a component depends on

1. Create a dependency analyzer:

   ```typescript
   class ComponentDependencyAnalyzer {
     async analyzeDependencies(componentPath: string): Promise<Set<string>> {
       // Parse the component file
       // Extract all imports
       // Recursively analyze imported files
       // Return set of all dependent file paths
     }
   }
   ```

2. Handle different import types:
   - Relative imports: `./schema`, `../utils/format`
   - Package imports: Filter out external packages
   - Type imports: Include for TypeScript compilation

### Phase 3: File Copying System

**Goal**: Copy components and their dependencies to working directory

1. Create component copier:

   ```typescript
   class ComponentFileCopier {
     async copyComponent(
       componentPath: string,
       dependencies: Set<string>,
       targetDir: string,
     ): Promise<string> {
       // Copy component file
       // Copy all dependencies
       // Maintain relative directory structure
       // Return new component path in target directory
     }
   }
   ```

2. Directory structure in working directory:
   ```
   .astro-work/
   ├── src/
   │   ├── components/
   │   │   ├── hero/
   │   │   │   ├── layout.tsx
   │   │   │   ├── schema.ts
   │   │   │   └── utils.ts
   │   │   └── features/
   │   │       ├── layout.tsx
   │   │       └── schema.ts
   │   └── generated/
   │       └── view-templates.ts
   ```

### Phase 4: Import Path Rewriting

**Goal**: Update imports in copied files to work in new location

1. Create import rewriter:

   ```typescript
   class ImportRewriter {
     rewriteImports(
       fileContent: string,
       originalPath: string,
       newPath: string,
     ): string {
       // Parse imports
       // Calculate new relative paths
       // Rewrite import statements
       // Handle both static and dynamic imports
     }
   }
   ```

2. Transform imports:

   ```typescript
   // Original in plugin
   import { formatDate } from "../../../utils/date";

   // Rewritten in working directory
   import { formatDate } from "./utils/date";
   ```

### Phase 5: Generate View Templates Module

**Goal**: Create module that imports copied components

1. Generate after copying all components:

   ```typescript
   // src/generated/view-templates.ts
   import { HeroLayout } from "../components/hero/layout";
   import { FeaturesLayout } from "../components/features/layout";

   export const viewTemplates = new Map([
     ["hero", HeroLayout],
     ["features", FeaturesLayout],
   ]);
   ```

### Phase 6: Update Astro Pages

**Goal**: Use the copied components in Astro

1. Create dynamic page that uses generated module:

   ```astro
   ---
   import { viewTemplates } from '../generated/view-templates';
   import BaseLayout from '../layouts/BaseLayout.astro';

   const route = await getRouteData();
   ---

   <BaseLayout title={route.title}>
     {route.sections.map((section) => {
       const Component = viewTemplates.get(section.template);
       return <Component {...section.content} />;
     })}
   </BaseLayout>
   ```

## Technical Considerations

### Dependency Resolution

1. **AST Parsing**: Use TypeScript compiler API or Babel to parse files
2. **Import Resolution**: Follow Node.js resolution algorithm
3. **Circular Dependencies**: Track visited files to avoid infinite loops
4. **External Packages**: Skip node_modules imports

### File Copying

1. **Preserve Structure**: Maintain relative paths between files
2. **Handle Binary Files**: Copy images, fonts if referenced
3. **Source Maps**: Consider copying for debugging
4. **File Watching**: In dev mode, watch for changes

### Import Rewriting

1. **Path Calculation**: Use path.relative() for new paths
2. **Preserve Syntax**: Maintain import style (named, default, etc.)
3. **Dynamic Imports**: Handle import() expressions
4. **Type Imports**: Preserve `import type` statements

## Implementation Example

```typescript
// In site-builder.ts
private async copyComponentsToWorkingDir(
  staticSiteBuilder: StaticSiteBuilder
): Promise<Map<string, string>> {
  const componentMap = new Map<string, string>();
  const templates = this.context.viewRegistry.listViewTemplates();

  for (const template of templates) {
    if (template.componentPath) {
      // Analyze dependencies
      const deps = await this.analyzer.analyzeDependencies(
        template.componentPath
      );

      // Copy files
      const newPath = await this.copier.copyComponent(
        template.componentPath,
        deps,
        path.join(workingDir, 'src/components', template.name)
      );

      componentMap.set(template.name, newPath);
    }
  }

  return componentMap;
}
```

## Challenges and Solutions

### Challenge: Complex Dependencies

**Solution**: Start with simple components, add dependency analysis incrementally

### Challenge: Performance

**Solution**: Cache dependency analysis, parallelize file copying

### Challenge: Type Definitions

**Solution**: Copy .d.ts files, ensure tsconfig.json includes them

### Challenge: CSS/Assets

**Solution**: Parse for asset imports, copy referenced files

## Testing Strategy

1. **Unit Tests**:

   - Test dependency analyzer with various import patterns
   - Test import rewriter with edge cases
   - Test file copier with different structures

2. **Integration Tests**:
   - Copy a complete component with dependencies
   - Build Astro site with copied components
   - Verify rendered HTML output

## Future Enhancements

1. **Caching**: Cache copied components between builds
2. **Hot Reload**: Watch component files in development
3. **Optimization**: Tree-shake unused dependencies
4. **Bundling Option**: Pre-bundle components as alternative

## Success Criteria

1. Components render correctly in Astro build
2. All dependencies are resolved and copied
3. TypeScript types work in the build
4. Clear path to add hydration later
5. Reasonable build performance

## Next Steps

1. Implement basic file copier without dependency analysis
2. Test with simple components (no dependencies)
3. Add dependency analyzer
4. Handle import rewriting
5. Test with complex components
