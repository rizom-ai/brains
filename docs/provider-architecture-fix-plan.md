# DataSource Architecture Implementation Plan

> **📋 STATUS UPDATE**: Phase 1 (template type issues) has been resolved using the [Unified Template Registry Plan](./unified-template-registry-plan.md). This plan has been updated to implement the DataSource pattern (formerly Provider pattern) with improved naming and architecture.
>
> **Current Focus**: Creating @brains/datasource package, RenderService integration with DataSources, and site-builder refactoring for dynamic data fetching.

## Problem Statement

Dashboard shows stale/mock data because data source information is lost during Template → ViewTemplate conversion, preventing fresh data fetch at build time.

## Root Cause Analysis

### Original Architecture Issues (RESOLVED)

1. ~~**Template** lives in wrong place~~ → ✅ Unified template registry created
2. ~~**Template** has wrong name~~ → ✅ Clear separation: Template, ContentTemplate, ViewTemplate
3. ~~**ViewTemplate** loses critical information~~ → ✅ All properties preserved in central registry

### Remaining Issues

1. **Provider naming is confusing** → Will rename to DataSource for clarity
2. **Provider location creates coupling** → Will create new @brains/datasource package
3. **Site-builder doesn't check for dynamic data** → Will integrate with RenderService

### Current Flow Problems

- Content generation: Provider fetches data → stores as stale entity
- Build time: Reads stale entity → parses with mock formatter → renders old data

## Solution Architecture

### ✅ Phase 1: Template Architecture (COMPLETED)

Template type issues have been resolved using the **Unified Template Registry** approach:

- **✅ Single template registry** in shell/templates package maintains all template properties
- **✅ No information loss** - `providerId`, `formatter`, and `layout` all preserved
- **✅ Simplified access** - `shell.getTemplate(name)` returns complete Template
- **✅ Services query central registry** instead of maintaining separate template storage

**Key Outcome**: Site-builder and other services can now access complete template information including `providerId` for provider pattern implementation.

### Phase 2: Fix Build-Time Data Fetching

#### 2.1 Update Site Builder

Modify `getContentForSection()` to check for providers using unified template registry:

```typescript
// site-builder/src/lib/site-builder.ts
private async getContentForSection(section: SectionDefinition, route: RouteDefinition): Promise<unknown> {
  // Get complete template from unified registry
  const template = this.context.getTemplate(section.template);
  if (!template) {
    throw new Error(`Template not found: ${section.template}`);
  }

  // NEW: Check if template uses provider for dynamic data
  if (template.providerId) {
    this.logger.debug(`Fetching fresh data from provider: ${template.providerId}`);
    return await this.context.fetchFromProvider(template.providerId, {
      routeId: route.id,
      sectionId: section.id
    });
  }

  // Existing entity-based flow for static content
  const entityType = environment === "production" ? "site-content-production" : "site-content-preview";
  const entityId = `${route.id}:${section.id}`;

  try {
    const entity = await this.context.entityService.getEntity(entityType, entityId);
    if (entity && template.formatter) {
      return template.formatter.parse(entity.content);
    }
  } catch (error) {
    this.logger.debug(`No entity found: ${entityId}`, { error });
  }

  return null;
}
```

#### 2.2 Fix Dashboard Formatter

Replace mock data with proper YAML parsing using `js-yaml`

### Phase 3: Optimize Content Generation

#### 3.1 Skip Generation for Provider-Based Content

Update content generation to check for `providerId` and skip entity creation:

```typescript
// site-builder/src/lib/site-content-operations.ts
async generate(options: GenerateContentOptions): Promise<void> {
  for (const route of this.routes) {
    for (const section of route.sections) {
      // Get template from unified registry
      const template = this.shell.getTemplate(section.template);

      // NEW: Skip generation for provider-based templates
      if (template?.providerId) {
        this.logger.debug(`Skipping generation for provider-based template: ${section.template}`);
        continue; // Provider will fetch data at build time
      }

      // Only generate entities for static content templates
      if (template?.basePrompt) {
        await this.generateSectionContent(route, section, template);
      }
    }
  }
}
```

#### 3.2 Document Provider vs Entity Patterns

**Provider Pattern (Dynamic Content):**

- Real-time data fetched at build time
- No stored entities in database
- Examples: dashboards, system stats, live metrics
- Templates have `providerId` property

**Entity Pattern (Static Content):**

- Pre-generated content stored as entities
- AI-generated or manually authored
- Examples: articles, marketing copy, documentation
- Templates have `basePrompt` for generation

**Decision Matrix:**
| Content Type | Storage | Generation | Build Time | Example |
|--------------|---------|------------|------------|---------|
| Provider | None | N/A | Fetch fresh | Dashboard stats |
| Entity | Database | AI/Manual | Read cached | Blog posts |

## Implementation Status

### ✅ Completed

- **Unified Template Registry**: Templates now stored in central registry with all properties preserved
- **ServicePluginContext.getTemplate()**: Added method to access templates from context
- **Template Type System**: Clean separation between unified Template, ContentTemplate, and ViewTemplate

### 🚧 In Progress

- **DataSource architecture implementation**: Creating new package and refactoring provider pattern

### ⏳ Remaining Work

#### Phase 2A: Create DataSource Package

1. **New Package (`shell/datasource/`)**
   - Create `@brains/datasource` package structure
   - Define `IDataSource` interface (replacing IContentProvider)
   - Implement `DataSourceRegistry` with CIS pattern
   - Add base DataSource class for common functionality
   - Write comprehensive tests

2. **Migrate Existing Providers**
   - Update `SystemStatsProvider` to implement `IDataSource`
   - Move from `plugins/site-builder/src/providers/` to use new interface
   - Update all references from "provider" to "datasource"

#### Phase 2B: RenderService Integration

3. **RenderService Enhancement (`shell/render-service/src/render-service.ts`)**
   - Add dependency on `@brains/datasource`
   - Implement `resolveContent()` method that checks for DataSources
   - Create `ContentResolutionContext` interface
   - Add `usesDataSource()` helper method

4. **Template Updates**
   - Change `providerId` to `dataSourceId` in Template interface
   - Update dashboard template to use `dataSourceId: "system-stats"`
   - Update all template references

#### Phase 2C: Site-builder Refactoring

5. **ServicePluginContext (`shell/plugins/src/service/context.ts`)**
   - Add `getTemplate()` method to access unified registry
   - Update `fetchFromProvider()` to `fetchFromDataSource()`
   - Ensure DataSourceRegistry is accessible

6. **Site-builder Updates (`plugins/site-builder/src/lib/site-builder.ts`)**
   - Replace `getContentForSection()` with RenderService calls
   - Remove duplicate template resolution logic
   - Use DataSource pattern for dashboard

7. **Content Operations (`plugins/site-builder/src/lib/site-content-operations.ts`)**
   - Check `template.dataSourceId` before generation
   - Skip DataSource templates in content operations
   - Add appropriate logging

#### Phase 2D: Testing & Validation

8. **End-to-End Testing**
   - Dashboard shows real entity statistics (not mock)
   - Static content continues to work
   - DataSource pattern functions correctly
   - Performance benchmarks pass

## DataSource Architecture

### Why DataSource?

The term "Provider" was too generic and often confused with dependency injection providers. "DataSource" clearly indicates:

- **Purpose**: Provides data for templates
- **Pattern**: Familiar from database/API patterns
- **Clarity**: No confusion with DI or other provider patterns

### Package Structure

```
shell/datasource/
├── src/
│   ├── index.ts           # Main exports
│   ├── types.ts           # IDataSource interface
│   ├── registry.ts        # DataSourceRegistry with CIS pattern
│   └── base.ts            # BaseDataSource abstract class
├── test/
│   └── registry.test.ts
├── package.json
└── README.md
```

### Core Interfaces

```typescript
// shell/datasource/src/types.ts
export interface IDataSource {
  id: string;
  name: string;
  description?: string;

  // Optional methods - implement what you need
  fetch?: (query?: unknown) => Promise<unknown>;
  generate?: (request: unknown) => Promise<unknown>;
  transform?: (content: unknown, format: string) => Promise<unknown>;
}

export interface DataSourceCapabilities {
  canFetch: boolean;
  canGenerate: boolean;
  canTransform: boolean;
}

// shell/datasource/src/registry.ts
export class DataSourceRegistry {
  private static instance: DataSourceRegistry | null = null;
  private sources = new Map<string, IDataSource>();

  public static getInstance(): DataSourceRegistry {
    DataSourceRegistry.instance ??= new DataSourceRegistry();
    return DataSourceRegistry.instance;
  }

  public static resetInstance(): void {
    DataSourceRegistry.instance = null;
  }

  public static createFresh(): DataSourceRegistry {
    return new DataSourceRegistry();
  }

  register(source: IDataSource): void;
  unregister(id: string): void;
  get(id: string): IDataSource | undefined;
  has(id: string): boolean;
  list(): IDataSource[];
}
```

### Integration with Templates

```typescript
// shell/templates/src/types.ts
interface Template {
  name: string;
  description: string;
  schema: z.ZodSchema;

  // DataSource for dynamic data (renamed from providerId)
  dataSourceId?: string;

  // For AI generation
  basePrompt?: string;

  // For formatting
  formatter?: ContentFormatter<unknown>;

  // For rendering
  layout?: {
    component?: ComponentType<unknown>;
    interactive?: boolean;
  };

  requiredPermission: UserPermissionLevel;
}
```

### Dependency Flow

```
@brains/datasource (standalone, no shell dependencies)
    ↑
    ├── @brains/templates (references via dataSourceId)
    ├── @brains/content-service (uses for content generation)
    ├── @brains/render-service (uses for content resolution)
    └── @brains/plugins (re-exports for plugin development)
```

## RenderService Integration Strategy

### Architectural Shift

Moving content resolution logic from site-builder to RenderService provides:

- **Centralized template logic**: All template-related operations in one place
- **Reusable provider pattern**: Other plugins can leverage provider resolution
- **Clean separation**: Site-builder focuses on building, RenderService handles content resolution

### New RenderService Methods

```typescript
// shell/render-service/src/render-service.ts
import { DataSourceRegistry } from "@brains/datasource";

export interface ContentResolutionContext {
  routeId?: string;
  sectionId?: string;
  entityId?: string;
  entityType?: string;
  entityService: IEntityService;
  query?: unknown;
}

class RenderService {
  constructor(
    private templateRegistry: TemplateRegistry,
    private dataSourceRegistry: DataSourceRegistry,
  ) {}

  // New method for content resolution
  async resolveContent(
    templateName: string,
    context: ContentResolutionContext,
  ): Promise<unknown> {
    const template = this.templateRegistry.get(templateName);

    // Check for DataSource-based content
    if (template?.dataSourceId) {
      const dataSource = this.dataSourceRegistry.get(template.dataSourceId);
      if (dataSource?.fetch) {
        return await dataSource.fetch({
          routeId: context.routeId,
          sectionId: context.sectionId,
          ...context.query,
        });
      }
    }

    // Fall back to entity-based content
    if (context.entityId && context.entityType) {
      const entity = await context.entityService.getEntity(
        context.entityType,
        context.entityId,
      );
      if (entity && template?.formatter) {
        return template.formatter.parse(entity.content);
      }
    }

    return null;
  }

  // Helper to check if template uses DataSource
  usesDataSource(templateName: string): boolean {
    const template = this.templateRegistry.get(templateName);
    return !!template?.dataSourceId;
  }

  // Get DataSource for a template
  getDataSource(templateName: string): IDataSource | undefined {
    const template = this.templateRegistry.get(templateName);
    if (template?.dataSourceId) {
      return this.dataSourceRegistry.get(template.dataSourceId);
    }
    return undefined;
  }
}
```

## Implementation Roadmap

### Next Steps (Phases 2-3)

1. **Enhance RenderService with Content Resolution**
   - Add `resolveContent()` method for unified content fetching
   - Implement `usesProvider()` helper method
   - Create ContentResolutionContext interface

2. **Update ServicePluginContext**
   - Add `getTemplate()` to access unified registry
   - Ensure RenderService methods are accessible
   - Maintain backward compatibility

3. **Refactor Site-builder**
   - Replace `getContentForSection()` internals with RenderService calls
   - Remove duplicate template resolution logic
   - Use provider pattern for dashboard

4. **Optimize Content Generation**
   - Check templates before generation using `usesProvider()`
   - Skip provider templates in content operations
   - Add appropriate logging

5. **End-to-End Testing**
   - Dashboard shows real entity statistics
   - Static content still works correctly
   - Provider pattern functions properly
   - Performance benchmarks pass

### Success Criteria

- **Dashboard Problem Fixed**: Shows live entity counts, not stale/mock data
- **DataSource Pattern Working**: Dynamic content fetches fresh data at build time
- **Static Content Preserved**: Existing entity-based content still functions
- **Clean Architecture**:
  - Unified template registry (✅ completed)
  - Separate DataSource package with clear interfaces
  - RenderService handles all content resolution
  - No duplicate template logic in site-builder
- **Developer Experience**:
  - Clear naming (DataSource vs Provider)
  - Simple API (`template.dataSourceId`, `resolveContent()`)
  - Clean dependency graph

## Current Architecture

### Unified Template System ✅

```typescript
// shell/templates/src/types.ts - Single source of truth
interface Template {
  name: string;
  description: string;
  schema: z.ZodSchema;
  basePrompt?: string; // For AI generation
  requiredPermission: UserPermissionLevel;

  // Provider pattern support
  providerId?: string; // For dynamic data fetching
  formatter?: ContentFormatter<unknown>;

  // View rendering
  layout?: {
    component?: ComponentType<unknown>;
    interactive?: boolean;
  };
}

// shell/templates/src/registry.ts - Central registry
class TemplateRegistry {
  private templates = new Map<string, Template>();

  register(name: string, template: Template): void;
  get(name: string): Template | undefined;
  // ... other methods
}
```

### Provider Pattern Flow

```typescript
// Site-builder checks for provider
const template = context.getTemplate(section.template);

if (template?.providerId) {
  // Dynamic: Fetch fresh data at build time
  return await context.fetchFromProvider(template.providerId);
} else {
  // Static: Read cached entity from database
  return await context.entityService.getEntity(entityType, entityId);
}
```

## Why This Matters

### For Dynamic Content (Dashboards)

- **Now**: Shows stale data from last generation
- **After**: Shows real-time data fetched at build time

### For Static Content (Articles)

- **Now**: Works correctly
- **After**: Still works correctly

### Architecture Benefits

- **Single Source of Truth**: All template properties in one place
- **No Information Loss**: Provider, formatter, and layout info preserved
- **Clean Separation**: Templates, content generation, and view rendering properly separated
- **Developer Experience**: Simple `context.getTemplate()` API everywhere

## Testing Plan

### Phase 2 Testing

- [ ] Site-builder correctly identifies provider-based templates
- [ ] Dashboard fetches real entity statistics (not stale data)
- [ ] Provider data fetching works at build time
- [ ] Static content continues to work without regression

### Phase 3 Testing

- [ ] Content generation skips provider-based templates
- [ ] Entity generation only occurs for static content templates
- [ ] Performance improvements from reduced unnecessary generation

## Related Documentation

- [Unified Template Registry Plan](./unified-template-registry-plan.md) - Template architecture details
- [Content Provider Pattern](./content-provider-pattern.md) - Provider implementation guide
