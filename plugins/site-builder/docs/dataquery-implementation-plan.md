# DataQuery Implementation Plan (REVISED)

## Overview

Extend `contentEntity` to support ALL DataSource types (not just entities), then rename it to `dataQuery` in a single atomic migration.

## Motivation

Currently, we have two different patterns for dynamic content:

1. Entity-based content uses `contentEntity` with `entityType` + `query`
2. Non-entity DataSources (like navigation) have no way to pass query parameters

Rather than introducing a new field and managing dual paths, we'll extend the existing `contentEntity` to work for all DataSources, then rename it.

## Implementation Strategy (Revised)

### Phase 1: Extend contentEntity for All DataSources

**Goal**: Make `contentEntity` work for both entity and non-entity DataSources

#### 1.1 Update SiteBuilder Logic

Modify `getContentForSection` to detect DataSource type:

```typescript
if (section.contentEntity) {
  // Detect if this is an entity DataSource (has entityType)
  const isEntityDataSource = 'entityType' in section.contentEntity;
  const format = isEntityDataSource && section.contentEntity.query?.id 
    ? "detail" 
    : isEntityDataSource 
    ? "list" 
    : undefined;

  const content = await this.context.resolveContent(templateName, {
    dataParams: section.contentEntity,
    transformFormat: format,
    fallback: section.content,
  });
}
```

#### 1.2 Implement NavigationDataSource Query Support

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

#### 1.3 Test Both Patterns with contentEntity

- Test entity DataSources (existing behavior)
- Test non-entity DataSources (new capability)
- Verify footer can use `contentEntity` for navigation queries

### Phase 2: Atomic Rename to dataQuery

**Goal**: Single commit that renames `contentEntity` to `dataQuery` everywhere

#### 2.1 Mass Rename

- Update `SectionDefinitionSchema`: `contentEntity` → `dataQuery`
- Update all route definitions
- Update site-builder references
- Update dynamic-route-generator
- Update all tests
- Update documentation

#### 2.2 No Logic Changes

- The rename is purely cosmetic
- All functionality remains identical
- No dual-path logic needed

## Example Usage

### Current State

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

### After Phase 1 (Extended contentEntity)

```typescript
// Entity-based (unchanged)
{
  id: "topics",
  template: "topic-list",
  contentEntity: {
    entityType: "topic",
    query: { limit: 100 }
  }
}

// Navigation (NOW WORKS with contentEntity!)
{
  id: "footer",
  template: "footer",
  contentEntity: {  // Using same field, no entityType
    slot: "main",
    limit: 5,
    excludePaths: ["/admin"]
  }
}
```

### After Phase 2 (Renamed to dataQuery)

```typescript
// All dynamic content uses dataQuery (just renamed)
{
  id: "topics",
  template: "topic-list",
  dataQuery: {  // Was contentEntity
    entityType: "topic",
    query: { limit: 100 }
  }
}

{
  id: "footer",
  template: "footer",
  dataQuery: {  // Was contentEntity
    slot: "main",
    limit: 5,
    excludePaths: ["/admin"]
  }
}
```

## Benefits of Revised Approach

1. **No Dual Paths**: Single code path throughout the migration
2. **Lower Risk**: Extend existing functionality rather than replace
3. **Simpler Testing**: Test everything with `contentEntity` first
4. **Atomic Migration**: Rename is a simple find/replace operation
5. **No Breaking Changes**: Until the rename, everything works as before

## Risk Assessment

**Phase 1 Risk: LOW**
- Only extending functionality, not breaking existing behavior
- Entity DataSources continue to work exactly as before
- New capability is opt-in (use contentEntity for navigation)

**Phase 2 Risk: LOW-MEDIUM**
- Simple rename operation
- Can be done with find/replace
- Easy to review in a single PR
- If issues found, easy to revert

## Success Criteria

- [ ] NavigationDataSource accepts and uses query parameters
- [ ] Footer can use `contentEntity` for navigation queries
- [ ] All existing entity-based routes continue to work
- [ ] Tests pass for both entity and non-entity DataSources
- [ ] Successful rename from `contentEntity` to `dataQuery`
- [ ] Documentation updated with examples

## Implementation Notes

- Detection of entity vs non-entity is based on presence of `entityType` field
- DataSources validate their own query schemas
- The `content` field remains for static content only
- After Phase 2, the field name better reflects its purpose (not just for entities)
