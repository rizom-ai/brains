# DataQuery Implementation Plan

## Overview
Implement a unified `dataQuery` field for passing query parameters to DataSource-backed templates, starting with NavigationDataSource and later migrating entity queries.

## Motivation
Currently, we have two different patterns for dynamic content:
1. Entity-based content uses `contentEntity` with `entityType` + `query`
2. Non-entity DataSources (like navigation) have no way to pass query parameters

The `dataQuery` field will unify these approaches while maintaining backward compatibility.

## Implementation Phases

### Phase 1: Add dataQuery Support for Navigation
**Goal**: Introduce `dataQuery` without breaking existing functionality

#### 1.1 Add dataQuery to SectionDefinitionSchema
- Add `dataQuery: z.unknown().optional()` field
- Keep `contentEntity` unchanged for backward compatibility
- Document that both fields can coexist during transition

#### 1.2 Update SiteBuilder
- Modify `getContentForSection` to check for `dataQuery` first
- If `dataQuery` exists and no `contentEntity`, pass it as `dataParams` to `resolveContent`
- If `contentEntity` exists, use existing logic (backward compatibility)
- No breaking changes to existing routes

#### 1.3 Implement NavigationDataSource Query Support
Create `NavigationQuerySchema`:
```typescript
{
  slot?: string;        // Navigation slot (default: "main")
  limit?: number;       // Maximum items to return
  excludePaths?: string[]; // Paths to exclude from navigation
}
```

Update NavigationDataSource:
- Parse and validate query using NavigationQuerySchema
- Filter navigation items based on query parameters
- Default to current behavior when no query provided

#### 1.4 Test with Footer Template
- Update footer section to demonstrate `dataQuery` usage
- Add comprehensive tests for query filtering
- Verify backward compatibility

### Phase 2: Migrate Entity Queries (Future)
**Goal**: Unify all dynamic content under `dataQuery`

#### 2.1 Update Entity-based Routes
- Migrate `contentEntity` usage to `dataQuery` with `entityType` field
- Update dynamic-route-generator
- Update all tests

#### 2.2 Deprecate contentEntity
- Mark `contentEntity` as deprecated in schema
- Add migration guide in documentation
- Plan removal timeline

## Example Usage

### Before (Current State)
```typescript
// Entity-based (works)
{
  id: "topics",
  template: "topic-list",
  contentEntity: {
    entityType: "topic",
    query: { limit: 100 }
  }
}

// Navigation (no query support)
{
  id: "footer",
  template: "footer"
}
```

### After Phase 1
```typescript
// Entity-based (still works - backward compatible)
{
  id: "topics",
  template: "topic-list",
  contentEntity: {
    entityType: "topic",
    query: { limit: 100 }
  }
}

// Navigation (new - with query support)
{
  id: "footer",
  template: "footer",
  dataQuery: { 
    slot: "main", 
    limit: 5,
    excludePaths: ["/admin"]
  }
}
```

### After Phase 2 (Future)
```typescript
// All dynamic content uses dataQuery
{
  id: "topics",
  template: "topic-list",
  dataQuery: {
    entityType: "topic",  // For entity DataSources
    limit: 100
  }
}

{
  id: "footer",
  template: "footer",
  dataQuery: { 
    slot: "main", 
    limit: 5
  }
}
```

## Benefits
1. **Unified API**: Single way to pass queries to any DataSource
2. **Backward Compatible**: No breaking changes during migration
3. **Type Safety**: Each DataSource can define its own query schema
4. **Flexibility**: Templates can work with or without queries
5. **Clear Separation**: `content` for static, `dataQuery` for dynamic

## Success Criteria
- [ ] NavigationDataSource accepts and uses query parameters
- [ ] Footer can limit/filter navigation items via dataQuery
- [ ] All existing routes continue to work unchanged
- [ ] Tests pass for both new and legacy patterns
- [ ] Documentation updated with examples

## Notes
- Templates define which DataSource they use via `dataSourceId`
- Sections only provide the query parameters via `dataQuery`
- DataSources are responsible for validating their own query schemas
- The `content` field remains for static content only