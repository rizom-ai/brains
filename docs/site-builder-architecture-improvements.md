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
  basePrompt?: string;        // Supports AI generation
  dataSourceId?: string;       // Supports data fetching
  formatter?: ContentFormatter;// Supports content parsing
  layout?: {                  // Supports rendering
    component: ComponentType;
    interactive?: boolean;
  };
}

// Helper functions for capability detection
class TemplateCapabilities {
  static canGenerate(template: Template): boolean {
    return !!template.basePrompt && !!template.dataSourceId && 
           template.dataSourceId.includes('ai-content');
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

### 2. Content Orchestration Service

Create a universal content orchestration service that's independent of content usage:

```typescript
interface ContentContext {
  staticContent?: unknown;           // Inline/provided content
  entityContext?: {                  // Entity storage lookup
    type: string;
    id: string;
  };
  dataContext?: unknown;              // DataSource parameters
  generationContext?: {               // AI generation parameters
    prompt?: string;
    data?: unknown;
    conversationId?: string;
  };
}

class ContentOrchestrator {
  constructor(
    private templateRegistry: TemplateRegistry,
    private entityService: EntityService,
    private dataSourceRegistry: DataSourceRegistry,
    private contentGenerator: ContentGenerator  // renamed
  ) {}
  
  async resolveContent(
    templateName: string,
    context?: ContentContext
  ): Promise<unknown> {
    const template = this.templateRegistry.get(templateName);
    if (!template) return null;
    
    // 1. Static content (highest priority)
    if (context?.staticContent !== undefined) {
      return this.validateContent(template, context.staticContent);
    }
    
    // 2. Entity storage (for persisted content)
    if (context?.entityContext) {
      const entity = await this.entityService.getEntity(
        context.entityContext.type,
        context.entityContext.id
      );
      if (entity?.content) {
        return this.parseContent(template, entity.content);
      }
    }
    
    // 3. DataSource fetch (for runtime data)
    if (template.dataSourceId && TemplateCapabilities.canFetch(template)) {
      const dataSource = this.dataSourceRegistry.get(template.dataSourceId);
      if (dataSource?.fetch) {
        const data = await dataSource.fetch(context?.dataContext, template.schema);
        if (data !== undefined) return data;
      }
    }
    
    // 4. AI generation (fallback or explicit)
    if (TemplateCapabilities.canGenerate(template) && context?.generationContext) {
      return await this.contentGenerator.generateContent({
        templateName,
        ...context.generationContext
      });
    }
    
    return null;
  }
}
```

This orchestrator can be used by any service that needs content:
- Site-builder for page rendering
- CLI interfaces for response generation
- API endpoints for data responses
- Message interfaces for conversational responses

### 3. Clarified Service Responsibilities

#### ContentGenerator (renamed from ContentService)
- **Purpose**: AI-powered content generation only
- **Responsibilities**:
  - Generate content using templates with AI capabilities
  - Format generated content
  - Parse content from markdown
- **Key Changes**: 
  - Renamed to better reflect its purpose
  - Remove direct DataSource access
  - Focus purely on AI generation

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
    private contentOrchestrator: ContentOrchestrator,
    private renderService: RenderService,
    private contentOperations: SiteContentOperations
  ) {}

  async build(options: BuildOptions): Promise<BuildResult> {
    const routes = this.getRoutes();
    
    for (const route of routes) {
      for (const section of route.sections) {
        // Get the template
        const template = this.templateRegistry.get(section.template);
        if (!template) continue;
        
        // Resolve content using orchestrator
        const content = await this.contentOrchestrator.resolveContent(
          section.template,
          {
            staticContent: section.content,
            entityContext: {
              type: options.environment === 'production' 
                ? 'site-content-production' 
                : 'site-content-preview',
              id: `${route.id}:${section.id}`
            },
            dataContext: { route, section }
          }
        );
        
        // Render if template supports it
        if (TemplateCapabilities.canRender(template)) {
          await this.renderPage(route, section, content, template);
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
  async generateContent(route: RouteDefinition, section: SectionDefinition): Promise<void> {
    const template = this.templateRegistry.get(section.template);
    
    // Only generate if template supports it
    if (!TemplateCapabilities.canGenerate(template)) {
      this.logger.info(`Template ${template.name} doesn't support generation, skipping`);
      return;
    }
    
    // Queue generation job
    await this.queueContentGeneration(template, route, section);
  }
  
  async promoteContent(/*...*/): Promise<void> { /* ... */ }
  async rollbackContent(/*...*/): Promise<void> { /* ... */ }
}
```

## Implementation Plan

### Phase 1: Template Capability Detection (Week 1)

1. **Add TemplateCapabilities utility**
   - Create capability detection methods
   - Add tests for all template types
   - Document capability combinations

2. **Update existing templates**
   - Ensure capabilities are correctly declared
   - Fix dashboard template (remove basePrompt or change dataSourceId)
   - Add capability metadata

3. **Add capability validation**
   - Warn about invalid capability combinations
   - Provide helpful error messages
   - Log capability detection results

### Phase 2: Content Orchestrator Implementation (Week 2)

1. **Create ContentOrchestrator service**
   - Implement the core orchestration logic
   - Add resolution priority system
   - Include proper error handling

2. **Integrate with existing services**
   - Wire up to TemplateRegistry
   - Connect to EntityService
   - Link with DataSourceRegistry and ContentService

3. **Add comprehensive tests**
   - Test each resolution path
   - Test priority ordering
   - Test error scenarios

### Phase 3: Service Refactoring (Week 3)

1. **Simplify RenderService**
   - Remove resolveContent method
   - Focus purely on component management
   - Update documentation

2. **Update site-builder**
   - Use ContentOrchestrator instead of custom resolution
   - Remove direct entity service calls
   - Simplify getContentForSection

3. **Update other consumers**
   - Message interfaces to use ContentOrchestrator
   - CLI interfaces to use ContentOrchestrator
   - Any other services doing content resolution

### Phase 4: Content Operations Cleanup (Week 4)

1. **Enhance SiteContentOperations**
   - Add capability checking before generation
   - Improve error handling
   - Better skip logic for non-generative templates

2. **Update job handlers**
   - Check template capabilities before operations
   - Provide better error messages
   - Skip unsupported operations gracefully

3. **Clean up interfaces**
   - Remove redundant methods
   - Simplify parameter passing
   - Document behavior clearly

### Phase 5: Final Refactoring and Documentation (Week 5)

1. **Rename ContentService to ContentGenerator**
   - Better reflects its actual purpose (AI generation only)
   - Update all references throughout codebase
   - Update imports and documentation
   - Clear distinction from ContentOrchestrator

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
  basePrompt: "Generate dashboard data",  // Misleading - doesn't actually generate
  dataSourceId: "shell:system-stats",    // Fetch-only DataSource
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
  dataSourceId: "shell:system-stats",    // Fetch runtime data
  layout: {                              // Render the view
    component: DashboardWidget,
    interactive: true
  },
  // No basePrompt - clearly indicates no generation capability
  requiredPermission: "public"
};

// Usage is clear
TemplateCapabilities.canGenerate(dashboardTemplate);  // false
TemplateCapabilities.canFetch(dashboardTemplate);     // true
TemplateCapabilities.canRender(dashboardTemplate);    // true
```

## Conclusion

This approach maintains the unified Template interface while solving the architectural issues through:

1. Clear capability detection
2. Predictable content resolution
3. Well-defined service boundaries
4. Separation of concerns

The key insight is that templates can have mixed concerns - that's their strength. The services that consume templates should be smart about using only the capabilities they need.

---

**Document Status**: Planning Phase  
**Review Status**: Pending Review  
**Implementation**: Not Started