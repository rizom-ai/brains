# Design Doc: Immediate Entity Persistence with Separate Embeddings Table

## Problem Statement

Currently, entities are only persisted to the database AFTER their embedding job completes. This creates several issues:

1. **Race conditions**: Multiple writers to the same entity (e.g., topics) lose data because they can't read each other's writes
2. **Inconsistency**: `getEntity()` returns null immediately after `createEntity()`
3. **Topic source loss**: When multiple entities extract the same topic, only the last one's sources survive

### Current Flow (Broken)

```
createEntity(data)
    │
    ▼
Validate & prepare entity
    │
    ▼
Enqueue embedding job ──────────────────┐
    │                                    │
    ▼                                    │
Return { entityId, jobId }               │
                                         │
    [Entity NOT in DB yet]               │
                                         │
                              Embedding job runs
                                         │
                                         ▼
                              Generate embedding
                                         │
                                         ▼
                              storeEntityWithEmbedding()
                                         │
                                         ▼
                              [Entity NOW in DB]
```

### Race Condition Example (Topics)

```
Time    Entity A                    Entity B                    DB State
─────────────────────────────────────────────────────────────────────────
T1      createTopic("X", src:A)     -                           (empty)
        → queues job A

T2      -                           createTopic("X", src:B)     (empty)
                                    → getTopic("X") = null
                                    → queues job B (NEW topic)

T3      Job A runs                  -                           Topic X: [A]
        → writes Topic X with [A]

T4      -                           Job B runs                  Topic X: [B]
                                    → OVERWRITES with [B] only!

Result: Source A is lost!
```

## Proposed Solution

Separate entity data from embeddings into two tables:

1. **`entities` table**: Core entity data (content, metadata, timestamps) - written immediately
2. **`embeddings` table**: Vector embeddings - written asynchronously by embedding job

### New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         entities table                          │
├─────────────────────────────────────────────────────────────────┤
│ id | entityType | content | contentHash | metadata | timestamps │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1 (optional)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        embeddings table                         │
├─────────────────────────────────────────────────────────────────┤
│ entity_id | entity_type | embedding | content_hash              │
└─────────────────────────────────────────────────────────────────┘
```

### New Flow

```
createEntity(data)
    │
    ▼
Validate & prepare entity
    │
    ▼
INSERT into entities table ◄──── Immediate DB write
    │
    ▼
Emit entity:created event
    │
    ▼
Enqueue embedding job
    │
    ▼
Return { entityId, jobId }

    [Entity IS in DB immediately]
    [Can be read, updated, listed]
    [Just won't appear in vector search yet]

                              Embedding job runs
                                         │
                                         ▼
                              Generate embedding
                                         │
                                         ▼
                              INSERT/UPDATE embeddings table
                                         │
                                         ▼
                              Emit entity:embedding:ready event
```

### Benefits

1. **Immediate consistency**: `getEntity()` works right after `createEntity()`
2. **No race conditions**: Concurrent writers can read each other's state
3. **Clean separation**: Entity data vs. vector data clearly separated
4. **Simpler entity table**: No large binary embedding column
5. **Embedding failures don't lose data**: Entity exists even if embedding fails
6. **Future-proof**: Easy to swap embedding models or use specialized vector DBs
7. **Easier embedding regeneration**: Just truncate/rebuild embeddings table

## Implementation Plan

### File Changes

| File                                                       | Change                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shell/entity-service/src/schema/entities.ts`              | Remove embedding column                                                        |
| `shell/entity-service/src/schema/embeddings.ts`            | NEW: embeddings table schema                                                   |
| `shell/entity-service/src/entityService.ts`                | Modify `createEntity()` and `updateEntity()` to write immediately, emit events |
| `shell/entity-service/src/handlers/embeddingJobHandler.ts` | Update to insert into embeddings table                                         |
| `shell/entity-service/src/entity-search.ts`                | Join with embeddings table for vector search                                   |
| `shell/entity-service/src/db.ts`                           | Add embeddings table to schema                                                 |

### Step 1: Create embeddings table schema

**New file: `shell/entity-service/src/schema/embeddings.ts`**

```typescript
import { sqliteTable, text, blob, primaryKey } from "drizzle-orm/sqlite-core";
import { entities } from "./entities";

export const embeddings = sqliteTable(
  "embeddings",
  {
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    embedding: blob("embedding", { mode: "buffer" })
      .notNull()
      .$type<Float32Array>(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [primaryKey({ columns: [table.entityId, table.entityType] })],
);
```

### Step 2: Remove embedding from entities table

**File: `shell/entity-service/src/schema/entities.ts`**

Remove the `embedding` column. The entities table becomes:

```typescript
export const entities = sqliteTable(
  "entities",
  {
    id: text("id").notNull(),
    entityType: text("entity_type").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    metadata: text("metadata", { mode: "json" }),
    created: integer("created").notNull(),
    updated: integer("updated").notNull(),
    contentWeight: real("content_weight").notNull().default(1.0),
    // embedding column REMOVED
  },
  (table) => [primaryKey({ columns: [table.id, table.entityType] })],
);
```

### Step 3: Modify createEntity() to write immediately

**File: `shell/entity-service/src/entityService.ts`**

```typescript
public async createEntity<T extends BaseEntity>(
  entity: EntityInput<T>,
  options?: { priority?: number; maxRetries?: number },
): Promise<{ entityId: string; jobId: string }> {
  // ... validation code stays the same ...

  // Write entity to DB immediately (no embedding)
  await this.db.insert(entities).values({
    id: validatedEntity.id,
    entityType: validatedEntity.entityType,
    content: markdown,
    contentHash,
    metadata,
    created: createdTs,
    updated: updatedTs,
    contentWeight,
  });

  // Emit entity:created event immediately
  if (this.messageBus) {
    await this.messageBus.send("entity:created", { ... }, ...);
  }

  // Queue embedding job
  const jobId = await this.jobQueueService.enqueue("shell:embedding", ...);

  return { entityId: validatedEntity.id, jobId };
}
```

### Step 4: Modify updateEntity() similarly

Same pattern - write entity immediately, queue embedding job separately.

### Step 5: Update embeddingJobHandler

**File: `shell/entity-service/src/handlers/embeddingJobHandler.ts`**

```typescript
// Instead of storeEntityWithEmbedding (which writes to entities table)
// Insert/update embeddings table only
await this.db
  .insert(embeddings)
  .values({
    entityId: data.id,
    entityType: data.entityType,
    embedding: embedding,
    contentHash: data.contentHash,
  })
  .onConflictDoUpdate({
    target: [embeddings.entityId, embeddings.entityType],
    set: { embedding, contentHash: data.contentHash },
  });

// Emit entity:embedding:ready (not entity:updated)
```

### Step 6: Update EntitySearch to join

**File: `shell/entity-service/src/entity-search.ts`**

```typescript
const results = await this.db
  .select({
    id: entities.id,
    entityType: entities.entityType,
    content: entities.content,
    // ... other entity fields
    distance: sql`vector_distance_cos(${embeddings.embedding}, ...)`,
  })
  .from(entities)
  .innerJoin(
    embeddings,
    and(
      eq(entities.id, embeddings.entityId),
      eq(entities.entityType, embeddings.entityType),
    ),
  )
  .where(...)
  .orderBy(...)
  .limit(limit);
```

### Step 7: Handle cascade delete

When an entity is deleted, also delete its embedding:

```typescript
public async deleteEntity(entityType: string, id: string): Promise<boolean> {
  // Delete embedding first
  await this.db
    .delete(embeddings)
    .where(
      and(eq(embeddings.entityId, id), eq(embeddings.entityType, entityType)),
    );

  // Delete entity
  const result = await this.entityQueries.deleteEntity(entityType, id);
  // ... emit event ...
}
```

## Edge Cases

### 1. Entity deleted before embedding job runs

- Embedding job should check if entity still exists
- If not found, skip silently (entity was deleted)

### 2. Entity updated multiple times before embedding completes

- Each update writes new content/contentHash immediately
- Old embedding jobs detect contentHash mismatch → skip
- Latest embedding job succeeds

### 3. Search before embedding exists

- `INNER JOIN` means entities without embeddings don't appear in search
- They DO appear in `listEntities()` and `getEntity()`
- This is correct behavior - vector search requires embeddings

### 4. Listing entities that have embeddings

If needed, can add a `listEntitiesWithEmbeddings()` method that does a LEFT JOIN and filters.

## Migration

### Schema Migration

1. Create new `embeddings` table
2. Copy existing embeddings: `INSERT INTO embeddings SELECT id, entity_type, embedding, content_hash FROM entities`
3. Drop `embedding` column from entities (or leave it and ignore)

### For Fresh Databases

- Just use new schema with both tables
- No migration needed

## Testing

### Unit Tests

1. `createEntity()` should make entity immediately readable
2. `updateEntity()` should make changes immediately visible
3. Embedding job should insert into embeddings table
4. Search should only return entities with embeddings
5. Delete should cascade to embeddings table

### Integration Tests

1. Create entity → immediately getEntity() → should return entity
2. Create topic from entity A → create topic from entity B → topic has both sources
3. Search should not return newly created entities (no embedding yet)
4. After embedding job completes → search should return entity

## Verification

1. `bun run typecheck`
2. `bun test shell/entity-service/test/`
3. Manual test:
   - Start brain, trigger topic extraction from multiple entities
   - Verify topics have all sources (not just last one)
   - Verify `getEntity()` works immediately after `createEntity()`

## Rollback Plan

If issues arise:

1. Re-add embedding column to entities table
2. Copy embeddings back: `UPDATE entities SET embedding = (SELECT embedding FROM embeddings WHERE ...)`
3. Revert code changes
