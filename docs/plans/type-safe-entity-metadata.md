# Type-Safe Entity Metadata Refactor

## Problem Statement

Currently, `Entity.metadata` is typed as `Record<string, unknown>`, which provides no compile-time type safety when accessing metadata fields. This leads to:

- Runtime casts required everywhere (e.g., `entity.metadata["slug"] as string`)
- No autocomplete or IDE support for metadata fields
- Potential runtime errors from incorrect field access
- Self-documenting code is lacking (metadata shape not explicit)

## Example of Current Pain Point

```typescript
// Current approach - no type safety
const urlSlug =
  entity.metadata && "slug" in entity.metadata
    ? (entity.metadata["slug"] as string) // Required cast
    : entity.id;
```

## Proposed Solution

Make the `Entity` interface generic with a metadata type parameter, allowing each entity type to define its own strongly-typed metadata structure.

```typescript
interface Entity<TMetadata = Record<string, unknown>> {
  id: string;
  entityType: string;
  content: string;
  created: string;
  updated: string;
  metadata: TMetadata;
}
```

## Implementation Plan

### Phase 1: Core Types (packages/plugins)

**File**: `packages/plugins/src/types/entity.ts`

1. Update `Entity` interface to be generic:

   ```typescript
   export interface Entity<TMetadata = Record<string, unknown>> {
     id: string;
     entityType: string;
     content: string;
     created: string;
     updated: string;
     metadata: TMetadata;
   }
   ```

2. Update `EntityAdapter` to be generic:

   ```typescript
   export interface EntityAdapter<
     TEntity extends Entity<TMetadata>,
     TMetadata = Record<string, unknown>,
   > {
     entityType: string;
     schema: ZodSchema<TEntity>;
     toMarkdown(entity: TEntity): string;
     fromMarkdown(markdown: string): Partial<TEntity>;
     extractMetadata(entity: TEntity): TMetadata;
   }
   ```

3. Ensure backward compatibility with default generic parameter

### Phase 2: Entity Service (services/entity-service)

**File**: `services/entity-service/src/entity-service.ts`

1. Update `IEntityService` interface methods:

   ```typescript
   interface IEntityService {
     getEntity<T extends Entity>(
       entityType: string,
       id: string,
     ): Promise<T | null>;

     listEntities<T extends Entity>(
       entityType: string,
       options?: ListEntitiesOptions,
     ): Promise<T[]>;

     createEntity<T extends Entity>(
       entity: Partial<T>,
     ): Promise<CreateEntityResult<T>>;

     updateEntity<T extends Entity>(entity: T): Promise<UpdateEntityResult<T>>;
   }
   ```

2. Update filter types to support typed metadata:
   ```typescript
   interface ListEntitiesOptions<TMetadata = Record<string, unknown>> {
     filter?: {
       metadata?: Partial<TMetadata>;
     };
     limit?: number;
     offset?: number;
   }
   ```

### Phase 3: Blog Plugin (plugins/blog)

**File**: `plugins/blog/src/schemas/blog-post.ts`

1. Define typed metadata interface:

   ```typescript
   export interface BlogPostMetadata {
     title: string;
     slug: string;
     status: "draft" | "published";
     publishedAt?: string;
     seriesName?: string;
     seriesIndex?: number;
   }

   export interface BlogPost extends Entity<BlogPostMetadata> {
     entityType: "post";
   }
   ```

**File**: `plugins/blog/src/adapters/blog-post-adapter.ts`

2. Update adapter to use typed metadata:

   ```typescript
   export class BlogPostAdapter
     implements EntityAdapter<BlogPost, BlogPostMetadata>
   {
     public readonly entityType = "post" as const;
     public readonly schema = blogPostSchema;

     public extractMetadata(entity: BlogPost): BlogPostMetadata {
       return entity.metadata;
     }

     // No more casts needed!
     public fromMarkdown(markdown: string): Partial<BlogPost> {
       // ...
       return {
         content: markdown,
         entityType: "post",
         metadata: {
           title: frontmatter.title,
           slug, // TypeScript knows this is string
           status: frontmatter.status,
           publishedAt: frontmatter.publishedAt,
           seriesName: frontmatter.seriesName,
           seriesIndex: frontmatter.seriesIndex,
         },
       };
     }
   }
   ```

**File**: `plugins/blog/src/datasources/blog-datasource.ts`

3. Update datasource to use typed entities:
   ```typescript
   const entities = await this.entityService.listEntities<BlogPost>("post", {
     filter: {
       metadata: {
         slug, // TypeScript knows BlogPost has slug in metadata
       },
     },
     limit: 1,
   });
   ```

**File**: `plugins/blog/src/tools/publish.ts`

4. Update publish tool:
   ```typescript
   const posts = await context.entityService.listEntities<BlogPost>("post", {
     filter: {
       metadata: {
         slug, // No cast needed, TypeScript knows BlogPost.metadata has slug
       },
     },
     limit: 1,
   });
   ```

### Phase 4: Link Plugin (plugins/link)

**File**: `plugins/link/src/schemas/link.ts`

1. Define typed metadata:

   ```typescript
   export interface LinkMetadata {
     url: string;
     title: string;
     favicon?: string;
     // ... other fields
   }

   export interface Link extends Entity<LinkMetadata> {
     entityType: "link";
   }
   ```

2. Update adapter similarly to blog plugin

### Phase 5: Summary Plugin (plugins/summary)

**File**: `plugins/summary/src/schemas/summary.ts`

1. Define typed metadata:

   ```typescript
   export interface SummaryMetadata {
     date: string;
     summaryType: "daily" | "weekly" | "monthly";
     linkCount: number;
     topicCount: number;
   }

   export interface Summary extends Entity<SummaryMetadata> {
     entityType: "summary";
   }
   ```

2. Update adapter

### Phase 6: Topics Plugin (plugins/topics)

**File**: `plugins/topics/src/schemas/topic.ts`

1. Define typed metadata:

   ```typescript
   export interface TopicMetadata {
     name: string;
     linkCount: number;
     lastExtractedAt?: string;
   }

   export interface Topic extends Entity<TopicMetadata> {
     entityType: "topic";
   }
   ```

2. Update adapter

### Phase 7: Site Builder (plugins/site-builder)

**File**: `plugins/site-builder/src/lib/dynamic-route-generator.ts`

1. Remove casts using type constraints:

   ```typescript
   // Before: requires cast
   const urlSlug = entity.metadata["slug"] as string;

   // After: type-safe with constraint
   function hasSlug<T extends Entity<{ slug: string }>>(
     entity: Entity,
   ): entity is T {
     return (
       "slug" in entity.metadata && typeof entity.metadata.slug === "string"
     );
   }

   const urlSlug = hasSlug(entity) ? entity.metadata.slug : entity.id;
   ```

2. Or use generic constraint:

   ```typescript
   private async generateRoutesForEntityType<
     T extends Entity<Record<string, unknown> & { slug?: string }>
   >(entityType: string): Promise<void> {
     const entities = await this.context.entityService.listEntities<T>(
       entityType,
       { limit: 1000 }
     );

     for (const entity of entities) {
       // TypeScript knows entity.metadata.slug might exist
       const urlSlug = entity.metadata.slug ?? entity.id;
     }
   }
   ```

### Phase 8: Tests

Update all test files to use typed entities:

1. `plugins/blog/test/*.test.ts` - use `BlogPost` type
2. `plugins/link/test/*.test.ts` - use `Link` type
3. `plugins/summary/test/*.test.ts` - use `Summary` type
4. `plugins/topics/test/*.test.ts` - use `Topic` type
5. `plugins/site-builder/test/*.test.ts` - use type constraints

## Benefits

✅ **Full type safety** - Compile-time errors for wrong metadata fields
✅ **Autocomplete** - IDE suggestions for available metadata fields
✅ **Self-documenting** - Metadata shape is explicit in the type
✅ **Refactoring safety** - Renaming fields updates all usages
✅ **No runtime casts** - Type system handles everything
✅ **Better DX** - Developers know what metadata is available

## Backward Compatibility

- Default generic parameter `Record<string, unknown>` maintains compatibility
- Can migrate plugins incrementally
- No breaking changes for external code that doesn't specify the generic
- Existing code continues to work as-is

## Testing Strategy

1. Run all existing tests - should pass without changes
2. Add new type-safe test cases that verify compile-time errors
3. Verify no runtime regressions
4. Test each plugin independently after migration

## Risks and Mitigation

**Risk**: Breaking changes in entity service API
**Mitigation**: Use default generic parameters for backward compatibility

**Risk**: Complex generic constraints become unwieldy
**Mitigation**: Keep constraints simple, use helper type guards when needed

**Risk**: Migration takes too long
**Mitigation**: Migrate one plugin at a time, can be done incrementally

## Success Criteria

1. ✅ No `as string` or other casts in entity/metadata access code
2. ✅ All plugins have typed metadata interfaces
3. ✅ All tests pass
4. ✅ TypeScript strict mode passes
5. ✅ IDE autocomplete works for metadata fields

## Timeline Estimate

- Phase 1-2 (Core): 2-3 hours
- Phase 3 (Blog): 1-2 hours
- Phase 4-6 (Other plugins): 2-3 hours
- Phase 7 (Site builder): 1 hour
- Phase 8 (Tests): 1-2 hours

**Total**: ~8-12 hours of focused work

## Next Steps

1. ✅ Get approval for this plan
2. Create a feature branch: `feat/type-safe-entity-metadata`
3. Implement Phase 1-2 (core types)
4. Migrate blog plugin as proof of concept
5. Review and adjust approach if needed
6. Migrate remaining plugins
7. Update documentation
8. Merge to main
