# Provider Architecture Fix Plan

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

### Phase 1: Refactor Template Types (BREAKING CHANGE)

#### 1.1 Move and Rename Template
- Move `Template` from `shell/view-registry/src/types.ts` to `shell/content-service/src/types.ts`
- Rename `Template` → `ContentTemplate`
- Update all imports across codebase

#### 1.2 Enhance ViewTemplate
Add to `ViewTemplate` interface:
```typescript
providerId?: string;      // For provider-based data
formatter?: ContentFormatter<T>;  // For parsing stored content
```

#### 1.3 Update Template Conversion
In `view-registry.ts`, preserve provider info when converting:
```typescript
const viewTemplate: ViewTemplate = {
  // ... existing fields
  providerId: template.providerId,
  formatter: template.formatter,
};
```

### Phase 2: Fix Build-Time Data Fetching

#### 2.1 Update Site Builder
Modify `getContentForSection()` to check for providers:
```typescript
// If template has provider, fetch fresh data
if (template.providerId) {
  return await context.fetchFromProvider(template.providerId);
}
// Otherwise use existing entity flow
```

#### 2.2 Fix Dashboard Formatter
Replace mock data with proper YAML parsing using `js-yaml`

### Phase 3: Optimize Content Generation

#### 3.1 Skip Generation for Provider-Based Content
Templates with `providerId` shouldn't generate/store content entities

#### 3.2 Document Provider vs Entity Patterns
- Providers: Dynamic, real-time data (dashboards, stats)
- Entities: Static, authored content (articles, notes)

## Files to Modify

### Critical Changes
1. `shell/view-registry/src/types.ts` - Move Template, update ViewTemplate
2. `shell/content-service/src/types.ts` - Add ContentTemplate
3. `shell/view-registry/src/view-registry.ts` - Fix conversion
4. `plugins/site-builder/src/lib/site-builder.ts` - Add provider support
5. `plugins/site-builder/src/templates/dashboard/formatter.ts` - Fix parsing

### Import Updates
- All files importing Template from view-registry (~15 files)

## Migration Strategy
1. Create new types first (ContentTemplate, enhanced ViewTemplate)
2. Update imports incrementally
3. Fix site-builder to use providers
4. Test with dashboard
5. Document patterns

## Type Definitions

### Current (Problematic) Structure
```typescript
// In view-registry (WRONG PLACE)
interface Template<T> {
  name: string;
  schema: z.ZodType<T>;
  
  // Content generation
  basePrompt?: string;
  providerId?: string;
  getData?: () => Promise<T>;
  
  // Formatting
  formatter?: ContentFormatter<T>;
  
  // View rendering
  layout?: {
    component: Component;
    interactive?: boolean;
  };
}

// Also in view-registry
interface ViewTemplate<T> {
  name: string;
  schema: z.ZodType<T>;
  pluginId: string;
  
  // Only rendering info (MISSING provider/formatter!)
  renderers: {
    web?: WebRenderer<T>;
  };
  interactive: boolean;
}
```

### Proposed (Clean) Structure
```typescript
// In content-service (RIGHT PLACE)
interface ContentTemplate<T> {
  name: string;
  schema: z.ZodType<T>;
  
  // Content generation
  basePrompt?: string;
  providerId?: string;
  getData?: () => Promise<T>;
  
  // Formatting
  formatter?: ContentFormatter<T>;
  
  // View component reference
  layout?: {
    component: Component;
    interactive?: boolean;
  };
}

// In view-registry
interface ViewTemplate<T> {
  name: string;
  schema: z.ZodType<T>;
  pluginId: string;
  
  // Rendering
  renderers: {
    web?: WebRenderer<T>;
  };
  interactive: boolean;
  
  // Content source info (NEW!)
  providerId?: string;
  formatter?: ContentFormatter<T>;
}
```

## Why This Matters

### For Dynamic Content (Dashboards)
- **Now**: Shows stale data from last generation
- **After**: Shows real-time data fetched at build time

### For Static Content (Articles)
- **Now**: Works correctly
- **After**: Still works correctly

### Architecture Clarity
- **Now**: Confusing mix of concerns in view-registry
- **After**: Clear separation - content in content-service, views in view-registry

## Testing Plan
1. Dashboard shows real entity stats (not mock data)
2. Static content still renders correctly
3. No regression in existing functionality
4. Provider pattern works end-to-end

## Cleanup Tasks
- Remove `docs/content-management-refined-plan.md` (outdated - proposed merging view-registry)
- Remove `docs/large-file-refactoring-plan.md` (unrelated to current work)
- Archive `docs/content-provider-pattern.md` after implementation