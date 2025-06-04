# Frontmatter Utility Planning Document

## Goal

Create a generic frontmatter utility that ensures consistent handling across all entity adapters and supports complete roundtrip import/export, while moving to a cleaner database schema using JSON metadata.

## Current Problems

1. **BaseEntityAdapter** puts ALL fields in frontmatter (including system fields like id, created, updated)
2. **SiteContentAdapter** only puts entity-specific fields
3. No consistent approach to what belongs in frontmatter
4. **Database has redundant columns** for title/tags that duplicate frontmatter

## Database Schema Change

### Current Schema (Redundant)

```sql
entities: {
  id, entityType, title, content, tags, created, updated
}
```

### New Schema (Clean)

```sql
entities: {
  id: string,
  entityType: string,
  content: string,     -- Full markdown with frontmatter
  metadata: JSON,      -- Parsed frontmatter fields
  created: timestamp,
  updated: timestamp
}
```

### Benefits

- No redundancy between DB and markdown
- Flexible queries on any frontmatter field
- Single source of truth (markdown)
- Can add indexes on JSON fields as needed

## Design Decision: Clean Separation

### What Goes Where

#### Metadata JSON Column (From frontmatter)

- `title`
- `tags`
- Entity-specific fields (e.g., `page`, `section` for site-content)
- Any other frontmatter fields

#### Content Column

- Full markdown including frontmatter (for export/roundtrip)

#### System Columns (NOT in frontmatter)

- `id` - from filename
- `entityType` - from directory or adapter
- `created` - from file creation time or git
- `updated` - from file modification time or git

### Roundtrip Scenarios

#### Export (Entity → Markdown)

```typescript
// Entity in DB
{
  id: "20240104_note",
  entityType: "base",
  title: "My Note",
  content: "Note content...",
  tags: ["important"],
  created: "2024-01-04T10:00:00Z",
  updated: "2024-01-04T11:00:00Z"
}

// Exported as: 20240104_note.md
---
title: My Note
tags: [important]
---
Note content...
```

#### Import (Markdown → Entity)

```typescript
// File: 20240104_note.md
---
title: My Note
tags: [important]
---
Note content...

// Imported as:
{
  id: "20240104_note", // from filename
  entityType: "base", // from adapter
  title: "My Note", // from frontmatter
  content: "Note content...", // from body
  tags: ["important"], // from frontmatter
  created: "2024-01-04T10:00:00Z", // from file/git
  updated: "2024-01-04T11:00:00Z" // from file/git
}
```

## Query Changes

### Before (Hardcoded fields)

```typescript
// Limited to title/tags only
filter: {
  title: "landing:hero";
}
filter: {
  tags: ["important"];
}
```

### After (Flexible metadata)

```typescript
// Can query any frontmatter field
filter: { metadata: { title: "landing:hero" } }
filter: { metadata: { page: "landing", section: "hero" } }
filter: { metadata: { customField: "value" } }
```

## Utility API Design

```typescript
interface FrontmatterConfig<T extends BaseEntity> {
  // Which fields to include in frontmatter (besides default)
  includeFields?: (keyof T)[];

  // Which fields to exclude from frontmatter
  excludeFields?: (keyof T)[];

  // Custom handling for complex fields
  customSerializers?: {
    [K in keyof T]?: (value: T[K]) => any;
  };
}

// Helper to create adapter with consistent frontmatter handling
function createFrontmatterAdapter<T extends BaseEntity>(
  config?: FrontmatterConfig<T>,
) {
  return {
    toMarkdown: (entity: T) => {
      const metadata = extractMetadata(entity, config);
      return generateMarkdownWithFrontmatter(entity.content, metadata);
    },

    fromMarkdown: (markdown: string) => {
      const { metadata, content } = parseMarkdownWithFrontmatter(markdown);
      return { ...metadata, content } as Partial<T>;
    },

    extractMetadata: (entity: T) => {
      return extractMetadata(entity, config);
    },
  };
}

// Simple usage
const baseAdapter = createFrontmatterAdapter<BaseEntity>({
  excludeFields: ["id", "entityType", "created", "updated", "content"],
});

// With entity-specific fields
const siteContentAdapter = createFrontmatterAdapter<SiteContent>({
  includeFields: ["title", "tags", "page", "section"],
});
```

## Implementation Steps

### Phase 1: Database Schema Change

1. **Update Drizzle schema** to add metadata JSON column
2. **Remove title/tags columns** from entities table
3. **Update EntityService** to populate metadata from frontmatter
4. **Update ListOptions filter** to support metadata queries

### Phase 2: Create Frontmatter Utility

1. **Create utility** in `packages/utils/src/frontmatter.ts`
2. **Add metadata extraction** functions
3. **Add frontmatter generation** functions
4. **Add roundtrip tests**

### Phase 3: Update Adapters

1. **Update BaseEntityAdapter** to exclude system fields from frontmatter
2. **Update SiteContentAdapter** to use the utility
3. **Ensure extractMetadata** returns proper JSON for DB storage

### Phase 4: Update Queries

1. **Update site-content queries** to use `filter: { metadata: { title: "..." } }`
2. **Add indexes** for frequently queried metadata fields if needed
3. **Test performance** with real data

## Benefits

- **No redundancy**: Single source of truth (markdown files)
- **Flexible queries**: Can filter on any frontmatter field
- **Clean architecture**: Clear separation of concerns
- **Future-proof**: Easy to add new entity types with custom fields
- **Performance**: Can optimize with indexes as needed

## Migration Note

Since we can delete and recreate the database, no migration needed. Just:

1. Update schema
2. Re-import all markdown files
3. Metadata will be populated from frontmatter
