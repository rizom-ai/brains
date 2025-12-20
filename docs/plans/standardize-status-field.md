# Plan: Standardize Status Field and Push Filtering to Entity Service

## Problem

Phase 1 (completed) moved `publishedOnly` flag to site-builder, but each datasource still filters manually with inconsistent logic:

- Blog filters on `publishedAt` existence (ignores `status` field it already has)
- Link uses `"complete"` instead of `"published"` status
- Each datasource duplicates the same filtering code

## Goal

1. Standardize all entities on `status: "draft" | "published"`
2. Push filtering down to entity service so datasources don't need to filter at all

## Changes

### 1. Link Schema - Change Status Values

**File:** `plugins/link/src/schemas/link.ts`

```typescript
// Before:
export const linkStatusSchema = z.enum(["complete", "pending", "failed"]);

// After:
export const linkStatusSchema = z.enum([
  "pending",
  "draft",
  "published",
  "failed",
]);
```

Workflow change:

- `pending` - Extraction in progress or failed
- `draft` - Extraction complete, awaiting review (was "complete")
- `published` - User explicitly published
- `failed` - Permanently broken

### 2. Link Capture - Set Status to "draft"

**Files:**

- `plugins/link/src/handlers/capture-handler.ts` - Change `status: "complete"` → `status: "draft"`
- `plugins/link/src/lib/link-service.ts` - Same change

### 3. Entity Service - Add publishedOnly Option

**File:** `shell/entity-service/src/entity-queries.ts`

Add `publishedOnly?: boolean` to list options. When true, add filter `metadata.status = "published"`.

```typescript
const listOptionsSchema = z.object({
  // ... existing fields ...
  publishedOnly: z.boolean().optional(), // NEW
});

// In listEntities():
if (options?.publishedOnly) {
  whereConditions.push(
    sql`json_extract(${entities.metadata}, '$.status') = 'published'`,
  );
}
```

**Also update:**

- `shell/entity-service/src/entityService.ts` - Add to public interface
- `shell/entity-service/src/types.ts` - Add to IEntityService interface

### 4. Blog Datasource - Use Status Field

**File:** `plugins/blog/src/datasources/blog-datasource.ts`

Change filtering from `publishedAt` existence to `status === "published"`:

```typescript
// Before:
const filteredPosts = context.publishedOnly
  ? entities.filter((p) => p.metadata.publishedAt)
  : entities;

// After - use entity service filtering:
const entities = await this.entityService.listEntities<BlogPost>("post", {
  limit: 1000,
  publishedOnly: context.publishedOnly,
});
// No manual filtering needed!
```

### 5. Update All Datasources to Use Entity Service Filtering

Remove manual filtering from:

- `plugins/blog/src/datasources/blog-datasource.ts`
- `plugins/portfolio/src/datasources/project-datasource.ts`
- `plugins/decks/src/datasources/deck-datasource.ts`
- `plugins/link/src/datasources/links-datasource.ts`

Pattern:

```typescript
// Before:
const entities = await this.entityService.listEntities("type", { limit: 1000 });
const filtered = context.publishedOnly
  ? entities.filter((e) => e.metadata.status === "published")
  : entities;

// After:
const entities = await this.entityService.listEntities("type", {
  limit: 1000,
  publishedOnly: context.publishedOnly,
});
// Done - no manual filtering!
```

## Files to Modify

### Link Plugin (schema + capture)

- `plugins/link/src/schemas/link.ts` - Update enum values
- `plugins/link/src/handlers/capture-handler.ts` - Change "complete" → "draft"
- `plugins/link/src/lib/link-service.ts` - Change "complete" → "draft"
- `plugins/link/test/datasource.test.ts` - Update test expectations
- `plugins/link/test/plugin.test.ts` - Update test data

### Entity Service

- `shell/entity-service/src/entity-queries.ts` - Add publishedOnly filter
- `shell/entity-service/src/entityService.ts` - Update public interface
- `shell/entity-service/src/types.ts` - Update IEntityService interface

### Datasources (remove manual filtering)

- `plugins/blog/src/datasources/blog-datasource.ts`
- `plugins/portfolio/src/datasources/project-datasource.ts`
- `plugins/decks/src/datasources/deck-datasource.ts`
- `plugins/link/src/datasources/links-datasource.ts`

### RSS (already correct)

- `plugins/blog/src/datasources/rss-datasource.ts` - Already checks `status === "published"`

## Implementation Order

1. **Update link schema** - Add "draft"/"published", remove "complete"
2. **Update link capture** - Set status to "draft" on successful extraction
3. **Add publishedOnly to entity service** - Core filtering capability
4. **Update datasources** - Use entity service filtering, remove manual code
5. **Update tests** - Fix all test expectations

## Benefits

- Single filtering location (entity service)
- Consistent status values across all entities
- Datasources become simpler (no filtering logic)
- Database-level filtering (more efficient than fetching all + filtering)
