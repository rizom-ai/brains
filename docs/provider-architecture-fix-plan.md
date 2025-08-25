# Provider Architecture Fix Plan

> **📋 STATUS UPDATE**: Phase 1 (template type issues) has been resolved using the [Unified Template Registry Plan](./unified-template-registry-plan.md). This plan remains active for implementing the provider pattern behavior (Phases 2-3).
>
> **Current Focus**: Site-builder integration with provider pattern, content generation optimization, and end-to-end provider data flow.

## Problem Statement

Dashboard shows stale/mock data because provider information is lost during Template → ViewTemplate conversion, preventing fresh data fetch at build time.

## Root Cause Analysis

### Type Architecture Issues

1. **Template** lives in wrong place (`view-registry` instead of `content-service`)
2. **Template** has wrong name (should be `ContentTemplate` for clarity)
3. **ViewTemplate** loses critical information during conversion (providerId, formatter)

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

- **Site-builder integration**: Update `getContentForSection()` to check for providers

### ⏳ Remaining Work

1. **`plugins/site-builder/src/lib/site-builder.ts`**
   - Implement provider checking in `getContentForSection()`
   - Add template lookup via `context.getTemplate()`

2. **`plugins/site-builder/src/lib/site-content-operations.ts`**
   - Skip content generation for provider-based templates
   - Add template checks in generate operations

3. **Testing & Validation**
   - Verify dashboard shows real entity data
   - Test provider vs entity patterns
   - Performance validation

## Implementation Roadmap

### Next Steps (Phases 2-3)

1. **Implement Site-builder Provider Support**
   - Add `context.getTemplate()` calls in site-builder
   - Implement provider checking logic in `getContentForSection()`
   - Test with dashboard template

2. **Optimize Content Generation**
   - Update generate operations to skip provider templates
   - Add template-based generation logic
   - Validate generation performance

3. **End-to-End Testing**
   - Dashboard shows real entity statistics
   - Static content still works correctly
   - Provider pattern functions properly

### Success Criteria

- **Dashboard Problem Fixed**: Shows live entity counts, not stale data
- **Provider Pattern Working**: Dynamic content fetches fresh data at build time
- **Static Content Preserved**: Existing entity-based content still functions
- **Clean Architecture**: Single template registry, clear provider vs entity patterns

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
