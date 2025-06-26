# Content Generation Architecture Refactor Plan

## Current State Analysis

**Content Generation is fragmented across multiple services:**

- **ContentGenerationService**: Template-based generation with 3 different APIs
- **QueryProcessor**: Entity-aware content generation with schema validation
- **Site-builder plugin**: Manual template resolution and content formatting

**Problems:**

1. **Fragmented architecture**: Content generation logic scattered across multiple services
2. **Inconsistent APIs**: 3+ different ways to generate content
3. **QueryProcessor duplication**: Essentially another form of content generation
4. **Manual template resolution**: Site-builder plugin manually resolves templates, handles errors, formats content
5. **Duplication**: ~150+ lines of template resolution/formatting logic duplicated across plugin
6. **Complex dependencies**: Multiple services need QueryProcessor, ContentGenerationService, etc.
7. **Architecture violation**: All content generation should flow through unified template system

## Impact Assessment Across Codebase

### Files Affected by This Refactor:

#### **Major Architecture Changes:**

1. **`packages/shell/src/content/contentGenerationService.ts`** - **MOVE ENTIRE CLASS** to @brains/content-generator
2. **`packages/shell/src/query/queryProcessor.ts`** - **MOVE FUNCTIONALITY** to @brains/content-generator
3. **`packages/shell/src/query/`** - **DELETE DIRECTORY** entirely
4. **`packages/shell/src/content/`** - **DELETE DIRECTORY** entirely
5. **`packages/types/src/services.ts`** - Remove ContentGenerationService and QueryProcessor interfaces
6. **`packages/types/src/plugin.ts`** - Remove ContentGenerateOptions from PluginContext
7. **`packages/shell/src/plugins/pluginManager.ts`** - Update PluginContext to use ContentGenerator only
8. **`packages/shell/src/shell.ts`** - Replace QueryProcessor with ContentGenerator

#### **Utility Functions:**

9. **`packages/utils/src/content-generation.ts`** - **DELETE LEGACY UTILITY** (generateWithTemplate)
10. **`packages/utils/src/plugin/content-generating-plugin.ts`** - Refactor to use ContentGenerator only

#### **MCP/Shell Tools:**

11. **`packages/shell/src/mcp/adapters.ts`** - **REPLACE** QueryProcessorAdapter and ContentGenerationAdapter with ContentGeneratorAdapter
12. **`packages/shell/src/mcp/tools.ts`** - Replace `shell:query` and content generation tools with ContentGenerator calls
13. **`packages/shell/src/mcp/resources.ts`** - Update content generation resources
14. **`packages/shell/src/mcp/index.ts`** - Update MCP registration to use ContentGenerator

#### **Site-Builder Plugin (Major Changes):**

15. **`packages/site-builder-plugin/src/plugin.ts`** - Remove ~150+ lines, use ContentGenerator only
16. **`packages/site-builder-plugin/src/content-generation/`** - Delete entire directory (no longer needed)
17. **`packages/site-builder-plugin/src/content-management/manager.ts`** - Simplify callbacks to use ContentGenerator

#### **Tests (All Need Major Updates):**

18. **`packages/shell/test/content/`** - **DELETE DIRECTORY** (ContentGenerationService tests)
19. **`packages/shell/test/query/`** - **DELETE DIRECTORY** (QueryProcessor tests)
20. **`packages/shell/test/plugins/pluginManager.test.ts`** - Update PluginContext tests for ContentGenerator
21. **`packages/shell/test/mcp/*.test.ts`** - Update MCP adapter tests for ContentGenerator
22. **`packages/shell/test/shell.test.ts`** - Replace QueryProcessor tests with ContentGenerator
23. **`packages/integration-tests/test/content-generation-plugin.test.ts`** - Update integration tests
24. **`packages/utils/test/content-generation.test.ts`** - **DELETE** (legacy utility tests)
25. **`packages/site-builder-plugin/test/unit/plugin.test.ts`** - Major refactor for ContentGenerator

### Breaking Changes Impact:

#### **High Impact (Complete Refactor Required):**

- **Shell package** → Major architecture change, removes QueryProcessor and ContentGenerationService entirely
- **MCP tools and adapters** → Complete rewrite to use ContentGenerator
- **Any code using QueryProcessor.processQuery()** → Must migrate to ContentGenerator.generateContent() with templates
- **Any plugin using ContentGenerationService APIs** → Must use ContentGenerator template-based approach
- **All tests for removed services** → Need complete rewrite or deletion

#### **Medium Impact:**

- **Plugin contexts** → Simplified interface, only ContentGenerator.generateContent() available
- **Template registration patterns** → Templates now centralized in ContentGenerator
- **Site-builder plugin** → Significant simplification, removal of manual template handling

#### **Low Impact:**

- **Template definitions** → Mostly compatible, existing templates work with ContentGenerator
- **Plugin registration** → Minimal changes, just different service injection

## Proposed Architecture: Pure Template-Only Content Generation

### Core Vision: Single Universal API

**Everything becomes template-based content generation:**

```typescript
// Knowledge queries → query templates
contentGenerator.generateContent("knowledge-query", {
  prompt: "What are my notes about X?",
});

// Schema generation → schema templates
contentGenerator.generateContent("user-profile", { data: userData });

// Entity operations → entity templates
contentGenerator.generateContent("entity-search", { query: "find projects" });

// Site content → site templates
contentGenerator.generateContent("site-builder:hero", { data: pageData });
```

### 1. Unified `@brains/content-generator` Package

**Absorbs ALL content generation functionality:**

- **ContentGenerator class** (Component Interface Standardization pattern)
- **ContentGenerationService logic** (template management, collections)
- **QueryProcessor functionality** (entity search, knowledge-aware generation, schema validation)
- **AI service integration** (direct AI calls for content generation)
- **Entity service integration** (knowledge base access for context-aware templates)

### 2. Single Template-Based API

**ONE method handles everything:**

```typescript
class ContentGenerator {
  // Core method - handles all content generation through templates
  generateContent(
    templateName: string,
    context?: GenerationContext,
  ): Promise<string>;

  // Convenience methods for common patterns (built on generateContent)
  generateWithRoute(...): Promise<string>;
  regenerateContent(...): Promise<{ entityId: string; content: string }>;

  // Template management
  registerTemplate<T>(name: string, template: ContentTemplate<T>): void;
  getTemplate(name: string): ContentTemplate<unknown> | null;
}

interface GenerationContext {
  prompt?: string;
  data?: Record<string, unknown>;
}
```

### 3. Simplified Shell Package

**Shell becomes thin layer over ContentGenerator:**

- **No QueryProcessor** → ContentGenerator handles knowledge queries with templates
- **No ContentGenerationService** → ContentGenerator handles template generation
- **No complex service orchestration** → Single ContentGenerator dependency
- **Shell.query()** → Delegates to ContentGenerator with query templates
- **MCP tools** → All use ContentGenerator.generateContent()

### 4. Template Ecosystem

**Different template types for different use cases:**

- **Knowledge templates** → Entity-aware generation with search context
- **Schema templates** → Structured data generation with validation
- **Collection templates** → Multi-item generation (existing site-builder pattern)
- **Query templates** → Transform queries into structured responses

## Implementation Steps

### Phase 1: Create Content Generator Package ✅ **COMPLETED**

- **ContentGenerator class** with Component Interface Standardization pattern
- **Template-only API** with `generateContent()`, `generateWithRoute()`, `regenerateContent()`
- **Simplified GenerationContext** with only `prompt` and `data` fields
- **Comprehensive test suite** with 17 passing tests
- **Clean dependency injection** for easy testing and mocking

### Phase 2: Move Services to Content Generator Package

#### Phase 2A: Move ContentGenerationService

1. **Move ContentGenerationService class** from `shell/src/content/` to `content-generator/src/`
2. **Merge with ContentGenerator** to create unified content generation system
3. **Add template management** (registerTemplate, getTemplate, collections)
4. **Maintain template-only approach** - no schema/prompt APIs

#### Phase 2B: Move QueryProcessor Functionality

1. **Move QueryProcessor logic** from `shell/src/query/` to `content-generator/src/`
2. **Integrate entity search** into ContentGenerator for knowledge-aware templates
3. **Add AI service integration** for direct AI calls when needed
4. **Transform processQuery** into template-based generation patterns

#### Phase 2C: Enhanced ContentGenerator Dependencies

```typescript
interface ContentGeneratorDependencies {
  // Template-based generation (existing)
  generateWithTemplate: (
    template: ContentTemplate,
    context: GenerationContext,
  ) => Promise<unknown>;
  getTemplate: (name: string) => ContentTemplate | null;
  listRoutes: () => RouteDefinition[];

  // Knowledge-aware generation (new)
  entityService: EntityService;
  aiService: AIService;
  logger: Logger;
}
```

### Phase 3: Delete Legacy Services from Shell

1. **Delete QueryProcessor class** and entire `shell/src/query/` directory
2. **Delete ContentGenerationService class** and entire `shell/src/content/` directory
3. **Remove interfaces** from `types/src/services.ts`
4. **Update shell.ts** to import and use ContentGenerator instead

### Phase 4: Update Shell Integration

1. **Update PluginContext** to only expose `ContentGenerator.generateContent()`
2. **Update MCP tools** to use ContentGenerator instead of QueryProcessor/ContentGenerationService
3. **Update shell initialization** to configure ContentGenerator with all dependencies
4. **Create system templates** for common operations (knowledge queries, entity searches)

### Phase 5: Update Site-Builder Plugin

1. **Replace all content generation** with `ContentGenerator.generateContent()` calls
2. **Delete manual template resolution** and error handling (~150+ lines)
3. **Use `generateWithRoute()` convenience method** for route-based generation
4. **Simplify content management callbacks**

### Phase 6: Update All Tests and Clean Up

1. **Delete test directories:**

   - `shell/test/content/` (ContentGenerationService tests)
   - `shell/test/query/` (QueryProcessor tests)
   - `utils/test/content-generation.test.ts` (legacy utility tests)

2. **Update remaining tests:**

   - Shell, MCP, plugin manager tests for ContentGenerator
   - Site-builder plugin tests for simplified approach
   - Integration tests for new architecture

3. **Delete legacy utilities:**
   - Remove `generateWithTemplate` from utils package
   - Clean up unused types and interfaces

### Phase 7: Documentation and System Templates

1. **Create system templates** for:

   - Knowledge queries (entity-aware generation)
   - Schema validation (structured generation)
   - Entity operations (search, create, update)

2. **Update documentation:**
   - Plugin development guide for template-only approach
   - Content generation patterns and examples

## Benefits

✅ **Radical architecture simplification**: Single ContentGenerator replaces QueryProcessor + ContentGenerationService  
✅ **Massive code reduction**: ~300+ lines eliminated across shell and site-builder  
✅ **Pure template-based approach**: Everything flows through `generateContent(templateName, context)`  
✅ **Unified content generation**: Knowledge queries, schema generation, site content all use same API  
✅ **Simplified shell package**: Removes entire directories, focuses on entity management  
✅ **Consistent testing**: Single service to test instead of multiple complex interactions  
✅ **Reusable everywhere**: Any package can do sophisticated content generation  
✅ **Knowledge-aware by default**: All templates can access entity knowledge base  
✅ **Type safety**: Clean GenerationContext interface, no `any` types  
✅ **Future-proof**: Template ecosystem can grow without architectural changes

## Risk Mitigation

- **No backward compatibility**: Clean break allows optimal architecture without legacy constraints
- **Incremental phases**: Each phase can be tested independently before proceeding
- **Comprehensive test coverage**: ContentGenerator already has 17 passing tests
- **Template ecosystem**: System templates handle common use cases out of the box
- **Clear migration path**: All existing functionality mapped to template-based equivalents

## Architecture Result

**Before:** Complex service orchestration

```
Plugin → PluginContext → ContentGenerationService → QueryProcessor → EntityService + AIService
                     → Multiple APIs (generate, generateFromTemplate, generateContent)
```

**After:** Single template-based pipeline

```
Plugin → ContentGenerator.generateContent(templateName, context)
                        ↓ (internally)
                     Template + EntityService + AIService → Formatted Content
```

This creates a truly template-centric architecture where all AI interactions flow through the unified content generation system, eliminating service fragmentation and providing a consistent, powerful API for all content generation needs.
