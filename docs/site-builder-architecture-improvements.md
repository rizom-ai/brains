# Site-Builder Architecture Improvements Plan

> **Status**: Planning Phase  
> **Created**: 2025-01-27  
> **Priority**: High - Core architectural improvement

## Executive Summary

The current site-builder implementation has unclear service boundaries and complex content resolution logic. This document outlines a plan to improve the architecture while maintaining the unified Template interface that allows templates to declare all their capabilities in one place.

## Problem Statement

### Current Issues

1. **Complex Content Resolution Logic**
   - Site-builder's `getContentForSection` has complex multi-strategy resolution
   - Similar logic duplicated in RenderService's `resolveContent`
   - Unclear precedence between static content, entities, and DataSources

2. **Service Boundary Confusion**
   - ContentService does both AI generation and DataSource operations
   - RenderService includes content resolution beyond just rendering
   - Site-builder directly manages entity storage

3. **Template Capability Detection**
   - Hard to determine what a template supports (generate vs fetch vs static)
   - Dashboard template has basePrompt but shouldn't generate content
   - Error handling for unsupported operations is inconsistent

4. **Entity Storage Coupling**
   - Site-builder is tightly coupled to entity storage patterns
   - Preview/production entity management mixed with build logic
   - Direct entity service calls throughout

## Design Principles

### Keep What Works

1. **Unified Template Interface**: Templates should declare all capabilities in one place
2. **Developer Experience**: One template definition for all related functionality
3. **Flexibility**: Templates can support any combination of capabilities

### Fix What's Broken

1. **Clear Service Boundaries**: Each service has well-defined responsibilities
2. **Predictable Resolution**: Clear, documented content resolution order
3. **Better Error Handling**: Graceful handling of unsupported operations

## Proposed Architecture

### 1. Enhanced Template Interface

Keep the unified Template interface but add capability detection:

```typescript
interface Template {
  name: string;
  description: string;
  schema: ZodSchema;
  requiredPermission: UserPermissionLevel;

  // Capabilities (all optional)
  basePrompt?: string; // Supports AI generation
  dataSourceId?: string; // Supports data fetching
  formatter?: ContentFormatter; // Supports content parsing
  layout?: {
    // Supports rendering
    component: ComponentType;
    interactive?: boolean;
  };
}

// Helper functions for capability detection
class TemplateCapabilities {
  static canGenerate(template: Template): boolean {
    return (
      !!template.basePrompt &&
      !!template.dataSourceId &&
      template.dataSourceId.includes("ai-content")
    );
  }

  static canFetch(template: Template): boolean {
    return !!template.dataSourceId && !this.canGenerate(template);
  }

  static canRender(template: Template): boolean {
    return !!template.layout?.component;
  }

  static isStaticOnly(template: Template): boolean {
    return !this.canGenerate(template) && !this.canFetch(template);
  }
}
```

### 2. Enhanced ContentService

Consolidate all content operations into ContentService, making it the single source of truth for content management:

```typescript
interface ContentContext {
  entityContext?: {
    // Entity storage lookup
    type: string;
    id: string;
  };
  dataParams?: unknown; // DataSource parameters
  staticContent?: unknown; // Fallback content
  generationContext?: {
    // AI generation parameters
    prompt?: string;
    data?: unknown;
    conversationId?: string;
  };
}

class ContentService {
  // Existing methods
  async generateContent(...) { /* AI generation */ }
  async deriveContent(...) { /* Content transformation */ }
  async promoteContent(...) { /* Environment promotion */ }
  async rollbackContent(...) { /* Environment rollback */ }

  // NEW: Content resolution with proper priority
  async resolveContent(
    templateName: string,
    context?: ContentContext,
  ): Promise<unknown> {
    const template = this.templateRegistry.get(templateName);
    if (!template) return null;

    // Priority order (freshest to most static):

    // 1. DataSource fetch (real-time data like dashboard stats)
    if (template.dataSourceId && TemplateCapabilities.canFetch(template)) {
      const dataSource = this.dataSourceRegistry.get(template.dataSourceId);
      if (dataSource?.fetch) {
        const data = await dataSource.fetch(
          context?.dataParams,
          template.schema,
        );
        if (data !== undefined) return data;
      }
    }

    // 2. Entity storage (previously saved/generated content)
    if (context?.entityContext) {
      const entity = await this.entityService.getEntity(
        context.entityContext.type,
        context.entityContext.id,
      );
      if (entity?.content) {
        return this.parseContent(template, entity.content);
      }
    }

    // 3. AI generation (create new content if needed)
    if (
      TemplateCapabilities.canGenerate(template) &&
      context?.generationContext
    ) {
      const result = await this.generateContent({
        templateName,
        ...context.generationContext,
      });
      return result?.content;
    }

    // 4. Static content (fallback)
    if (context?.staticContent !== undefined) {
      return this.validateContent(template, context.staticContent);
    }

    return null;
  }
}
```

ContentService can now be used by any service that needs content:

- Site-builder for page content
- CLI interfaces for response generation
- API endpoints for data responses
- Message interfaces for conversational responses

### 3. Clarified Service Responsibilities

#### ContentService (enhanced, not renamed)

- **Purpose**: Complete content management
- **Responsibilities**:
  - Content resolution from multiple sources
  - AI-powered content generation
  - Content derivation and transformation
  - Content promotion/rollback between environments
  - Content validation and parsing
- **Key Changes**:
  - Added content resolution capability
  - Centralized all content operations
  - Clear, cohesive API

#### RenderService

- **Purpose**: View rendering and component management
- **Responsibilities**:
  - Manage templates with rendering capabilities
  - Provide component access
  - Validate content against schemas
- **Key Change**: Remove content resolution entirely - use ContentOrchestrator instead

#### DataSourceRegistry

- **Purpose**: Runtime data operations
- **Responsibilities**:
  - Register and manage DataSources
  - Handle both fetch and generate operations
- **No Change**: Already well-defined

### 4. Simplified Site-Builder

Site-builder becomes focused on orchestration:

```typescript
class SiteBuilder {
  constructor(
    private contentService: ContentService,
    private renderService: RenderService,
    private contentOperations: SiteContentOperations,
  ) {}

  async build(options: BuildOptions): Promise<BuildResult> {
    const routes = this.getRoutes();

    for (const route of routes) {
      for (const section of route.sections) {
        // Get the template
        const template = this.templateRegistry.get(section.template);
        if (!template) continue;

        // Resolve content using ContentService
        const content = await this.contentService.resolveContent(
          section.template,
          {
            entityContext: {
              type:
                options.environment === "production"
                  ? "site-content-production"
                  : "site-content-preview",
              id: `${route.id}:${section.id}`,
            },
            dataParams: { route, section },
            staticContent: section.content, // fallback
          },
        );

        // Render if template supports it
        if (TemplateCapabilities.canRender(template)) {
          await this.renderService.renderPage(
            route,
            section,
            content,
            template,
          );
        }
      }
    }
  }
}
```

### 5. Content Operations Separation

Move content generation operations to a separate service:

```typescript
class SiteContentOperations {
  async generateContent(
    route: RouteDefinition,
    section: SectionDefinition,
  ): Promise<void> {
    const template = this.templateRegistry.get(section.template);

    // Only generate if template supports it
    if (!TemplateCapabilities.canGenerate(template)) {
      this.logger.info(
        `Template ${template.name} doesn't support generation, skipping`,
      );
      return;
    }

    // Queue generation job
    await this.queueContentGeneration(template, route, section);
  }

  async promoteContent(/*...*/): Promise<void> {
    /* ... */
  }
  async rollbackContent(/*...*/): Promise<void> {
    /* ... */
  }
}
```

## Implementation Plan

### Phase 1: Template Capability Detection (Week 1) ✅ COMPLETED

1. **Add TemplateCapabilities utility** ✅
   - Created capability detection methods (canGenerate, canFetch, canRender, isStaticOnly)
   - Added comprehensive tests for all template types
   - Documented capability combinations

2. **Update existing templates** ✅
   - Fixed dashboard template (removed misleading basePrompt)
   - Ensured capabilities are correctly declared
   - Templates now clearly indicate their purpose

3. **Add capability validation** ✅
   - Added validation for actual misconfigurations only
   - Integrated validation into TemplateRegistry
   - Logs errors for invalid configurations, not different template types

### Phase 2: Enhanced ContentService (Week 2) ✅ COMPLETED

1. **Add content resolution to ContentService** ✅
   - ContentService now handles all content management
   - Implemented `resolveContent` with proper priority system:
     1. DataSource fetch (real-time data)
     2. Entity storage (cached content - requires formatter)
     3. Static content (fallback)
   - Preserved existing generation, derivation, and promotion capabilities

2. **Clean up method organization** ✅
   - Grouped related methods (resolution, generation, operations)
   - Clean internal APIs with proper type safety
   - No type casts needed

3. **Add comprehensive tests** ✅
   - Tests for each resolution path
   - Tests for priority ordering
   - Tests for plugin scoping and integration

### Phase 3: Service Refactoring (Week 3) ✅ COMPLETED

1. **Simplify RenderService** ✅
   - Removed resolveContent method and DataSourceRegistry dependency
   - Focused purely on component/template management
   - Updated documentation

2. **Update site-builder** ✅
   - Now uses ContentService.resolveContent via plugin context helper
   - Simplified getContentForSection
   - Removed custom resolver pattern

3. **Update other consumers** ✅
   - Message interfaces don't need content resolution (they generate responses)
   - CLI interfaces don't need content resolution (they forward commands)
   - Site-builder is the primary consumer of content resolution

### Phase 4: Content Operations Cleanup (Week 4) ✅ COMPLETED

1. **Enhance SiteContentOperations** ✅
   - Added capability checking before generation
   - Improved error handling with clear messages
   - Sections with non-generative templates are skipped gracefully

2. **Update job handlers** ✅
   - Migrated to shell-provided handlers with `shell:` namespace
   - Template capabilities checked before operations
   - Better error messages for missing/unsupported templates
   - Removed duplicate handlers from site-builder plugin

3. **Clean up interfaces** ✅
   - Added getTemplateCapabilities helper to ServicePluginContext
   - Added getTemplate method to IShell interface
   - Removed redundant handler implementations
   - Clear separation: shell owns content operations, plugins use them

### Phase 5: Final Refactoring and Documentation (Week 5)

1. **ContentService consolidation**
   - ContentService now handles all content concerns
   - Clear internal organization of responsibilities
   - Well-documented public API

2. **Comprehensive testing**
   - Unit tests for each component
   - Integration tests for resolution flow
   - End-to-end tests for site building

3. **Documentation**
   - Update architecture diagrams with new service names
   - Document resolution order
   - Provide template examples

4. **Migration support**
   - Add deprecation warnings
   - Provide migration utilities
   - Update plugin examples

## Key Architectural Decisions

### Shell Handler Pattern
We established that shell-provided handlers use explicit namespacing:
- Shell registers core handlers with `shell:` prefix (e.g., `shell:content-generation`)
- Plugins queue jobs using the shell namespace when they need core handlers
- This makes ownership explicit and avoids naming conflicts

### Content Resolution Priority
ContentService.resolveContent follows a strict priority order:
1. **DataSource fetch** - Real-time data has highest priority
2. **Saved content** - Cached entities (requires formatter for parsing)
3. **Static fallback** - Default content provided by caller

### Template Capabilities
Templates must declare their capabilities explicitly:
- `canGenerate`: Template supports AI content generation (has basePrompt)
- `canFetch`: Template supports DataSource fetching (has dataSourceId)
- `canRender`: Template has rendering components (has layout)
- `isStaticOnly`: Template only uses static content (no generation or fetch)

### Formatter Requirement
Templates MUST have a formatter to work with entity storage:
- Formatters enable parsing saved content back into structured data
- Without a formatter, ContentService cannot use saved entities
- This ensures type safety and prevents content corruption

## Benefits

### Developer Experience

- **Single Template Definition**: All capabilities in one place
- **Universal Content Resolution**: One service for all content needs
- **Clear Capability Model**: Easy to understand what templates can do
- **Better Error Messages**: Clear feedback when operations aren't supported

### Architecture Quality

- **Separation of Concerns**: Clear service boundaries
- **Reusability**: ContentOrchestrator works for any content consumer
- **Predictable Behavior**: Documented resolution priority
- **Extensibility**: Easy to add new resolution strategies

### Maintainability

- **Less Coupling**: Services don't depend on implementation details
- **Single Source of Truth**: One place for content resolution logic
- **Better Testing**: Components can be tested in isolation
- **Clearer Code**: Simplified logic in each service

## Migration Strategy

### Backward Compatibility

- Keep existing APIs functional
- Add deprecation warnings for old patterns
- Provide automatic migration where possible
- Support both patterns during transition period

### Incremental Migration

1. Add new capabilities without breaking existing code
2. Migrate internal usage first
3. Update plugins individually
4. Remove deprecated code after grace period

## Success Metrics

- **Code Clarity**: Reduced cyclomatic complexity in site-builder
- **Error Handling**: Zero uncaught errors for unsupported operations
- **Performance**: No regression in build times
- **Developer Satisfaction**: Positive feedback on new capability model

## Example: Dashboard Template

### Current (Problematic)

```typescript
const dashboardTemplate: Template = {
  name: "dashboard",
  basePrompt: "Generate dashboard data", // Misleading - doesn't actually generate
  dataSourceId: "shell:system-stats", // Fetch-only DataSource
  layout: { component: DashboardWidget },
  // This creates confusion about what the template actually does
};
```

### Improved (Clear Capabilities)

```typescript
const dashboardTemplate: Template = {
  name: "dashboard",
  description: "System dashboard with real-time stats",
  schema: DashboardSchema,
  dataSourceId: "shell:system-stats", // Fetch runtime data
  layout: {
    // Render the view
    component: DashboardWidget,
    interactive: true,
  },
  // No basePrompt - clearly indicates no generation capability
  requiredPermission: "public",
};

// Usage is clear
TemplateCapabilities.canGenerate(dashboardTemplate); // false
TemplateCapabilities.canFetch(dashboardTemplate); // true
TemplateCapabilities.canRender(dashboardTemplate); // true
```

## Conclusion

This approach maintains the unified Template interface while solving the architectural issues through:

1. Clear capability detection
2. Predictable content resolution
3. Well-defined service boundaries
4. Separation of concerns

The key insight is that templates can have mixed concerns - that's their strength. The services that consume templates should be smart about using only the capabilities they need.

---

**Document Status**: Complete  
**Review Status**: Architecture Implemented  
**Implementation**: Phases 1-4 Complete (2025-01-28)
