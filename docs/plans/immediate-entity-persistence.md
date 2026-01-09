# Design Doc: Immediate Entity Persistence with Async Embeddings

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

Write entities to DB immediately with empty embedding placeholder, queue embedding job separately.

### New Flow

```
createEntity(data)
    │
    ▼
Validate & prepare entity
    │
    ▼
INSERT entity with embedding=[] ◄──── Immediate DB write
    │
    ▼
Enqueue embedding job
    │
    ▼
Return { entityId, jobId }

    [Entity IS in DB immediately]

                              Embedding job runs
                                         │
                                         ▼
                              Generate embedding
                                         │
                                         ▼
                              UPDATE embedding field only
```

### Benefits

1. **Immediate consistency**: `getEntity()` works right after `createEntity()`
2. **No race conditions**: Concurrent writers can read each other's state
3. **Simpler mental model**: Create means create, not "will create eventually"
4. **Embedding failures don't lose data**: Entity exists even if embedding fails

## Implementation Plan

### File Changes

| File                                                       | Change                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `shell/entity-service/src/entityService.ts`                | Modify `createEntity()` and `updateEntity()` to write immediately |
| `shell/entity-service/src/handlers/embeddingJobHandler.ts` | Update to only set embedding field (already mostly done)          |

### Step 1: Use empty Float32Array as placeholder

**Approach**: Use `new Float32Array(0)` as placeholder to avoid schema migration:

```typescript
embedding: new Float32Array(0),  // Empty placeholder, won't match any search
```

This is simpler because:

- No schema change needed
- No migration needed
- Empty embedding won't match any vector search (different dimensions)
- Easy to detect: `embedding.length === 0` means "pending"

### Step 2: Modify createEntity() to write immediately

**File: `shell/entity-service/src/entityService.ts`**

```typescript
public async createEntity<T extends BaseEntity>(
  entity: EntityInput<T>,
  options?: { priority?: number; maxRetries?: number },
): Promise<{ entityId: string; jobId: string }> {
  // ... validation code stays the same ...

  // NEW: Write entity to DB immediately (without embedding)
  const { entities } = await import("./schema/entities");
  await this.db.insert(entities).values({
    id: validatedEntity.id,
    entityType: validatedEntity.entityType,
    content: markdown,
    contentHash: computeContentHash(markdown),
    metadata,
    created: new Date(validatedEntity.created).getTime(),
    updated: new Date(validatedEntity.updated).getTime(),
    contentWeight,
    embedding: new Float32Array(0), // Empty placeholder, filled by embedding job
  });

  // Queue embedding job (same as before)
  const jobId = await this.jobQueueService.enqueue(
    "shell:embedding",
    entityForQueue,
    { ... }
  );

  return { entityId: validatedEntity.id, jobId };
}
```

### Step 3: Modify updateEntity() similarly

Same pattern - write immediately, queue embedding update.

### Step 4: Update embeddingJobHandler to only update embedding

**File: `shell/entity-service/src/handlers/embeddingJobHandler.ts`**

The handler should UPDATE only the embedding field, not INSERT:

```typescript
// Instead of storeEntityWithEmbedding (which does INSERT ... ON CONFLICT)
// Use a pure UPDATE
await this.db
  .update(entities)
  .set({ embedding: embedding })
  .where(
    and(eq(entities.id, data.id), eq(entities.entityType, data.entityType)),
  );
```

### Step 5: Handle the contentHash check

The current stale-content check compares job contentHash with DB contentHash.
This still works - if content changed, we skip the embedding (it would be wrong anyway).

## Edge Cases

### 1. Entity deleted before embedding job runs

- Embedding job checks if entity exists
- If not found, skip (already handled)

### 2. Entity updated multiple times before embedding completes

- Each update writes new content immediately
- Old embedding jobs detect content changed → skip
- Latest embedding job succeeds (already handled)

### 3. Search before embedding exists

- Entities with empty embedding (length 0) won't match vector searches
- They WILL appear in `listEntities()` and `getEntity()`
- This is acceptable - search requires real embeddings
- Could optionally filter these out explicitly in search if needed

## Migration

No data migration needed:

- Existing entities already have embeddings
- New entities get written immediately with empty placeholder, then embedding added

## Testing

### Unit Tests

1. `createEntity()` should make entity immediately readable
2. `updateEntity()` should make changes immediately visible
3. Embedding job should only update embedding field
4. Concurrent topic updates should accumulate sources correctly

### Integration Tests

1. Create entity → immediately getEntity() → should return entity
2. Create topic from entity A → create topic from entity B → topic has both sources
3. Search should not return entities without embeddings
4. Search should return entities after embedding completes

## Verification

1. `bun run typecheck`
2. `bun test shell/entity-service/test/`
3. Manual test:
   - Start brain, trigger topic extraction from multiple entities
   - Verify topics have all sources (not just last one)
   - Verify `getEntity()` works immediately after `createEntity()`

## Rollback Plan

If issues arise:

1. Revert to async-only writes
2. Add `immediate: boolean` option to `createEntity()` for gradual migration
