# Plan: Entity Type Boosting for Search

## Problem

When AI generates content (e.g., LinkedIn posts), the entity search returns a mix of entity types (topics, posts, decks, projects). Topics often rank higher due to semantic similarity, but we want to prioritize "content" entities (posts, decks) over "metadata" entities (topics) for URL references.

## Current State

- `EntitySearch.search()` uses cosine similarity via libSQL vector functions
- `SearchOptions` supports `types` and `excludeTypes` filtering, but NO boosting
- Score calculation: `score = 1 - (distance / 2)` (0-1 range)
- `contentWeight` field exists on entities but is unused
- Plugins register entity types via `registerEntityType(type, schema, adapter)`

## Proposed Solution: Add searchBoost to Entity Type Registration

### Approach

1. Extend `registerEntityType` with optional config parameter including `searchBoost`
2. Store per-entity-type config in EntityRegistry
3. Add `boost` parameter to `SearchOptions`
4. EntitySearch applies boost during search using registry config
5. AIContentDataSource uses boost from EntityRegistry

### Key Files to Modify

1. **`shell/entity-service/src/types.ts`**
   - Add `EntityTypeConfig` interface with `weight?: number`
   - Update `EntityRegistry.registerEntityType` signature to accept config
   - Add `getEntityTypeConfig(type): EntityTypeConfig` method
   - Add `getWeightMap(): Record<string, number>` to `EntityRegistry`
   - Add `getWeightMap()` to `ICoreEntityService` (for AIContentDataSource access)
   - Add `weight?: Record<string, number>` to `SearchOptions`

2. **`shell/entity-service/src/entityRegistry.ts`**
   - Store entity type config when registering
   - Implement `getEntityTypeConfig()` and `getWeightMap()` methods

3. **`shell/entity-service/src/entityService.ts`**
   - Implement `getWeightMap()` delegating to registry

4. **`shell/entity-service/src/entity-search.ts`**
   - Accept weight in search options
   - Apply weight multipliers after fetching results
   - Re-sort by weighted scores

5. **`shell/core/src/datasources/ai-content-datasource.ts`**
   - Get weight map from EntityService
   - Pass to search options

6. **Plugins** (blog, decks, topics, etc.)
   - Add `weight` to registerEntityType calls

### Implementation Details

#### 1. Add EntityTypeConfig (entity-service/types.ts)

```typescript
export interface EntityTypeConfig {
  weight?: number; // Score multiplier for search (default: 1.0)
}

export interface EntityRegistry {
  registerEntityType<TEntity, TMetadata>(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity, TMetadata>,
    config?: EntityTypeConfig, // NEW optional parameter
  ): void;

  getEntityTypeConfig(type: string): EntityTypeConfig;
  getWeightMap(): Record<string, number>;
  // ... existing methods
}
```

#### 2. Update SearchOptions

```typescript
export interface SearchOptions {
  // ... existing fields
  weight?: Record<string, number>; // Score multipliers per entity type
}
```

#### 3. Apply Weighting in EntitySearch

```typescript
// When weight is provided, over-fetch then re-rank
const fetchLimit = options.weight ? limit * 3 : limit;

// After getting raw results...
if (options.weight && Object.keys(options.weight).length > 0) {
  results = results.map((r) => ({
    ...r,
    score: r.score * (options.weight![r.entity.entityType] ?? 1.0),
  }));
  results.sort((a, b) => b.score - a.score);
  results = results.slice(0, limit);
}
```

#### 4. Use in AIContentDataSource

```typescript
// Get weight map from entity service
const weightMap = this.entityService.getWeightMap();

const relevantEntities = searchTerms
  ? await this.entityService.search(searchTerms, {
      limit: 5,
      weight: Object.keys(weightMap).length > 0 ? weightMap : undefined,
    })
  : [];
```

#### 5. Configure in Plugins

```typescript
// plugins/blog/src/plugin.ts
context.registerEntityType("post", blogPostSchema, blogPostAdapter, {
  weight: 2.0, // Prioritize blog posts in search
});

// plugins/decks/src/plugin.ts
context.registerEntityType("deck", deckSchema, deckAdapter, {
  weight: 1.5, // Prioritize decks
});

// plugins/topics/src/index.ts
context.registerEntityType("topic", topicSchema, topicAdapter, {
  weight: 0.5, // Deprioritize topics
});
```

## Execution Steps

1. Add `EntityTypeConfig` interface to entity-service/types.ts
2. Update `EntityRegistry` interface with `config` param and new methods
3. **Write tests** for EntityRegistry config storage and `getWeightMap()`
4. Update `EntityRegistryImpl` to store and retrieve config (make tests pass)
5. Add `weight` to `SearchOptions` interface
6. **Write tests** for weighted search in EntitySearch
7. Implement weight logic in `EntitySearch.search()` (make tests pass)
8. Add `getWeightMap()` to `ICoreEntityService` and `EntityService`
9. Update `AIContentDataSource` to get weight map and pass to search
10. Update plugins to pass `weight` in registerEntityType
11. Run typecheck and full test suite
12. Run social-media eval to verify posts/decks get priority
