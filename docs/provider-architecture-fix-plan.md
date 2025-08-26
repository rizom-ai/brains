# DataSource Architecture Implementation Plan

> **📋 STATUS UPDATE**: Phases 1-3 have been completed. Phase 4 (Complete DataSource Migration) is now in progress, migrating content generation from Provider pattern to DataSource pattern.
>
> **Current Focus**: Migrating content-service to use DataSourceRegistry, creating AI Content DataSource, and updating site-builder generation logic to use DataSource operations.

## Problem Statement

Dashboard shows stale/mock data because data source information is lost during Template → ViewTemplate conversion, preventing fresh data fetch at build time.

## Root Cause Analysis

### Original Architecture Issues (RESOLVED)

1. ~~**Template** lives in wrong place~~ → ✅ Unified template registry created
2. ~~**Template** has wrong name~~ → ✅ Clear separation: Template, ContentTemplate, ViewTemplate
3. ~~**ViewTemplate** loses critical information~~ → ✅ All properties preserved in central registry

### Remaining Issues (MOSTLY RESOLVED)

1. ~~**Provider naming is confusing**~~ → ✅ Renamed to DataSource for clarity
2. ~~**Provider location creates coupling**~~ → ✅ Created new @brains/datasource package
3. ~~**Site-builder doesn't check for dynamic data**~~ → ✅ Integrated with RenderService

### New Issues Identified

1. **Content generation still uses Provider pattern** → Need to migrate to DataSource.generate()
2. **ContentService maintains separate Provider registry** → Should use DataSourceRegistry
3. **Site-builder generates content for DataSource templates** → Should skip DataSource-based templates

### Updated Flow Problems

- Content generation: Uses old Provider pattern → stores as entities → DataSource pattern unused
- Build time: RenderService fetches fresh data ✅ → but generation creates stale entities unnecessarily

## Solution Architecture

### ✅ Phase 1: Template Architecture (COMPLETED)

Template type issues have been resolved using the **Unified Template Registry** approach:

- **✅ Single template registry** in shell/templates package maintains all template properties
- **✅ No information loss** - `providerId`, `formatter`, and `layout` all preserved
- **✅ Simplified access** - `shell.getTemplate(name)` returns complete Template
- **✅ Services query central registry** instead of maintaining separate template storage

**Key Outcome**: Site-builder and other services can now access complete template information including `providerId` for provider pattern implementation.

### ✅ Phase 2: DataSource Package Creation (COMPLETED)

**Key Outcomes**:

- **✅ @brains/datasource package created** with clean DataSource interface
- **✅ DataSourceRegistry implemented** with Component Interface Standardization pattern
- **✅ SystemStatsDataSource moved to shell core** with prefixed naming (shell:system-stats)
- **✅ Templates updated** to use `dataSourceId` instead of `providerId`

### ✅ Phase 3: RenderService Integration (COMPLETED)

**Key Outcomes**:

- **✅ RenderService enhanced** with content resolution strategies (static, DataSource, custom resolver)
- **✅ Site-builder updated** to use RenderService.resolveContent() for unified content fetching
- **✅ Dashboard hydration fixed** - HydrationManager now resolves content properly
- **✅ Testing infrastructure added** - Plugin harness supports DataSource testing

### 🚧 Phase 4: Complete DataSource Migration (IN PROGRESS)

The final phase migrates content generation from the old Provider pattern to use DataSource operations.

#### Current State Analysis

**Content-Service Issues:**

- Still maintains separate Provider registry (`Map<string, IContentProvider>`)
- Has `generateFromProvider`, `fetchFromProvider`, `transformContent` methods
- ContentGenerationJobHandler uses content-service.generateContent()
- Templates and providers are disconnected

**Site-Builder Issues:**

- Content generation doesn't check for DataSource templates
- Generates entities for templates that use DataSources
- Creates unnecessary work and stale entities

**DataSource Underutilization:**

- DataSources support `generate` operation but it's not used
- Only `fetch` is used for dashboard, `generate` potential is ignored

#### 4.1 Update ContentService to use DataSourceRegistry

**Goal**: Replace Provider registry with DataSourceRegistry integration

**Changes:**

```typescript
// shell/content-service/src/content-service.ts
export interface ContentServiceDependencies {
  logger: Logger;
  entityService: EntityService;
  aiService: IAIService;
  conversationService: IConversationService;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry; // NEW: Replace provider management
}

export class ContentService {
  // REMOVE: private providers: Map<string, IContentProvider> = new Map();

  constructor(private readonly dependencies: ContentServiceDependencies) {}

  // UPDATE: Use DataSourceRegistry instead of provider registry
  async generateContent<T = unknown>(
    templateName: string,
    context: GenerationContext = {},
    pluginId?: string,
  ): Promise<T> {
    const template = this.dependencies.templateRegistry.get(templateName);

    // NEW: Check for DataSource-based generation
    if (template?.dataSourceId) {
      const dataSource = this.dependencies.dataSourceRegistry.get(
        template.dataSourceId,
      );
      if (dataSource?.generate) {
        return await dataSource.generate(context);
      }
    }

    // Existing AI generation logic for templates without DataSources
    // ...
  }

  // REMOVE: registerProvider, getProvider, listProviders methods
  // REMOVE: generateFromProvider, fetchFromProvider, transformContent methods
}
```

#### 4.2 Create AI Content DataSource

**Goal**: Create DataSource for AI-powered content generation

**Implementation:**

```typescript
// shell/core/src/datasources/ai-content-datasource.ts
export class AIContentDataSource
  implements DataSource<unknown, unknown, unknown>
{
  readonly id = "ai-content";
  readonly name = "AI Content Generator";
  readonly description =
    "Generates content using AI based on templates and prompts";

  constructor(
    private aiService: IAIService,
    private conversationService: IConversationService,
  ) {}

  async generate(request: GenerationContext): Promise<unknown> {
    // Implementation of AI content generation
    // Uses the same logic as ContentService.generateContent
    // but as a DataSource operation
  }
}
```

**Registration:**

```typescript
// shell/core/src/initialization/shellInitializer.ts
private async initializeDataSources(): Promise<void> {
  // Register shell DataSources
  this.dataSourceRegistry.registerWithPrefix(
    "system-stats",
    new SystemStatsDataSource(this.entityService),
    "shell"
  );

  // NEW: Register AI content DataSource
  this.dataSourceRegistry.registerWithPrefix(
    "ai-content",
    new AIContentDataSource(this.aiService, this.conversationService),
    "shell"
  );
}
```

#### 4.3 Update Site-Builder Generation Logic

**Goal**: Skip content generation for DataSource-based templates

**Changes:**

```typescript
// plugins/site-builder/src/lib/site-content-operations.ts
async generate(options: GenerateOptions): Promise<{...}> {
  for (const route of targetRoutes) {
    for (const section of route.sections) {
      // Skip sections with static content
      if (section.content) continue;

      // NEW: Skip sections with DataSource templates
      const template = this.context.getViewTemplate(section.template);
      if (template?.dataSourceId) {
        logger.debug("Section uses DataSource, skipping generation", {
          routeId: route.id,
          sectionId: section.id,
          dataSourceId: template.dataSourceId,
        });
        continue;
      }

      // Only generate for templates without DataSources
      sectionsToGenerate.push({ route, section });
    }
  }
  // ... rest of generation logic
}
```

#### 4.4 Remove All Provider Code

**Goal**: Clean up obsolete Provider pattern code

**Files to clean:**

- Remove `shell/content-service/src/providers/` directory
- Remove Provider exports from `shell/content-service/src/index.ts`
- Remove Provider references from `shell/content-service/test/`
- Update any remaining `providerId` references to `dataSourceId`

### Phase 4 Benefits

1. **Unified Architecture**: Single DataSource pattern for all data operations
2. **Better Performance**: No unnecessary entity generation for DataSource templates
3. **Cleaner Code**: Remove duplicate Provider/DataSource patterns
4. **More Flexible**: DataSources can be plugin-specific or shell-provided
5. **Consistent API**: DataSource.generate() matches DataSource.fetch()

### Updated Implementation Status

### ✅ Completed

- **Unified Template Registry**: Templates stored in central registry ✅
- **DataSource Package**: @brains/datasource created with clean interfaces ✅
- **RenderService Integration**: Content resolution with DataSource support ✅
- **Dashboard Hydration**: Fixed with proper content resolution ✅
- **Testing Infrastructure**: DataSource testing support added ✅

### 🚧 In Progress

- **ContentService Migration**: Removing Provider pattern, integrating DataSourceRegistry
- **AI Content DataSource**: Creating DataSource for content generation
- **Site-Builder Updates**: Skip generation for DataSource templates

### Success Criteria for Phase 4

- **✅ ContentService uses DataSourceRegistry**: No separate Provider registry
- **✅ AI Content DataSource created**: Handles content generation as DataSource operation
- **✅ Site-builder skips DataSource templates**: No unnecessary entity generation
- **✅ All Provider code removed**: Clean codebase with single DataSource pattern
- **✅ Performance improved**: Less unnecessary work during content generation

## Updated Architecture Patterns

### DataSource Pattern (Dynamic Content)

- Real-time data fetched/generated at build time or on-demand
- No stored entities in database (unless caching is specifically needed)
- Examples: dashboards, system stats, AI-generated content
- Templates have `dataSourceId` property
- Uses DataSource.fetch() for retrieval, DataSource.generate() for creation

### Entity Pattern (Static/Cached Content)

- Pre-generated content stored as entities in database
- Content created through generation jobs, then cached
- Examples: articles, marketing copy, documentation that doesn't change often
- Templates have neither `dataSourceId` (handled directly by content operations)
- Uses entity storage for persistence

**Updated Decision Matrix:**
| Content Type | Storage | Generation | Build Time | DataSource | Example |
|--------------|---------|------------|------------|------------|---------|
| Dynamic | None | DataSource | Fetch/Generate fresh | Yes | Dashboard, AI content |
| Static/Cached | Database | Job Queue | Read cached entity | No | Blog posts, docs |

## Next Steps

### Immediate Action Items

1. **Update ContentService**: Remove Provider registry, integrate DataSourceRegistry
2. **Create AI Content DataSource**: Move content generation to DataSource.generate()
3. **Update Site-Builder**: Skip generation for DataSource-based templates
4. **Clean up Provider code**: Remove all obsolete Provider pattern files

### Future Enhancements

After completing the DataSource migration, consider:

- **Plugin-specific DataSources**: Allow plugins to register their own DataSources
- **DataSource composition**: Chain DataSources for complex content workflows
- **Caching strategies**: Add caching to DataSource operations where appropriate
- **Transform operations**: Implement DataSource.transform() for format conversion

## Related Documentation

- [Unified Template Registry Plan](./unified-template-registry-plan.md) - Template architecture details
- [Content Provider Pattern](./content-provider-pattern.md) - Provider implementation guide

---

**Document Status**: Updated with Phase 4 migration plan  
**Last Updated**: Current session  
**Next Review**: After Phase 4 completion
