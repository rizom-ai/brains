# Unified Template Registry Architecture Plan

## Overview

This document outlines the architectural refactoring to implement a single, centralized template registry that eliminates the complexity of split template management across multiple services.

## Problem Statement

### Current Architecture Issues

1. **Fragmented Template Storage**
   - ContentService has `Map<string, ContentTemplate>`
   - ViewRegistry has `Map<string, ViewTemplate>`
   - Templates split across registries lose information

2. **Type Conversion Complexity**
   - Template → ContentTemplate conversion loses view info
   - Template → ViewTemplate conversion loses content info
   - Reconstruction requires complex logic

3. **Information Loss**
   - `providerId` lost during ViewTemplate conversion
   - Formatter information not accessible to view layer
   - No single source of truth for template metadata

## Proposed Solution

### Unified Template Registry Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Shell                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TemplateRegistry                       │   │
│  │        Map<string, Template>                        │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │           Single Source of Truth            │   │   │
│  │  │  - providerId                               │   │   │
│  │  │  - formatter                                │   │   │
│  │  │  - layout                                   │   │   │
│  │  │  - basePrompt                               │   │   │
│  │  │  - schema                                   │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────┐
    │            Services Query Central Registry              │
    │                                                         │
    │  ContentService        ViewRegistry        SiteBuilder  │
    │      │                     │                    │       │
    │      ▼                     ▼                    ▼       │
    │  getTemplate()        getTemplate()       getTemplate() │
    │  (for generation)     (for rendering)     (for logic)   │
    └─────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Move Templates Package to Core

1. **Relocate Package**

   ```bash
   mv shared/templates shell/templates
   ```

2. **Update Package Definition**

   ```json
   // shell/templates/package.json
   {
     "name": "@brains/templates",
     "description": "Core template definitions and registry"
   }
   ```

3. **Update Workspace References**
   - Update turbo.json
   - Update package.json workspace references

### Phase 2: Implement Central Registry

1. **Create TemplateRegistry Class**

   ```typescript
   // shell/templates/src/registry.ts
   export class TemplateRegistry {
     private templates = new Map<string, Template>();

     register(name: string, template: Template): void {
       this.templates.set(name, template);
     }

     get(name: string): Template | undefined {
       return this.templates.get(name);
     }

     getAll(): Map<string, Template> {
       return new Map(this.templates);
     }

     has(name: string): boolean {
       return this.templates.has(name);
     }

     list(): Template[] {
       return Array.from(this.templates.values());
     }

     clear(): void {
       this.templates.clear();
     }
   }
   ```

2. **Export from Templates Package**
   ```typescript
   // shell/templates/src/index.ts
   export { TemplateRegistry } from "./registry";
   export type { Template, TemplateInput, ComponentType } from "./types";
   export {
     TemplateSchema,
     createTypedComponent,
     createTemplate,
   } from "./types";
   ```

### Phase 3: Update Shell Integration

1. **Add Registry to Shell**

   ```typescript
   // shell/core/src/shell.ts
   import { TemplateRegistry } from "@brains/templates";

   export class Shell {
     private templateRegistry = new TemplateRegistry();

     public registerTemplate(
       name: string,
       template: Template,
       pluginId?: string,
     ): void {
       const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;

       // Store in central registry
       this.templateRegistry.register(scopedName, template);

       // Services can query the registry as needed
       this.logger.debug(`Registered template: ${scopedName}`);
     }

     public getTemplate(name: string): Template | undefined {
       return this.templateRegistry.get(name);
     }

     public getTemplateRegistry(): TemplateRegistry {
       return this.templateRegistry;
     }
   }
   ```

### Phase 4: Update Services

1. **ContentService Refactoring**

   ```typescript
   // Remove internal template storage
   // private templates: Map<string, ContentTemplate<unknown>> = new Map();

   constructor(
     private shell: IShell,  // Add shell reference
     // ... other dependencies
   ) {}

   getTemplate(name: string): Template | undefined {
     return this.shell.getTemplate(name);
   }

   // Content generation uses template directly from registry
   async generateContent(templateName: string, context?: GenerationContext): Promise<T> {
     const template = this.getTemplate(templateName);
     if (!template) throw new Error(`Template not found: ${templateName}`);

     // Use template properties directly
     if (template.providerId) {
       return this.fetchFromProvider(template.providerId);
     }

     // ... rest of generation logic
   }
   ```

2. **ViewRegistry Refactoring**

   ```typescript
   // Remove ViewTemplateRegistry
   constructor(private shell: IShell) {}

   getTemplate(name: string): Template | undefined {
     return this.shell.getTemplate(name);
   }

   // Rendering uses template directly from registry
   render(templateName: string, data: unknown): string {
     const template = this.getTemplate(templateName);
     if (!template?.layout?.component) {
       throw new Error(`No layout component for template: ${templateName}`);
     }

     // Use template.layout.component for rendering
   }
   ```

3. **ServicePluginContext Update**
   ```typescript
   // shell/plugins/src/service/context.ts
   getTemplate: (templateName: string) => {
     return shell.getTemplate(templateName);
   };
   ```

## Benefits

### 1. Architectural Clarity

- **Single source of truth** for all template data
- **Clear ownership** - templates package owns template management
- **Simplified data flow** - no conversions or reconstructions

### 2. Preserved Information

- **All template properties available** everywhere (providerId, formatter, layout)
- **No information loss** during service interactions
- **Consistent template access** across all components

### 3. Developer Experience

- **Simpler debugging** - one place to look for template issues
- **Easier testing** - mock the registry, not individual services
- **Clear API** - `shell.getTemplate(name)` works everywhere

### 4. Performance Benefits

- **No duplicate storage** of template data
- **No conversion overhead** between template types
- **Direct access** to template properties

## Migration Strategy

### Breaking Changes

- Template package moves from shared to shell
- ContentService and ViewRegistry APIs change
- Import paths update across codebase

### Migration Steps

1. **Create new unified registry** (backward compatible)
2. **Update Shell** to use registry
3. **Migrate ContentService** to query registry
4. **Migrate ViewRegistry** to query registry
5. **Update all imports** across codebase
6. **Remove old registry implementations**
7. **Test thoroughly** - especially site-builder provider pattern

### Compatibility Plan

- Maintain existing public APIs during migration
- Use feature flags if needed for gradual rollout
- Comprehensive test coverage before removing old code

## Testing Strategy

### Unit Tests

- TemplateRegistry operations (register, get, list, etc.)
- Shell template management
- Service integration with registry

### Integration Tests

- End-to-end template registration and usage
- Provider pattern with real data fetching
- Site building with unified templates

### Migration Tests

- Before/after behavior comparison
- Performance benchmarks
- Memory usage validation

## Future Enhancements

### 1. Template Validation

```typescript
// Validate templates on registration
register(name: string, template: Template): ValidationResult {
  return this.validator.validate(template);
}
```

### 2. Template Versioning

```typescript
interface Template {
  version?: string;
  // ... other properties
}
```

### 3. Plugin-Scoped Queries

```typescript
// Get all templates for a specific plugin
getPluginTemplates(pluginId: string): Template[]
```

### 4. Template Dependencies

```typescript
interface Template {
  dependencies?: string[]; // Other template names
  // ... other properties
}
```

## Success Metrics

1. **Reduced Complexity**
   - Fewer template-related classes and interfaces
   - Simpler service implementations
   - Clearer code organization

2. **Improved Reliability**
   - No information loss during template operations
   - Provider pattern works correctly
   - Dashboard shows real-time data

3. **Better Performance**
   - Reduced memory usage (no duplicate storage)
   - Faster template lookups (direct registry access)
   - Eliminated conversion overhead

4. **Enhanced Developer Experience**
   - Single API for template access
   - Easier debugging and testing
   - Clear architecture documentation

## Conclusion

The unified template registry architecture represents a significant improvement over the current fragmented approach. By centralizing template management in a dedicated registry within the templates package, we achieve better separation of concerns, eliminate information loss, and create a foundation for future template-related features.

This refactoring directly enables the provider pattern implementation, ensuring that dynamic content like dashboards can fetch fresh data at build time while maintaining backward compatibility for static content generation.
