# Plugin Architecture Analysis & Refactoring Plan

## Summary of Phase 0 Completion

Phase 0 has been successfully completed. All the success criteria have been met:
- ✅ No imports from `@brains/shell/src/*` in webserver plugin
- ✅ All existing tests pass
- ✅ Plugin functionality unchanged
- ✅ Type checking passes
- ✅ Services accessed through PluginContext
- ✅ Shell provides clean integration methods

## Current Plugin Patterns Analysis

### 1. **Service Access Pattern**
Both plugins now access services through PluginContext:
- Git-sync: Uses `registry.resolve<EntityService>("entityService")`
- Webserver: Uses `context.entityService` and `context.contentTypeRegistry`

**Observation**: Git-sync still uses the older registry pattern while webserver uses direct context access.

### 2. **Content Generation Pattern**
- Webserver plugin defines content templates with schemas and formatters
- Uses `context.generateContent()` for AI-powered content creation
- Templates include basePrompt + schema + formatter
- Content is saved as `generated-content` entities

### 3. **Entity Registration Pattern**
- Plugins register custom entity types with schema + adapter
- Formatters are registered separately in the formatter registry
- Content types are registered for generation without creating new entity types

### 4. **Tool Definition Pattern**
- Tools are defined with name, description, inputSchema, and handler
- Handlers can receive progress context for long-running operations
- Tools return structured data that can be formatted

### 5. **Configuration Pattern**
- Plugins receive configuration through constructor
- Configuration is validated with Zod schemas
- Plugin options are passed during instantiation

## Proposed Abstractions

### 1. **Unified Service Access**
Standardize all plugins to use direct context access:
```typescript
// Update git-sync to match webserver pattern
const { entityService } = context;
// Instead of: registry.resolve<EntityService>("entityService")
```

### 2. **Content Generation Framework**
Extract common content generation patterns into a base class:
```typescript
abstract class ContentGeneratingPlugin implements Plugin {
  protected templates: ContentTemplate[] = [];
  
  protected registerTemplates(context: PluginContext): void {
    this.templates.forEach(template => {
      context.contentTypes.register(
        template.name,
        template.schema,
        template.formatter
      );
    });
  }
  
  protected async generateFromTemplate<T>(
    context: PluginContext,
    templateName: string,
    additionalContext?: Record<string, unknown>
  ): Promise<T> {
    const template = this.templates.find(t => t.name === templateName);
    if (!template) throw new Error(`Template ${templateName} not found`);
    
    return context.generateContent({
      schema: template.schema,
      prompt: template.basePrompt,
      contentType: templateName,
      context: additionalContext
    });
  }
}
```

### 3. **Plugin Base Class**
Create a base plugin class with common patterns:
```typescript
abstract class BasePlugin implements Plugin {
  abstract id: string;
  abstract version: string;
  abstract name: string;
  abstract description: string;
  
  protected logger: Logger;
  protected config: unknown;
  
  constructor(config?: unknown) {
    this.config = this.validateConfig(config);
  }
  
  protected abstract validateConfig(config: unknown): unknown;
  
  protected abstract defineTools(): PluginTool[];
  
  protected abstract defineResources(): PluginResource[];
  
  async register(context: PluginContext): Promise<PluginCapabilities> {
    this.logger = context.logger.child(this.id);
    
    // Allow plugins to do custom registration
    await this.onRegister(context);
    
    return {
      tools: this.defineTools(),
      resources: this.defineResources()
    };
  }
  
  protected abstract onRegister(context: PluginContext): Promise<void>;
}
```

### 4. **Tool Builder Utility**
Create a fluent API for building tools:
```typescript
class ToolBuilder {
  static create(name: string)
    .description(desc: string)
    .schema(schema: ZodSchema)
    .handler(fn: ToolHandler)
    .withProgress()
    .build(): PluginTool;
}

// Usage:
const tool = ToolBuilder
  .create("git_sync")
  .description("Synchronize all entities with git repository")
  .schema(z.object({}))
  .handler(async () => ({ message: "Sync completed" }))
  .build();
```

### 5. **Entity Type Builder**
Simplify entity type registration:
```typescript
class EntityTypeBuilder {
  static create(type: string)
    .schema(schema: ZodSchema)
    .adapter(adapter: EntityAdapter)
    .formatter(formatter: ContentFormatter)
    .register(context: PluginContext): void;
}
```

## Implementation Plan

### Phase 1: Standardize Existing Plugins (Week 1)
1. Update git-sync to use direct context access pattern
2. Extract common plugin configuration validation
3. Create plugin test utilities for common test scenarios
4. Document the standardized patterns

### Phase 2: Create Base Abstractions (Week 2)
1. Implement BasePlugin class
2. Create ContentGeneratingPlugin class
3. Build ToolBuilder and EntityTypeBuilder utilities
4. Add TypeScript generics for better type safety

### Phase 3: Refactor Existing Plugins (Week 3)
1. Migrate webserver plugin to use new abstractions
2. Migrate git-sync plugin to use new abstractions
3. Update plugin test harness to support new patterns
4. Create plugin development guide

### Phase 4: Plugin Developer Experience (Week 4)
1. Create plugin generator CLI command
2. Add plugin development documentation
3. Create example plugins demonstrating patterns
4. Add plugin validation and testing utilities

## Benefits

1. **Consistency**: All plugins follow the same patterns
2. **Less Boilerplate**: Base classes handle common functionality
3. **Better Testing**: Shared test utilities and patterns
4. **Easier Development**: Clear patterns and utilities for plugin authors
5. **Type Safety**: Better TypeScript support throughout
6. **Maintainability**: Changes to core patterns only need updates in base classes

## Next Steps

1. Review and approve this plan
2. Create detailed technical specifications for each abstraction
3. Begin Phase 1 implementation with git-sync updates
4. Set up plugin development documentation structure