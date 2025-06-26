# Content Generation Architecture Refactor Plan

## Current State Analysis

**ContentGenerationService** currently has multiple APIs:

- `generate<T>(options: ContentGenerateOptions<T>)` - Low-level with schema/prompt
- `generateFromTemplate(templateName, options)` - Template-based but returns `unknown`
- `generateContent(contentType, options)` - High-level, requires template registration

**Problems:**

1. **Inconsistent APIs**: 3 different ways to generate content
2. **Manual template resolution**: Site-builder plugin manually resolves templates, handles errors, formats content
3. **Duplication**: ~150+ lines of template resolution/formatting logic duplicated across plugin
4. **Complex dependencies**: SiteContentGenerator needs entire PluginContext
5. **Architecture violation**: ContentGenerationService should handle ALL template concerns

## Impact Assessment Across Codebase

### Files Affected by This Refactor:

#### **Direct API Changes:**

1. **`packages/shell/src/content/contentGenerationService.ts`** - Remove `generate<T>()` and `generateFromTemplate()`, simplify to template-only API
2. **`packages/types/src/services.ts`** - Update `ContentGenerationService` interface
3. **`packages/types/src/plugin.ts`** - Remove `ContentGenerateOptions` from PluginContext
4. **`packages/shell/src/plugins/pluginManager.ts`** - Update PluginContext.generateContent to template-only

#### **Utility Functions:**

5. **`packages/utils/src/content-generation.ts`** - Update `generateWithTemplate()` to use new API
6. **`packages/utils/src/plugin/content-generating-plugin.ts`** - Refactor to use template-only generation

#### **MCP/Shell Tools:**

7. **`packages/shell/src/mcp/adapters.ts`** - Update ContentGenerationAdapter to template-only
8. **`packages/shell/src/mcp/tools.ts`** - Update shell tools registration
9. **`packages/shell/src/mcp/resources.ts`** - Content generation resources
10. **`packages/shell/src/shell.ts`** - Shell content generation integration

#### **Site-Builder Plugin (Major Changes):**

11. **`packages/site-builder-plugin/src/plugin.ts`** - Remove ~150+ lines, use ContentGenerator
12. **`packages/site-builder-plugin/src/content-generation/`** - Delete entire directory, move to new package
13. **`packages/site-builder-plugin/src/content-management/manager.ts`** - Simplify callbacks to use ContentGenerator

#### **Tests (All Need Updates):**

14. **`packages/shell/test/content/contentGenerationService.test.ts`** - Update for template-only API
15. **`packages/shell/test/plugins/pluginManager.test.ts`** - Update PluginContext tests
16. **`packages/shell/test/mcp/*.test.ts`** - Update MCP adapter tests
17. **`packages/integration-tests/test/content-generation-plugin.test.ts`** - Update integration tests
18. **`packages/utils/test/content-generation.test.ts`** - Update utility tests
19. **`packages/site-builder-plugin/test/unit/plugin.test.ts`** - Major refactor for ContentGenerator

### Breaking Changes Impact:

#### **High Impact:**

- **Any plugin using `context.generateContent()` with raw schema/prompt** → Must migrate to template-based
- **Custom plugins extending `ContentGeneratingPlugin`** → May need refactoring
- **Tests relying on low-level APIs** → Need complete rewrite

#### **Medium Impact:**

- **MCP tools expecting low-level content generation** → Simplified interface
- **Shell integration tests** → Template registration patterns change

#### **Low Impact:**

- **Template registration** → Mostly compatible, auto-formatting added
- **Plugin registration** → Minimal changes to template namespacing

## Proposed Architecture

### 1. Create `@brains/content-generator` Package

**New standalone package with:**

- `ContentGenerator` class (Component Interface Standardization pattern)
- Template-only content generation (no raw schema/prompt API)
- Automatic formatting, validation, error handling
- Clean dependency injection for testing
- **Convenience methods for common patterns**

### 2. Refactor ContentGenerationService in Shell

**Simplify to single template-based API:**

```typescript
interface ContentGenerationService {
  // ONLY template-based generation - always returns formatted string
  generateContent(
    templateName: string,
    options: {
      prompt?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<string>;

  // Template management
  registerTemplate<T>(name: string, template: ContentTemplate<T>): void;
  getTemplate(name: string): ContentTemplate<unknown> | null;
  listTemplates(): ContentTemplate<unknown>[];
}
```

### 3. Update PluginContext

**Remove low-level generateContent, expose only:**

```typescript
interface PluginContext {
  generateContent(
    templateName: string,
    options?: GenerationOptions,
  ): Promise<string>;
  // ... other services
}
```

### 4. Refactor Site-Builder Plugin

**Eliminate ~150+ lines of duplication:**

- Remove `SiteContentGenerator` (logic moves to `@brains/content-generator`)
- Remove manual template resolution
- Remove content formatting logic
- Use `generateWithRoute()` convenience method

## Implementation Steps

### Phase 1: Create Content Generator Package

1. **Create `packages/content-generator/`**

   - `ContentGenerator` class with Component Interface Standardization
   - Template resolution, validation, formatting
   - Clean dependency injection interface

2. **Core API:**

   ```typescript
   interface ContentGeneratorDependencies {
     generateWithTemplate: (
       template: ContentTemplate,
       context: any,
     ) => Promise<unknown>;
     getTemplate: (name: string) => ContentTemplate | null;
     listRoutes: () => RouteDefinition[];
     logger: Logger;
   }

   class ContentGenerator {
     // Core method
     generateContent(
       templateName: string,
       context: GenerationContext,
     ): Promise<string>;

     // Convenience method for route-based generation
     generateWithRoute(
       route: RouteDefinition,
       section: SectionDefinition,
       progressInfo: ProgressInfo,
       additionalContext?: Record<string, unknown>,
     ): Promise<string>;

     // For regeneration workflows
     regenerateContent(
       entityType: string,
       page: string,
       section: string,
       mode: RegenerationMode,
       progressInfo: ProgressInfo,
       currentContent?: string,
     ): Promise<{ entityId: string; content: string }>;
   }
   ```

### Phase 2: Refactor Shell ContentGenerationService

1. **Remove legacy APIs:**

   - Delete `generate<T>(options)` (raw schema/prompt)
   - Delete `generateFromTemplate()` (confusing intermediate)
   - Keep only `generateContent(templateName, options)` → returns formatted string

2. **Update dependent files:**
   - `types/src/services.ts` - Remove `ContentGenerateOptions` from interface
   - `shell/src/mcp/adapters.ts` - Update ContentGenerationAdapter
   - `utils/src/content-generation.ts` - Update `generateWithTemplate()`
   - `utils/src/plugin/content-generating-plugin.ts` - Refactor for template-only

### Phase 3: Update PluginContext & Plugin Manager

1. **Simplify PluginContext.generateContent:**

   - Remove schema/prompt parameters in `shell/src/plugins/pluginManager.ts`
   - Only accept templateName + context
   - Return formatted string

2. **Update plugin registration:**
   - Auto-namespace template names with pluginId
   - Validate template registration

### Phase 4: Refactor Site-Builder Plugin

1. **Replace SiteContentGenerator with ContentGenerator**
2. **Simplify generateContentForSection:**
   ```typescript
   private async generateContentForSection(
     route: RouteDefinition,
     section: SectionDefinition,
     progress: ProgressInfo,
   ): Promise<{ content: string }> {
     const content = await this.contentGenerator.generateWithRoute(
       route,
       section,
       progress,
       { ...this.config.siteConfig }
     );
     return { content };
   }
   ```
3. **Delete ~150+ lines of template resolution/formatting**
4. **Update site-builder tests extensively**

### Phase 5: Update Tests & Other Plugins

1. **Update all test files:**

   - `shell/test/content/contentGenerationService.test.ts` - Template-only API
   - `shell/test/plugins/pluginManager.test.ts` - New PluginContext
   - `shell/test/mcp/*.test.ts` - Updated MCP adapters
   - `integration-tests/test/content-generation-plugin.test.ts` - Integration changes
   - `utils/test/content-generation.test.ts` - Utility updates

2. **Scan for other plugins using old APIs:**
   - Any plugin calling `context.generateContent()` with schema/prompt must migrate
   - Update `ContentGeneratingPlugin` base class usage

### Phase 6: Clean Up Legacy Code

1. **Remove unused types:**

   - `ContentGenerateOptions` from types package
   - Any references to schema/prompt generation

2. **Update documentation:**
   - Plugin development guides
   - Content generation patterns
   - Migration guide for existing plugins

## Benefits

✅ **Massive code reduction**: ~150+ lines eliminated from site-builder plugin  
✅ **Convenience API**: `generateWithRoute()` handles common route→content pattern  
✅ **Single responsibility**: ContentGenerationService only handles templates  
✅ **Consistent API**: One way to generate content across all plugins  
✅ **Better testing**: Clean dependency injection, focused responsibilities  
✅ **Reusable**: `@brains/content-generator` can be used by any plugin  
✅ **Type safety**: Always returns formatted strings, no `unknown` types  
✅ **Architecture alignment**: Forces template-first design across all plugins

## Risk Mitigation

- **Incremental rollout**: Can implement alongside existing APIs initially
- **Backward compatibility**: Keep old APIs temporarily with deprecation warnings
- **Thorough testing**: Each phase has isolated, testable changes
- **Convenience methods**: `generateWithRoute()` makes migration easier for plugins
- **Migration guide**: Clear documentation for updating existing plugins

## Files Requiring Manual Review After Implementation:

1. Any custom plugins in the ecosystem using `ContentGenerateOptions`
2. Documentation and examples referencing old APIs
3. Any external integrations expecting the old interface

This refactor will eliminate significant code duplication while creating a cleaner, more maintainable content generation architecture with convenient APIs for common patterns.
