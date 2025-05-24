# Embedding Generation Options

## Overview

This document compares two approaches for generating embeddings in the Personal Brain shell service: asynchronous generation with external APIs vs synchronous generation with local models.

**Decision**: Based on the requirements for fast, reliable RAG functionality, we've chosen to implement **synchronous local embeddings** using all-MiniLM-L6-v2.

## Context

- Embeddings are the primary use case for the storage system
- Shell service internally manages all embedding logic
- Target deployment includes small devices (Raspberry Pi 5)
- Entity adapters only provide `toMarkdown()`, not embedding logic

## Option 1: Asynchronous Generation

### Architecture

```
Entity Creation → Store with null embedding → Queue job → Generate embedding → Update record
                                                ↓
                                          Background Worker
```

### Implementation Details

```typescript
// Database schema
embedding: vector("embedding"), // Nullable

// Entity creation flow
async createEntity(entity: T): Promise<T> {
  // Store entity with null embedding
  const result = await this.db.insert(entities).values({
    ...entityData,
    embedding: null,
    embeddingStatus: 'pending'
  });

  // Queue embedding generation
  await this.embeddingQueue.add({
    entityId: result.id,
    content: markdown
  });

  return entity;
}

// Background worker
async processEmbeddingJob(job: EmbeddingJob) {
  const embedding = await this.embeddingService.generate(job.content);
  await this.db.update(entities)
    .set({
      embedding,
      embeddingStatus: 'ready'
    })
    .where(eq(entities.id, job.entityId));
}
```

### Search Behavior

```typescript
async searchEntities(query: string, options: SearchOptions) {
  // Generate query embedding
  const queryEmbedding = await this.embeddingService.generate(query);

  // Search only entities with embeddings
  const results = await this.db.select()
    .from(entities)
    .where(and(
      isNotNull(entities.embedding),
      eq(entities.embeddingStatus, 'ready')
    ))
    // Vector similarity search
    .orderBy(cosineDistance(entities.embedding, queryEmbedding))
    .limit(options.limit);
}
```

### Pros

- ✅ Non-blocking entity creation (instant)
- ✅ Supports any embedding provider (OpenAI, Anthropic, Cohere)
- ✅ Better embedding quality with large models
- ✅ Graceful handling of API failures
- ✅ Can batch multiple embeddings for efficiency

### Cons

- ❌ Search incomplete until embeddings generated
- ❌ Requires job queue infrastructure
- ❌ More complex testing (async behavior)
- ❌ Potential for orphaned jobs
- ❌ Network dependency for core functionality

### Required Infrastructure

- Job queue (e.g., BullMQ, pg-boss, or simple SQLite table)
- Worker process or interval-based processor
- Retry logic for failed jobs
- Monitoring for queue health

## Option 2: Local Model Synchronous

### Architecture

```
Entity Creation → Generate embedding locally → Store complete entity
                         ↓
                   Local ML Model
```

### Implementation Details

```typescript
// Initialize on service startup
import { pipeline } from '@xenova/transformers';

class EmbeddingService {
  private model: any;

  async initialize() {
    // Load model once (23MB for MiniLM)
    this.model = await pipeline('feature-extraction',
      'Xenova/all-MiniLM-L6-v2');
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    return new Float32Array(output.data);
  }
}

// Entity creation flow
async createEntity(entity: T): Promise<T> {
  // Generate embedding synchronously
  const embedding = await this.embeddingService.generateEmbedding(markdown);

  // Store entity with embedding
  await this.db.insert(entities).values({
    ...entityData,
    embedding // Always populated
  });

  return entity;
}
```

### Model Options

| Model             | Size | Dimensions | Pi 5 Speed | Quality |
| ----------------- | ---- | ---------- | ---------- | ------- |
| all-MiniLM-L6-v2  | 23MB | 384        | ~300ms     | Good    |
| all-MiniLM-L12-v2 | 33MB | 384        | ~500ms     | Better  |
| gte-small         | 31MB | 384        | ~400ms     | Good    |
| e5-small-v2       | 33MB | 384        | ~450ms     | Better  |

### Pros

- ✅ Simple implementation (no queues)
- ✅ Embeddings always available immediately
- ✅ No network dependency
- ✅ Predictable performance
- ✅ Works offline
- ✅ No API costs

### Cons

- ❌ Slower entity creation (200-500ms on Pi 5)
- ❌ Lower quality than large models
- ❌ Memory footprint (~200MB)
- ❌ CPU spikes during generation
- ❌ Dimension mismatch if switching models

### Performance Impact

On Raspberry Pi 5:

- Model loading: ~5 seconds (once at startup)
- Per embedding: 200-500ms depending on text length
- Memory: ~200MB constant + spike during generation
- CPU: 100% on 1-2 cores during generation

## Hybrid Approach (Recommended)

### Best of Both Worlds

```typescript
class EmbeddingService {
  private localModel?: any;
  private useLocal: boolean;

  constructor(config: { mode: "local" | "async" | "auto" }) {
    this.useLocal =
      config.mode === "local" ||
      (config.mode === "auto" && !process.env.EMBEDDING_API_KEY);
  }

  async createEntity(entity: T): Promise<T> {
    if (this.useLocal) {
      // Sync local generation
      const embedding = await this.generateLocal(markdown);
      return this.storeWithEmbedding(entity, embedding);
    } else {
      // Async API generation
      const stored = await this.storeWithoutEmbedding(entity);
      await this.queueEmbeddingGeneration(stored.id, markdown);
      return stored;
    }
  }
}
```

### Configuration

```yaml
# Development (no API key)
embedding:
  mode: auto  # Uses local model

# Production with API
embedding:
  mode: async
  provider: openai
  model: text-embedding-3-small

# Constrained device
embedding:
  mode: local
  model: all-MiniLM-L6-v2
```

## Recommendation

**Start with async approach**, but design for pluggable embedding providers:

1. **Phase 1**: Async with any API provider (OpenAI, etc.)

   - Get core functionality working
   - Learn usage patterns
   - No performance constraints initially

2. **Phase 2**: Add local model support

   - Optional for development/offline use
   - Benchmark on target devices
   - Choose appropriate model size

3. **Phase 3**: Optimize based on usage
   - If embeddings are rarely updated → async is fine
   - If real-time needed → invest in local model optimization
   - If quality critical → stick with API models

## Implementation Checklist

### For Async Approach

- [ ] Add `embeddingStatus` field to schema
- [ ] Implement job queue (start simple with SQLite table)
- [ ] Create embedding service interface
- [ ] Handle pending embeddings in search
- [ ] Add retry logic for failures
- [ ] Monitor embedding generation lag

### For Local Approach

- [ ] Choose and test model on Pi 5
- [ ] Implement model loading/caching
- [ ] Add progress feedback for slow operations
- [ ] Handle memory constraints
- [ ] Plan model upgrade strategy

## Decision Factors

Choose **async** if:

- Embedding quality is critical
- Create operations can be non-blocking
- Have reliable network
- Can manage queue complexity

Choose **local** if:

- Need offline operation
- Want predictable performance
- Avoiding external dependencies
- Accept quality trade-offs

Choose **hybrid** if:

- Want flexibility
- Different requirements per deployment
- Gradual migration path needed
